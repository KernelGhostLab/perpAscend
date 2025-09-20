use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::errors::PerpsError;
use crate::events::*;
use crate::oracle;
use crate::math::*;

// Advanced position management functions

pub fn partial_close_position(
    ctx: Context<PartialClosePosition>,
    close_percentage: u8, // 1-99 (e.g., 25 = 25%)
) -> Result<()> {
    require!(
        close_percentage > 0 && close_percentage < 100,
        PerpsError::InvalidMarketParameters
    );

    require!(!ctx.accounts.market.is_paused, PerpsError::MarketPaused);
    require!(ctx.accounts.user_position.base_size != 0, PerpsError::PositionNotFound);

    let mark_fp = current_mark_price_fp(&ctx.accounts.market, &ctx.accounts.oracle)?;

    // Store values before borrowing mutably
    let position_is_long = ctx.accounts.user_position.is_long;
    let position_entry_price_fp = ctx.accounts.user_position.entry_price_fp;
    let position_base_size = ctx.accounts.user_position.base_size;
    let market_fee_bps = ctx.accounts.market.fee_bps;
    let market_maintenance_margin_bps = ctx.accounts.market.maintenance_margin_bps;

    // Calculate partial close amounts
    let original_size = position_base_size.abs() as u64;
    let close_size = (original_size as u128 * close_percentage as u128 / 100) as u64;
    let remaining_size = original_size - close_size;
    
    require!(close_size > 0, PerpsError::PositionTooSmall);
    require!(remaining_size > 0, PerpsError::PositionTooSmall);

    // Calculate PnL for the portion being closed
    let close_notional_entry_fp = (close_size as u128 * position_entry_price_fp) / FP;
    let close_notional_exit_fp = (close_size as u128 * mark_fp) / FP;
    
    let pnl_fp = if position_is_long {
        close_notional_exit_fp as i128 - close_notional_entry_fp as i128
    } else {
        close_notional_entry_fp as i128 - close_notional_exit_fp as i128
    };

    // Calculate settlement and fees
    let fee_amt = (close_notional_exit_fp * market_fee_bps as u128) / (10_000 * FP);
    let settlement_amt = if pnl_fp >= 0 {
        (close_notional_exit_fp - fee_amt) + pnl_fp as u128
    } else {
        (close_notional_exit_fp - fee_amt) - (-pnl_fp) as u128
    };

    // Perform transfers
    token::transfer(ctx.accounts.transfer_vault_to_user(), (settlement_amt / FP) as u64)?;
    
    if fee_amt > 0 {
        token::transfer(ctx.accounts.transfer_vault_to_fee_dest(), (fee_amt / FP) as u64)?;
    }

    // Update position - now we can borrow mutably
    {
        let up = &mut ctx.accounts.user_position;
        up.base_size = if position_is_long {
            position_base_size - close_size as i64
        } else {
            position_base_size + close_size as i64
        };
        
        // Recalculate collateral proportionally
        let remaining_ratio = remaining_size as u128 * FP / original_size as u128;
        up.collateral_amount = (up.collateral_amount as u128 * remaining_ratio / FP) as u64;
    }

    // Update market
    {
        let market_mut = &mut ctx.accounts.market;
        market_mut.open_interest = market_mut.open_interest.saturating_sub(close_size);
    }

    // Health check
    oracle::health_check(
        &ctx.accounts.oracle,
        mark_fp,
        market_maintenance_margin_bps,
    )?;

    emit!(PositionUpdated {
        user: ctx.accounts.user.key(),
        position: ctx.accounts.user_position.clone(),
    });

    Ok(())
}

pub fn modify_position_margin(
    ctx: Context<ModifyPositionMargin>,
    margin_change: i64, // Positive to add, negative to remove
) -> Result<()> {
    require!(!ctx.accounts.market.is_paused, PerpsError::MarketPaused);
    require!(ctx.accounts.user_position.base_size != 0, PerpsError::PositionNotFound);

    let mark_fp = current_mark_price_fp(&ctx.accounts.market, &ctx.accounts.oracle)?;
    let current_collateral = ctx.accounts.user_position.collateral_amount;
    
    if margin_change > 0 {
        // Adding margin
        let add_amount = margin_change as u64;
        token::transfer(ctx.accounts.transfer_user_to_vault(), add_amount)?;
        
        let up = &mut ctx.accounts.user_position;
        up.collateral_amount = current_collateral.saturating_add(add_amount);
        
        emit!(MarginAdded {
            user: ctx.accounts.user.key(),
            amount: add_amount,
            new_collateral: up.collateral_amount,
        });
    } else if margin_change < 0 {
        // Removing margin
        let remove_amount = (-margin_change) as u64;
        require!(current_collateral > remove_amount, PerpsError::InsufficientFunds);
        
        let new_collateral = current_collateral - remove_amount;
        
        // Check if position would still be healthy after margin removal
        let position_base_size = ctx.accounts.user_position.base_size;
        let position_entry_price_fp = ctx.accounts.user_position.entry_price_fp;
        let position_is_long = ctx.accounts.user_position.is_long;
        
        let notional_fp = (position_base_size.abs() as u128 * mark_fp) / FP;
        let required_margin = (notional_fp * ctx.accounts.market.maintenance_margin_bps as u128) / 10_000;
        
        require!(new_collateral as u128 >= required_margin, PerpsError::WouldBeLiquidated);
        
        // Transfer margin back to user
        token::transfer(ctx.accounts.transfer_vault_to_user(), remove_amount)?;
        
        let up = &mut ctx.accounts.user_position;
        up.collateral_amount = new_collateral;
        
        emit!(MarginRemoved {
            user: ctx.accounts.user.key(),
            amount: remove_amount,
            new_collateral: up.collateral_amount,
        });
    }

    // Health check
    oracle::health_check(
        &ctx.accounts.oracle,
        mark_fp,
        ctx.accounts.market.maintenance_margin_bps,
    )?;

    Ok(())
}

