use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::*;
use crate::events::*;
use crate::math::*;
use crate::oracle;

/// Enhanced liquidation with partial liquidation support
pub fn enhanced_liquidate(
    mut ctx: Context<EnhancedLiquidate>,
    max_liquidation_percentage: u8,
) -> Result<()> {
    require!(
        max_liquidation_percentage > 0 && max_liquidation_percentage <= 100,
        PerpsError::InvalidMarketParameters
    );

    // Store values before borrowing mutably
    let market_is_paused = ctx.accounts.market.is_paused;
    let market_maintenance_margin_bps = ctx.accounts.market.maintenance_margin_bps;
    let market_fee_bps = ctx.accounts.config.fee_bps;
    
    require!(!market_is_paused, PerpsError::MarketPaused);

    let mark_fp = oracle::read_oracle_fp(&ctx.accounts.oracle)?;
    
    // Capture position values before mutations
    let position_is_long = ctx.accounts.user_position.is_long;
    let position_base_size = ctx.accounts.user_position.base_size;
    let position_margin = ctx.accounts.user_position.margin_deposited;
    let position_owner = ctx.accounts.user_position.owner;
    require!(position_base_size != 0, PerpsError::PositionNotFound);

    // Check if position is actually liquidatable
    let notional_fp = (position_base_size.abs() as u128 * mark_fp) / FP;
    let required_margin = (notional_fp * market_maintenance_margin_bps as u128) / 10_000;
    
    if position_margin as u128 >= required_margin {
        return Err(PerpsError::PositionNotLiquidatable.into());
    }

    // Store position values
    let position_base_size = position_base_size;
    let position_entry_price_fp = ctx.accounts.user_position.entry_price_fp;
    let position_is_long = position_is_long;
    let position_margin_amount = position_margin;

    // Calculate liquidation size (partial or full based on max_liquidation_percentage)
    let original_size = position_base_size.abs() as u64;
    let liquidation_size = (original_size as u128 * max_liquidation_percentage as u128 / 100) as u64;
    
    // Calculate settlement
    let liquidation_notional_entry_fp = (liquidation_size as u128 * position_entry_price_fp) / FP;
    let liquidation_notional_exit_fp = (liquidation_size as u128 * mark_fp) / FP;
    
    let pnl_fp = if position_is_long {
        liquidation_notional_exit_fp as i128 - liquidation_notional_entry_fp as i128
    } else {
        liquidation_notional_entry_fp as i128 - liquidation_notional_exit_fp as i128
    };

    // Calculate fees and liquidator reward
    let liquidation_fee = (liquidation_notional_exit_fp * market_fee_bps as u128) / (10_000 * FP);
    let liquidator_reward = liquidation_fee / 2; // 50% of fee goes to liquidator
    let protocol_fee = liquidation_fee - liquidator_reward;

    // Calculate settlement amount
    let settlement_base = if pnl_fp >= 0 {
        liquidation_notional_exit_fp + pnl_fp as u128
    } else {
        liquidation_notional_exit_fp - (-pnl_fp) as u128
    };
    
    let net_settlement = settlement_base.saturating_sub(liquidation_fee);
    let liquidation_deficit = if net_settlement < position_margin_amount as u128 {
        position_margin_amount as u128 - net_settlement
    } else {
        0
    };

    // Pay liquidator reward
    if liquidator_reward > 0 {
        let config_bump = ctx.accounts.config.bump;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.liquidator_reward_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&[CONFIG_SEED, &[config_bump]]]
            ),
            (liquidator_reward / FP) as u64
        )?;
    }

    // Pay protocol fee
    if protocol_fee > 0 {
        let config_bump = ctx.accounts.config.bump;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.fee_destination.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&[CONFIG_SEED, &[config_bump]]]
            ),
            (protocol_fee / FP) as u64
        )?;
    }

    // Handle insurance fund if there's a deficit
    if liquidation_deficit > 0 {
        contribute_to_insurance_fund(&mut ctx, (liquidation_deficit / FP) as u64)?;
    }

    // Update position
    {
        let up = &mut ctx.accounts.user_position;
        up.base_size = if max_liquidation_percentage == 100 {
            0
        } else {
            if position_is_long {
                position_base_size - liquidation_size as i64
            } else {
                position_base_size + liquidation_size as i64
            }
        };
        
        if max_liquidation_percentage == 100 || up.base_size == 0 {
            up.base_size = 0;
            up.margin_deposited = 0;
            up.is_long = false;
            up.entry_price_fp = 0;
        } else {
            let remaining_size = original_size - liquidation_size;
            let remaining_ratio = remaining_size as u128 * FP / original_size as u128;
            up.margin_deposited = (up.margin_deposited as u128 * remaining_ratio / FP) as u64;
        }
    }

    // Update market
    {
        let market_mut = &mut ctx.accounts.market;
        if position_is_long {
            market_mut.total_long_size = market_mut.total_long_size.saturating_sub(liquidation_size);
        } else {
            market_mut.total_short_size = market_mut.total_short_size.saturating_sub(liquidation_size);
        }
    }

    emit!(LiquidationExecuted {
        liquidator: ctx.accounts.liquidator.key(),
        liquidated_user: position_owner,
        liquidation_size,
        liquidation_price_fp: mark_fp,
        liquidator_reward: (liquidator_reward / FP) as u64,
        insurance_fund_contribution: (liquidation_deficit / FP) as u64,
    });

    Ok(())
}

