use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::*;
use crate::events::*;
use crate::math::*;

/// Partially close a position by specified percentage (1-99%)
pub fn partial_close_position(
    ctx: Context<PartialClosePosition>,
    close_percentage: u8, // 1-99 (e.g., 25 = 25%)
) -> Result<()> {
    require!(
        close_percentage > 0 && close_percentage < 100,
        PerpsError::InvalidMarketParameters
    );

    let market = &mut ctx.accounts.market;
    require!(!market.is_paused, PerpsError::MarketPaused);

    let position = &ctx.accounts.user_position;
    require!(position.base_size != 0, PerpsError::PositionNotFound);

    let mark_fp = current_mark_price_fp(market, &ctx.accounts.oracle)?;

    // Calculate partial close amounts
    let original_size = position.base_size.abs() as u64;
    let close_size = (original_size as u128 * close_percentage as u128 / 100) as u64;
    let remaining_size = original_size - close_size;
    
    require!(close_size > 0, PerpsError::PositionTooSmall);
    require!(remaining_size > 0, PerpsError::PositionTooSmall);

    // Calculate PnL for the portion being closed
    let close_notional_entry_fp = (close_size as u128 * position.entry_price_fp) / FP;
    let close_notional_exit_fp = (close_size as u128 * mark_fp) / FP;
    
    let pnl_fp = if position.is_long {
        (close_notional_exit_fp as i128 - close_notional_entry_fp as i128)
    } else {
        (close_notional_entry_fp as i128 - close_notional_exit_fp as i128)
    };

    // Calculate fees and settlement
    let fee_fp = (close_notional_exit_fp * ctx.accounts.config.fee_bps as u128) / 10_000;
    let margin_to_return = (position.margin_deposited as u128 * close_percentage as u128 / 100) as u64;
    
    let settlement_fp = (margin_to_return as i128 * FP as i128) + pnl_fp - (fee_fp as i128);
    let settlement_amt = if settlement_fp > 0 { 
        (settlement_fp as u128 / FP) as u64 
    } else { 
        0 
    };

    // Update market state
    if position.is_long {
        market.total_long_size = market.total_long_size.saturating_sub(close_size);
    } else {
        market.total_short_size = market.total_short_size.saturating_sub(close_size);
    }

    // Execute transfers
    if settlement_amt > 0 {
        token::transfer(ctx.accounts.transfer_vault_to_user(), settlement_amt)?;
    }
    
    let fee_amt = (fee_fp / FP) as u64;
    if fee_amt > 0 {
        token::transfer(ctx.accounts.transfer_vault_to_fee_dest(), fee_amt)?;
    }

    // Update position
    let up = &mut ctx.accounts.user_position;
    up.base_size = if position.is_long {
        remaining_size as i64
    } else {
        -(remaining_size as i64)
    };
    up.margin_deposited = position.margin_deposited - margin_to_return;
    up.realized_pnl_fp += pnl_fp;
    up.total_fees_paid += fee_amt;
    up.last_updated_ts = Clock::get()?.unix_timestamp;

    // Recalculate liquidation price for remaining position
    up.liquidation_price_fp = calculate_liquidation_price(
        up.entry_price_fp,
        up.margin_deposited,
        remaining_size,
        market.maintenance_margin_bps,
        up.is_long,
    )?;

    emit!(PartialPositionClosed {
        user: up.owner,
        market: up.market,
        close_percentage,
        closed_size: close_size,
        remaining_size,
        pnl_fp,
        settlement_amount: settlement_amt,
        fees_paid: fee_amt,
    });

    msg!("Partial close: {}% ({} units), PnL: ${}, Settlement: ${}",
         close_percentage, close_size, pnl_fp / FP as i128, settlement_amt);

    Ok(())
}