pub fn set_stop_loss(
    ctx: Context<SetStopLoss>,
    trigger_price_fp: u128,
    close_percentage: u8, // 1-100 (100 = close entire position)
) -> Result<()> {
    require!(
        close_percentage > 0 && close_percentage <= 100,
        PerpsError::InvalidMarketParameters
    );
    require!(ctx.accounts.user_position.base_size != 0, PerpsError::PositionNotFound);
    require!(trigger_price_fp > 0, PerpsError::InvalidPrice);

    // Validate stop loss direction
    let position_is_long = ctx.accounts.user_position.is_long;
    let current_price_fp = current_mark_price_fp(&ctx.accounts.market, &ctx.accounts.oracle)?;
    
    if position_is_long {
        require!(trigger_price_fp < current_price_fp, PerpsError::InvalidStopLoss);
    } else {
        require!(trigger_price_fp > current_price_fp, PerpsError::InvalidStopLoss);
    }

    // Store stop loss details
    let stop_loss_order_key = ctx.accounts.stop_loss_order.key();
    let position_owner = ctx.accounts.user_position.owner;
    
    {
        let stop_loss_mut = &mut ctx.accounts.stop_loss_order;
        stop_loss_mut.owner = position_owner;
        stop_loss_mut.position = ctx.accounts.user_position.key();
        stop_loss_mut.trigger_price_fp = trigger_price_fp;
        stop_loss_mut.close_percentage = close_percentage;
        stop_loss_mut.is_active = true;
    }

    emit!(StopLossSet {
        user: position_owner,
        trigger_price_fp,
        close_percentage,
    });

    Ok(())
}

pub fn execute_stop_loss(ctx: Context<ExecuteStopLoss>) -> Result<()> {
    require!(ctx.accounts.stop_loss_order.is_active, PerpsError::OrderNotActive);
    require!(!ctx.accounts.market.is_paused, PerpsError::MarketPaused);

    let mark_fp = current_mark_price_fp(&ctx.accounts.market, &ctx.accounts.oracle)?;
    
    // Check if stop loss should be triggered
    let trigger_price_fp = ctx.accounts.stop_loss_order.trigger_price_fp;
    let position_is_long = ctx.accounts.user_position.is_long;
    
    let should_trigger = if position_is_long {
        mark_fp <= trigger_price_fp
    } else {
        mark_fp >= trigger_price_fp
    };
    
    require!(should_trigger, PerpsError::StopLossNotTriggered);

    // Execute partial close based on stop loss percentage
    let close_percentage = ctx.accounts.stop_loss_order.close_percentage;
    
    // Similar logic to partial_close_position but with stop loss specific handling
    let position_base_size = ctx.accounts.user_position.base_size;
    let position_entry_price_fp = ctx.accounts.user_position.entry_price_fp;
    
    let original_size = position_base_size.abs() as u64;
    let close_size = (original_size as u128 * close_percentage as u128 / 100) as u64;
    
    // Calculate PnL and settlement
    let close_notional_entry_fp = (close_size as u128 * position_entry_price_fp) / FP;
    let close_notional_exit_fp = (close_size as u128 * mark_fp) / FP;
    
    let pnl_fp = if position_is_long {
        close_notional_exit_fp as i128 - close_notional_entry_fp as i128
    } else {
        close_notional_entry_fp as i128 - close_notional_exit_fp as i128
    };

    let market_fee_bps = ctx.accounts.market.fee_bps;
    let fee_amt = (close_notional_exit_fp * market_fee_bps as u128) / (10_000 * FP);
    let settlement_amt = if pnl_fp >= 0 {
        (close_notional_exit_fp - fee_amt) + pnl_fp as u128
    } else {
        (close_notional_exit_fp - fee_amt) - (-pnl_fp) as u128
    };

    // Perform transfers
    token::transfer(ctx.accounts.transfer_vault_to_user(), (settlement_amt / FP) as u64)?;
    
    if fee_amt > 0 {
        token::transfer(ctx.accounts.transfer_vault_to_fee_dest(), (fee_amt / FP) as u64)?;
    }

    // Update position
    {
        let up = &mut ctx.accounts.user_position;
        up.base_size = if position_is_long {
            position_base_size - close_size as i64
        } else {
            position_base_size + close_size as i64
        };
        
        if close_percentage == 100 || up.base_size == 0 {
            up.base_size = 0;
            up.collateral_amount = 0;
            up.is_long = false;
            up.entry_price_fp = 0;
        } else {
            let remaining_size = original_size - close_size;
            let remaining_ratio = remaining_size as u128 * FP / original_size as u128;
            up.collateral_amount = (up.collateral_amount as u128 * remaining_ratio / FP) as u64;
        }
    }

    // Update market
    {
        let market_mut = &mut ctx.accounts.market;
        market_mut.open_interest = market_mut.open_interest.saturating_sub(close_size);
    }

    // Deactivate stop loss order
    {
        let stop_loss_mut = &mut ctx.accounts.stop_loss_order;
        stop_loss_mut.is_active = false;
    }

    emit!(StopLossExecuted {
        user: ctx.accounts.user_position.owner,
        trigger_price_fp,
        close_percentage,
        executed_price_fp: mark_fp,
    });

    Ok(())
}

