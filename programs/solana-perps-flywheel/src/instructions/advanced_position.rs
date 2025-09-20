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
        PerpsError::InvalidClosePercentage
    );

    require!(!ctx.accounts.market.is_paused, PerpsError::MarketPaused);
    require!(ctx.accounts.user_position.base_size != 0, PerpsError::PositionNotFound);

    // Get current mark price from oracle
    let mark_fp = oracle::read_oracle_fp(&ctx.accounts.oracle)?;

    // Calculate close amounts
    let original_size = ctx.accounts.user_position.base_size.abs() as u64;
    let close_size = (original_size as u128 * close_percentage as u128 / 100) as u64;
    
    require!(close_size > 0, PerpsError::PositionTooSmall);

    // Calculate PnL for the portion being closed
    let close_notional_entry_fp = (close_size as u128 * ctx.accounts.user_position.entry_price_fp) / FP;
    let close_notional_exit_fp = (close_size as u128 * mark_fp) / FP;
    
    let pnl_fp = if ctx.accounts.user_position.is_long {
        close_notional_exit_fp as i128 - close_notional_entry_fp as i128
    } else {
        close_notional_entry_fp as i128 - close_notional_exit_fp as i128
    };

    // Calculate fees (using Config fee_bps)
    let fee_amt = (close_notional_exit_fp * ctx.accounts.config.fee_bps as u128) / (10_000 * FP);
    
    let settlement_amt = if pnl_fp >= 0 {
        (close_notional_exit_fp - fee_amt) + pnl_fp as u128
    } else {
        (close_notional_exit_fp - fee_amt).saturating_sub((-pnl_fp) as u128)
    };

    // Perform transfers
    if settlement_amt > 0 {
        let config_bump = ctx.accounts.config.bump;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&[CONFIG_SEED, &[config_bump]]]
            ),
            (settlement_amt / FP) as u64
        )?;
    }
    
    if fee_amt > 0 {
        let config_bump = ctx.accounts.config.bump;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.fee_destination_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&[CONFIG_SEED, &[config_bump]]]
            ),
            (fee_amt / FP) as u64
        )?;
    }

    // Update position
    let remaining_size = original_size - close_size;
    ctx.accounts.user_position.base_size = if ctx.accounts.user_position.is_long {
        ctx.accounts.user_position.base_size - close_size as i64
    } else {
        ctx.accounts.user_position.base_size + close_size as i64
    };
    
    // Recalculate margin proportionally
    let remaining_ratio = remaining_size as u128 * FP / original_size as u128;
    ctx.accounts.user_position.margin_deposited = 
        (ctx.accounts.user_position.margin_deposited as u128 * remaining_ratio / FP) as u64;

    // Update market totals
    if ctx.accounts.user_position.is_long {
        ctx.accounts.market.total_long_size = ctx.accounts.market.total_long_size.saturating_sub(close_size);
    } else {
        ctx.accounts.market.total_short_size = ctx.accounts.market.total_short_size.saturating_sub(close_size);
    }

    // Health check
        // Health check to ensure position remains valid
            // Health check after position modification
    // TODO: Fix health_check lifetime issue
    // Final health check
    // TODO: Fix health_check lifetime issue
    // oracle::health_check(
    //     &ctx.accounts.oracle.to_account_info(),
    //     mark_fp,
    //     ctx.accounts.market.maintenance_margin_bps,
    // )?;

    emit!(PartialPositionClosed {
        user: ctx.accounts.user.key(),
        market: ctx.accounts.market.key(),
        close_percentage,
        closed_size: close_size,
        remaining_size,
        pnl_fp,
        settlement_amount: (settlement_amt / FP) as u64,
        fees_paid: (fee_amt / FP) as u64,
    });

    Ok(())
}