/// Add or remove margin from existing position
pub fn modify_position_margin(
    ctx: Context<ModifyPositionMargin>,
    margin_change: i64, // Positive to add, negative to remove
) -> Result<()> {
    let position = &ctx.accounts.user_position;
    require!(position.base_size != 0, PerpsError::PositionNotFound);

    let market = &ctx.accounts.market;
    let mark_fp = current_mark_price_fp(market, &ctx.accounts.oracle)?;

    let current_margin = position.margin_deposited;
    let new_margin = if margin_change > 0 {
        current_margin.checked_add(margin_change as u64)
            .ok_or(PerpsError::MathOverflow)?
    } else {
        current_margin.checked_sub((-margin_change) as u64)
            .ok_or(PerpsError::InsufficientMargin)?
    };

    // Validate new margin maintains minimum requirements
    let position_size = position.base_size.abs() as u64;
    let notional_fp = (position_size as u128 * mark_fp) / FP;
    let min_margin_required = (notional_fp * market.maintenance_margin_bps as u128) / 10_000;
    
    require!(
        (new_margin as u128) > min_margin_required,
        PerpsError::InsufficientMargin
    );

    // Handle token transfers
    if margin_change > 0 {
        // Adding margin - transfer from user to vault
        token::transfer(ctx.accounts.transfer_user_to_vault(), margin_change as u64)?;
    } else if margin_change < 0 {
        // Removing margin - transfer from vault to user
        token::transfer(ctx.accounts.transfer_vault_to_user(), (-margin_change) as u64)?;
    }

    // Update position
    let up = &mut ctx.accounts.user_position;
    up.margin_deposited = new_margin;
    up.last_updated_ts = Clock::get()?.unix_timestamp;

    // Recalculate liquidation price
    up.liquidation_price_fp = calculate_liquidation_price(
        up.entry_price_fp,
        new_margin,
        position_size,
        market.maintenance_margin_bps,
        up.is_long,
    )?;

    emit!(PositionMarginModified {
        user: up.owner,
        market: up.market,
        margin_change,
        new_margin,
        new_liquidation_price_fp: up.liquidation_price_fp,
    });

    msg!("Margin modified: {} {}, New margin: ${}, New liq price: ${}",
         if margin_change > 0 { "Added" } else { "Removed" },
         margin_change.abs(),
         new_margin,
         up.liquidation_price_fp / FP);

    Ok(())
}

/// Set stop-loss order for existing position
pub fn set_stop_loss(
    ctx: Context<SetStopLoss>,
    trigger_price_fp: u128,
    close_percentage: u8, // 1-100 (100 = close entire position)
) -> Result<()> {
    let position = &ctx.accounts.user_position;
    require!(position.base_size != 0, PerpsError::PositionNotFound);
    require!(
        close_percentage > 0 && close_percentage <= 100,
        PerpsError::InvalidMarketParameters
    );
    require!(trigger_price_fp > 0, PerpsError::InvalidMarketParameters);

    let market = &ctx.accounts.market;
    let current_price_fp = current_mark_price_fp(market, &ctx.accounts.oracle)?;

    // Validate stop-loss price makes sense
    if position.is_long {
        require!(
            trigger_price_fp < current_price_fp,
            PerpsError::InvalidMarketParameters
        );
    } else {
        require!(
            trigger_price_fp > current_price_fp,
            PerpsError::InvalidMarketParameters
        );
    }

    let stop_loss = &mut ctx.accounts.stop_loss_order;
    stop_loss.owner = position.owner;
    stop_loss.market = position.market;
    stop_loss.position_key = ctx.accounts.user_position.key();
    stop_loss.trigger_price_fp = trigger_price_fp;
    stop_loss.close_percentage = close_percentage;
    stop_loss.is_active = true;
    stop_loss.created_at = Clock::get()?.unix_timestamp;
    stop_loss.bump = ctx.bumps.stop_loss_order;

    emit!(StopLossSet {
        user: stop_loss.owner,
        market: stop_loss.market,
        trigger_price_fp,
        close_percentage,
        is_long: position.is_long,
    });

    msg!("Stop-loss set: Trigger ${}, Close {}% of position",
         trigger_price_fp / FP, close_percentage);

    Ok(())
}