/// Deposit to insurance fund
pub fn deposit_insurance_fund(
    ctx: Context<DepositInsuranceFund>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, PerpsError::InvalidMarketParameters);

    // Transfer tokens to insurance fund vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token.to_account_info(),
                to: ctx.accounts.insurance_vault_token.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            }
        ),
        amount
    )?;

    // Update insurance fund state
    let fund = &mut ctx.accounts.insurance_fund;
    fund.total_deposits = fund.total_deposits.checked_add(amount)
        .ok_or(PerpsError::MathOverflow)?;

    emit!(InsuranceFundDeposit {
        depositor: ctx.accounts.depositor.key(),
        amount,
        new_total: fund.total_deposits,
    });

    msg!("Insurance fund deposit: ${}, New total: ${}", 
         amount, fund.total_deposits);

    Ok(())
}

/// Withdraw from insurance fund (admin only, for covering bad debt)
pub fn withdraw_insurance_fund(
    ctx: Context<WithdrawInsuranceFund>,
    amount: u64,
    reason: String,
) -> Result<()> {
    require!(amount > 0, PerpsError::InvalidMarketParameters);
    require!(reason.len() <= 200, PerpsError::InvalidMarketParameters);

    let fund = &ctx.accounts.insurance_fund;
    require!(amount <= fund.total_deposits, PerpsError::InsufficientBalance);
    
    let fund_bump = fund.bump;
    let fund_total_before = fund.total_deposits;

    // Transfer tokens from insurance fund vault
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.insurance_vault_token.to_account_info(),
                to: ctx.accounts.recipient_token.to_account_info(),
                authority: ctx.accounts.insurance_fund.to_account_info(),
            },
            &[&[
                b"insurance_fund",
                &[fund_bump]
            ]]
        ),
        amount
    )?;

    // Update insurance fund state
    let fund_mut = &mut ctx.accounts.insurance_fund;
    fund_mut.total_claims = fund_mut.total_claims.checked_add(amount)
        .ok_or(PerpsError::MathOverflow)?;

    emit!(InsuranceFundWithdrawal {
        recipient: ctx.accounts.admin.key(),
        amount,
        new_total: fund_total_before - amount,
        reason: reason.clone(),
    });
    
    msg!("Insurance fund withdrawal: ${}, Reason: {}", amount, reason);

    Ok(())
}

/// Initialize insurance fund
pub fn initialize_insurance_fund(ctx: Context<InitializeInsuranceFund>) -> Result<()> {
    let fund = &mut ctx.accounts.insurance_fund;
    fund.total_deposits = 0;
    fund.total_claims = 0;
    fund.vault_authority = ctx.accounts.config.key();
    fund.vault_token_account = ctx.accounts.insurance_vault_token.key();
    fund.bump = ctx.bumps.insurance_fund;

    msg!("Insurance fund initialized");
    Ok(())
}

// Helper functions
fn calculate_optimal_liquidation_size(
    position: &UserPosition,
    market: &Market,
    mark_fp: u128,
    max_percentage: u8,
) -> Result<u64> {
    let position_size = position.base_size.abs() as u64;
    let max_liquidation_size = (position_size as u128 * max_percentage as u128 / 100) as u64;
    
    // For now, use max allowed percentage, but could be optimized based on:
    // - Market depth
    // - Position health
    // - Insurance fund status
    Ok(max_liquidation_size.min(position_size))
}

fn transfer_liquidator_reward(ctx: &Context<EnhancedLiquidate>, amount: u64) -> Result<()> {
    if amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.liquidator_reward_token.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&[
                    CONFIG_SEED,
                    &[ctx.accounts.config.bump]
                ]]
            ),
            amount
        )?;
    }
    Ok(())
}

fn contribute_to_insurance_fund(ctx: &mut Context<EnhancedLiquidate>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }

        // Try to cover deficit with insurance fund if available
    if amount == 0 {
        return Ok(());
    }

    // Update insurance fund
    let fund = &mut ctx.accounts.insurance_fund;
    fund.total_deposits = fund.total_deposits.saturating_add(amount);
    
    emit!(InsuranceFundContribution {
        contributor: ctx.accounts.liquidator.key(),
        amount,
        new_balance: fund.total_deposits,
    });
    
    Ok(())
}fn transfer_protocol_fees(ctx: &Context<EnhancedLiquidate>, amount: u64) -> Result<()> {
    if amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token.to_account_info(),
                    to: ctx.accounts.fee_destination.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[&[
                    CONFIG_SEED,
                    &[ctx.accounts.config.bump]
                ]]
            ),
            amount
        )?;
    }
    Ok(())
}

fn calculate_liquidation_price(
    entry_price_fp: u128,
    _margin: u64,
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
pub struct EnhancedLiquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    
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
        seeds = [b"insurance_fund"],
        bump = insurance_fund.bump
    )]
    pub insurance_fund: Account<'info, InsuranceFund>,
    
    #[account(mut)]
    pub user_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub vault_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub liquidator_reward_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub insurance_vault_token: Account<'info, TokenAccount>,
    
    /// CHECK: Fee destination
    #[account(mut)]
    pub fee_destination: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DepositInsuranceFund<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"insurance_fund"],
        bump = insurance_fund.bump
    )]
    pub insurance_fund: Account<'info, InsuranceFund>,
    
    #[account(mut)]
    pub depositor_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub insurance_vault_token: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawInsuranceFund<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ PerpsError::UnauthorizedAccess,
    )]
    pub config: Account<'info, Config>,
    
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"insurance_fund"],
        bump = insurance_fund.bump
    )]
    pub insurance_fund: Account<'info, InsuranceFund>,
    
    #[account(mut)]
    pub insurance_vault_token: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub recipient_token: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeInsuranceFund<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.admin == admin.key() @ PerpsError::UnauthorizedAccess,
    )]
    pub config: Account<'info, Config>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = InsuranceFund::SPACE,
        seeds = [b"insurance_fund"],
        bump
    )]
    pub insurance_fund: Account<'info, InsuranceFund>,
    
    pub insurance_vault_token: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
}