pub fn modify_position_margin(
    ctx: Context<ModifyPositionMargin>,
    margin_change: i64, // Positive to add, negative to remove
) -> Result<()> {
    require!(!ctx.accounts.market.is_paused, PerpsError::MarketPaused);
    require!(ctx.accounts.user_position.base_size != 0, PerpsError::PositionNotFound);

    let mark_fp = oracle::read_oracle_fp(&ctx.accounts.oracle)?;
    
    if margin_change > 0 {
        // Adding margin
        let add_amount = margin_change as u64;
        // Transfer margin from user to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token.to_account_info(),
                    to: ctx.accounts.vault_token.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            add_amount
        )?;
        
        ctx.accounts.user_position.margin_deposited = 
            ctx.accounts.user_position.margin_deposited.saturating_add(add_amount);
        
        emit!(MarginAdded {
            user: ctx.accounts.user.key(),
            amount: add_amount,
            new_collateral: ctx.accounts.user_position.margin_deposited,
        });
    } else if margin_change < 0 {
        // Removing margin
        let remove_amount = (-margin_change) as u64;
        require!(ctx.accounts.user_position.margin_deposited > remove_amount, PerpsError::InsufficientFunds);
        
        let new_margin = ctx.accounts.user_position.margin_deposited - remove_amount;
        
        // Check if position would still be healthy after margin removal
        let notional_fp = (ctx.accounts.user_position.base_size.abs() as u128 * mark_fp) / FP;
        let required_margin = (notional_fp * ctx.accounts.market.maintenance_margin_bps as u128) / 10_000;
        
        require!(new_margin as u128 >= required_margin, PerpsError::WouldBeLiquidated);
        
        // Transfer margin back to user
        let config_bump = ctx.accounts.config.bump;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&[CONFIG_SEED, &[config_bump]]]
            ),
            remove_amount
        )?;
        
        ctx.accounts.user_position.margin_deposited = new_margin;
        
        emit!(MarginRemoved {
            user: ctx.accounts.user.key(),
            amount: remove_amount,
            new_collateral: ctx.accounts.user_position.margin_deposited,
        });
    }

    // Health check
    // TODO: Fix health_check lifetime issue
    // let oracle_info = ctx.accounts.oracle.to_account_info();
    // oracle::health_check(
    //     &oracle_info,
    //     mark_fp,
    //     ctx.accounts.market.maintenance_margin_bps,
    // )?;

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
    let current_price_fp = oracle::read_oracle_fp(&ctx.accounts.oracle)?;
    
    if ctx.accounts.user_position.is_long {
        require!(trigger_price_fp < current_price_fp, PerpsError::InvalidStopLoss);
    } else {
        require!(trigger_price_fp > current_price_fp, PerpsError::InvalidStopLoss);
    }

    // Set stop loss order details
    ctx.accounts.stop_loss_order.owner = ctx.accounts.user_position.owner;
    ctx.accounts.stop_loss_order.market = ctx.accounts.market.key();
    ctx.accounts.stop_loss_order.position_key = ctx.accounts.user_position.key();
    ctx.accounts.stop_loss_order.trigger_price_fp = trigger_price_fp;
    ctx.accounts.stop_loss_order.close_percentage = close_percentage;
    ctx.accounts.stop_loss_order.is_active = true;
    ctx.accounts.stop_loss_order.created_at = Clock::get()?.unix_timestamp;
    ctx.accounts.stop_loss_order.executed_at = None;

    emit!(StopLossSet {
        user: ctx.accounts.user_position.owner,
        market: ctx.accounts.market.key(),
        trigger_price_fp,
        close_percentage,
        is_long: ctx.accounts.user_position.is_long,
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
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ PerpsError::UnauthorizedAccess,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump = config.bump,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = config.fee_destination
    )]
    pub fee_destination_token: Account<'info, TokenAccount>,

    pub oracle: Account<'info, OraclePrice>,
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
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ PerpsError::UnauthorizedAccess,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump = config.bump,
    )]
    pub vault_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,

    pub oracle: Account<'info, OraclePrice>,
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
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.owner == user.key() @ PerpsError::UnauthorizedAccess,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [STOP_LOSS_SEED, user.key().as_ref(), market.key().as_ref()],
        bump,
        space = StopLossOrder::SPACE,
    )]
    pub stop_loss_order: Account<'info, StopLossOrder>,

    pub oracle: Account<'info, OraclePrice>,
    pub system_program: Program<'info, System>,
}