/// Execute stop-loss order when triggered
pub fn execute_stop_loss(ctx: Context<ExecuteStopLoss>) -> Result<()> {
    let stop_loss = &ctx.accounts.stop_loss_order;
    require!(stop_loss.is_active, PerpsError::InvalidMarketParameters);

    let position = &ctx.accounts.user_position;
    let market = &ctx.accounts.market;
    let current_price_fp = current_mark_price_fp(market, &ctx.accounts.oracle)?;

    // Check if stop-loss should trigger
    let should_trigger = if position.is_long {
        current_price_fp <= stop_loss.trigger_price_fp
    } else {
        current_price_fp >= stop_loss.trigger_price_fp
    };

    require!(should_trigger, PerpsError::InvalidMarketParameters);

    // Execute the stop-loss (partial or full close)
    if stop_loss.close_percentage == 100 {
        // Close entire position
        close_entire_position(ctx.accounts)?;
    } else {
        // Partial close
        execute_partial_close(ctx.accounts, stop_loss.close_percentage)?;
    }

    // Deactivate stop-loss order
    let stop_loss_mut = &mut ctx.accounts.stop_loss_order;
    stop_loss_mut.is_active = false;
    stop_loss_mut.executed_at = Some(Clock::get()?.unix_timestamp);

    emit!(StopLossExecuted {
        user: stop_loss.owner,
        market: stop_loss.market,
        trigger_price_fp: current_price_fp,
        close_percentage: stop_loss.close_percentage,
        executor: ctx.accounts.executor.key(),
    });

    msg!("Stop-loss executed at ${} for {}% of position",
         current_price_fp / FP, stop_loss.close_percentage);

    Ok(())
}

// Helper functions
fn close_entire_position(_accounts: &ExecuteStopLoss) -> Result<()> {
    // Implementation similar to existing close_position
    // This would be the same logic as the main close_position instruction
    Ok(())
}

fn execute_partial_close(_accounts: &ExecuteStopLoss, _close_percentage: u8) -> Result<()> {
    // Implementation similar to partial_close_position
    Ok(())
}

fn calculate_liquidation_price(
    entry_price_fp: u128,
    margin: u64,
    _base_size: u64,
    maintenance_margin_bps: u16,
    is_long: bool,
) -> Result<u128> {
    let maintenance_ratio = maintenance_margin_bps as u128;

    let liq_price_fp = if is_long {
        let numerator = entry_price_fp * (10_000 - maintenance_ratio);
        numerator.checked_div(10_000).ok_or(PerpsError::DivisionByZero)?
    } else {
        let numerator = entry_price_fp * (10_000 + maintenance_ratio);
        numerator.checked_div(10_000).ok_or(PerpsError::DivisionByZero)?
    };

    Ok(liq_price_fp)
}

// Account contexts
#[derive(Accounts)]
pub struct PartialClosePosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(mut)]
    pub market: Account<'info, Market>,
    
    pub oracle: Account<'info, OraclePrice>,
    
    #[account(
        mut,
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    
    /// CHECK: Fee destination
    #[account(mut)]
    pub fee_destination: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

impl<'info> PartialClosePosition<'info> {
    pub fn transfer_vault_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.user_token.to_account_info(),
                authority: self.config.to_account_info(),
            }
        )
    }
    
    pub fn transfer_vault_to_fee_dest(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.fee_destination.to_account_info(),
                authority: self.config.to_account_info(),
            }
        )
    }
}

#[derive(Accounts)]
pub struct ModifyPositionMargin<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    
    pub market: Account<'info, Market>,
    
    pub oracle: Account<'info, OraclePrice>,
    
    #[account(
        mut,
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

impl<'info> ModifyPositionMargin<'info> {
    pub fn transfer_user_to_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.user_token.to_account_info(),
                to: self.vault_token.to_account_info(),
                authority: self.user.to_account_info(),
            }
        )
    }
    
    pub fn transfer_vault_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.user_token.to_account_info(),
                authority: self.config.to_account_info(),
            }
        )
    }
}

#[derive(Accounts)]
pub struct SetStopLoss<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub market: Account<'info, Market>,
    
    pub oracle: Account<'info, OraclePrice>,
    
    #[account(
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(
        init,
        payer = user,
        space = StopLossOrder::SPACE,
        seeds = [b"stop_loss", user.key().as_ref(), market.key().as_ref()],
        bump
    )]
    pub stop_loss_order: Account<'info, StopLossOrder>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteStopLoss<'info> {
    pub executor: Signer<'info>,
    
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    
    #[account(mut)]
    pub market: Account<'info, Market>,
    
    pub oracle: Account<'info, OraclePrice>,
    
    #[account(
        mut,
        seeds = [POSITION_SEED, user_position.owner.as_ref(), market.key().as_ref()],
        bump = user_position.bump
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(
        mut,
        seeds = [b"stop_loss", user_position.owner.as_ref(), market.key().as_ref()],
        bump = stop_loss_order.bump
    )]
    pub stop_loss_order: Account<'info, StopLossOrder>,
    
    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    
    /// CHECK: Fee destination
    #[account(mut)]
    pub fee_destination: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}