// Context structures

#[derive(Accounts)]
pub struct PartialClosePosition<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.symbol.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        has_one = user,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump = config.vault_bump,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = config.fee_destination
    )]
    pub fee_destination_token: Account<'info, TokenAccount>,

    pub oracle: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ModifyPositionMargin<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [MARKET_SEED, market.symbol.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        has_one = user,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump = config.vault_bump,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,

    pub oracle: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetStopLoss<'info> {
    #[account(
        seeds = [MARKET_SEED, market.symbol.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [USER_POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        has_one = user,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [STOP_LOSS_SEED, user.key().as_ref(), market.key().as_ref()],
        bump,
        space = 8 + StopLossOrder::LEN,
    )]
    pub stop_loss_order: Account<'info, StopLossOrder>,

    pub oracle: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteStopLoss<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.symbol.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(mut)]
    pub executor: Signer<'info>, // Can be anyone

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, user_position.user.as_ref(), market.key().as_ref()],
        bump = user_position.bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [STOP_LOSS_SEED, user_position.user.as_ref(), market.key().as_ref()],
        bump = stop_loss_order.bump,
        has_one = user_position @ PerpsError::InvalidStopLoss,
    )]
    pub stop_loss_order: Account<'info, StopLossOrder>,

    #[account(
        mut,
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump = config.vault_bump,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token.owner == user_position.user
    )]
    pub user_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = config.fee_destination
    )]
    pub fee_destination_token: Account<'info, TokenAccount>,

    pub oracle: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

// Helper implementations for transfer contexts
impl<'info> PartialClosePosition<'info> {
    pub fn transfer_vault_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let bump = &[self.config.bump];
        let seeds = &[&[CONFIG_SEED, bump][..]];
        CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.user_token.to_account_info(),
                authority: self.config.to_account_info(),
            },
            &[seeds]
        )
    }

    pub fn transfer_vault_to_fee_dest(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let bump = &[self.config.bump];
        let seeds = &[&[CONFIG_SEED, bump][..]];
        CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.fee_destination_token.to_account_info(),
                authority: self.config.to_account_info(),
            },
            &[seeds]
        )
    }
}

impl<'info> ModifyPositionMargin<'info> {
    pub fn transfer_user_to_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.user_token.to_account_info(),
                to: self.vault_token.to_account_info(),
                authority: self.user.to_account_info(),
            },
        )
    }

    pub fn transfer_vault_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let bump = &[self.config.bump];
        let seeds = &[&[CONFIG_SEED, bump][..]];
        CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.user_token.to_account_info(),
                authority: self.config.to_account_info(),
            },
            &[seeds]
        )
    }
}

impl<'info> ExecuteStopLoss<'info> {
    pub fn transfer_vault_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let bump = &[self.config.bump];
        let seeds = &[&[CONFIG_SEED, bump][..]];
        CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.user_token.to_account_info(),
                authority: self.config.to_account_info(),
            },
            &[seeds]
        )
    }

    pub fn transfer_vault_to_fee_dest(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let bump = &[self.config.bump];
        let seeds = &[&[CONFIG_SEED, bump][..]];
        CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            Transfer {
                from: self.vault_token.to_account_info(),
                to: self.fee_destination_token.to_account_info(),
                authority: self.config.to_account_info(),
            },
            &[seeds]
        )
    }
}
