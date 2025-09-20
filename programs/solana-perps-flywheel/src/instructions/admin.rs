use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use crate::state::*;
use crate::errors::PerpsError;

pub fn initialize_config(
    ctx: Context<InitializeConfig>, 
    fee_bps: u16, 
    liq_fee_bps: u16, 
    creator_reward_bps: u16
) -> Result<()> {
    // Validate parameters
    require!(fee_bps <= 1000, PerpsError::InvalidProtocolConfig); // Max 10% fee
    require!(liq_fee_bps <= 2000, PerpsError::InvalidProtocolConfig); // Max 20% liq fee
    require!(creator_reward_bps <= 5000, PerpsError::InvalidProtocolConfig); // Max 50% rewards

    let cfg = &mut ctx.accounts.config;
    cfg.admin = ctx.accounts.admin.key();
    cfg.quote_mint = ctx.accounts.quote_mint.key();
    cfg.fee_bps = fee_bps;
    cfg.liq_fee_bps = liq_fee_bps;
    cfg.fee_destination = ctx.accounts.fee_destination.key();
    cfg.insurance_vault = ctx.accounts.insurance_vault.key();
    cfg.creator_reward_mint = ctx.accounts.creator_reward_mint.key();
    cfg.creator_reward_bps = creator_reward_bps;
    cfg.paused = false;
    cfg.bump = ctx.bumps.config;
    
    // Initialize risk parameters with safe defaults
    cfg.max_positions_per_user = 50;
    cfg.max_total_positions = 10_000;
    cfg.emergency_pause_threshold = 1_000_000; // $1M
    cfg.circuit_breaker_threshold_bps = 1000; // 10%
    
    msg!("Protocol initialized with admin: {}", cfg.admin);
    Ok(())
}

pub fn set_fee_destination(ctx: Context<AdminOnly>, new_fee_dest: Pubkey) -> Result<()> { 
    ctx.accounts.config.fee_destination = new_fee_dest;
    msg!("Fee destination updated to: {}", new_fee_dest);
    Ok(()) 
}

pub fn edit_max_position(ctx: Context<AdminOnlyMarket>, new_max_base: u64) -> Result<()> { 
    require!(new_max_base > 0, PerpsError::InvalidMarketParameters);
    ctx.accounts.market.max_position_base = new_max_base;
    msg!("Max position updated to: {}", new_max_base);
    Ok(()) 
}

pub fn pause(ctx: Context<AdminOnly>, paused: bool) -> Result<()> { 
    ctx.accounts.config.paused = paused;
    msg!("Protocol pause status: {}", paused);
    Ok(()) 
}

pub fn update_risk_parameters(
    ctx: Context<AdminOnly>,
    max_positions_per_user: Option<u32>,
    circuit_breaker_threshold_bps: Option<u64>,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    
    if let Some(max_pos) = max_positions_per_user {
        require!(max_pos > 0 && max_pos <= 200, PerpsError::InvalidProtocolConfig);
        cfg.max_positions_per_user = max_pos;
    }
    
    if let Some(threshold) = circuit_breaker_threshold_bps {
        require!(threshold >= 100 && threshold <= 5000, PerpsError::InvalidProtocolConfig); // 1-50%
        cfg.circuit_breaker_threshold_bps = threshold;
    }
    
    msg!("Risk parameters updated");
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = Config::SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    
    pub quote_mint: Account<'info, Mint>,
    
    /// CHECK: SPL token account for fee destination (Pump/Pumpswap LP vault)
    pub fee_destination: AccountInfo<'info>,
    
    pub insurance_vault: Account<'info, TokenAccount>,
    pub creator_reward_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> { 
    #[account(
        mut, 
        has_one = admin,
        seeds = [CONFIG_SEED],
        bump = config.bump
    )] 
    pub config: Account<'info, Config>, 
    pub admin: Signer<'info> 
}

#[derive(Accounts)]
pub struct AdminOnlyMarket<'info> { 
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin
    )]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    
    #[account(mut)] 
    pub market: Account<'info, Market> 
}
