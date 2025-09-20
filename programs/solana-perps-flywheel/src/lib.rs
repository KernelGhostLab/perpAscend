use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod math;
pub mod oracle;
pub mod state;
pub mod instructions;

use instructions::*;


// Program ID
declare_id!("HSMR7nCvy29baTVaZRUafxZXU9UhfeFrmFtRSJW3r1gj");


#[program]
pub mod solana_perps_flywheel {
use super::*;

// Basic admin functions
pub fn initialize_config(ctx: Context<InitializeConfig>, fee_bps: u16, liq_fee_bps: u16, creator_reward_bps: u16) -> Result<()> {
instructions::admin::initialize_config(ctx, fee_bps, liq_fee_bps, creator_reward_bps)
}

pub fn set_fee_destination(ctx: Context<AdminOnly>, new_fee_dest: Pubkey) -> Result<()> {
instructions::admin::set_fee_destination(ctx, new_fee_dest)
}

pub fn pause(ctx: Context<AdminOnly>, paused: bool) -> Result<()> { 
instructions::admin::pause(ctx, paused) 
}

pub fn update_risk_parameters(ctx: Context<AdminOnly>, max_positions_per_user: Option<u32>, circuit_breaker_threshold_bps: Option<u64>) -> Result<()> {
instructions::admin::update_risk_parameters(ctx, max_positions_per_user, circuit_breaker_threshold_bps)
}

// Market management
pub fn create_market(
ctx: Context<CreateMarket>,
symbol: [u8; 12],
base_decimals: u8,
skew_k_bps: u32,
max_position_base: u64,
maintenance_margin_bps: u16,
taker_leverage_cap_x: u16,
amm_base_reserve_fp: u128,
amm_quote_reserve_fp: u128,
) -> Result<()> { 
instructions::create_market::create_market(ctx, symbol, base_decimals, skew_k_bps, max_position_base, maintenance_margin_bps, taker_leverage_cap_x, amm_base_reserve_fp, amm_quote_reserve_fp) 
}

pub fn edit_max_position(ctx: Context<AdminOnlyMarket>, new_max_base: u64) -> Result<()> { 
instructions::admin::edit_max_position(ctx, new_max_base) 
}

// Basic trading
pub fn open_position(ctx: Context<OpenPosition>, is_long: bool, quote_to_spend: u64, leverage_x: u16) -> Result<()> { 
instructions::trade::open_position(ctx, is_long, quote_to_spend, leverage_x) 
}

pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> { 
instructions::trade::close_position(ctx) 
}

// Liquidation system
pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> { 
instructions::liquidate::liquidate(ctx) 
}

// Funding and rewards
pub fn settle_funding(ctx: Context<SettleFunding>) -> Result<()> { 
instructions::funding::settle_funding(ctx) 
}

pub fn sweep_creator_rewards(ctx: Context<SweepCreatorRewards>, amount: u64) -> Result<()> { 
instructions::rewards::sweep_creator_rewards(ctx, amount) 
}

// Advanced position management
pub fn partial_close_position(ctx: Context<PartialClosePosition>, close_percentage: u8) -> Result<()> {
instructions::advanced_position::partial_close_position(ctx, close_percentage)
}

pub fn modify_position_margin(ctx: Context<ModifyPositionMargin>, margin_change: i64) -> Result<()> {
instructions::advanced_position::modify_position_margin(ctx, margin_change)
}

pub fn set_stop_loss(ctx: Context<SetStopLoss>, trigger_price_fp: u128, close_percentage: u8) -> Result<()> {
instructions::advanced_position::set_stop_loss(ctx, trigger_price_fp, close_percentage)
}

// Enhanced liquidation system
pub fn enhanced_liquidate(ctx: Context<EnhancedLiquidate>, max_liquidation_percentage: u8) -> Result<()> {
instructions::enhanced_liquidation::enhanced_liquidate(ctx, max_liquidation_percentage)
}

pub fn deposit_insurance_fund(ctx: Context<DepositInsuranceFund>, amount: u64) -> Result<()> {
instructions::enhanced_liquidation::deposit_insurance_fund(ctx, amount)
}

pub fn withdraw_insurance_fund(ctx: Context<WithdrawInsuranceFund>, amount: u64, reason: String) -> Result<()> {
instructions::enhanced_liquidation::withdraw_insurance_fund(ctx, amount, reason)
}
}
