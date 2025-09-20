use anchor_lang::prelude::*;

#[event]
pub struct PositionOpened { 
    pub user: Pubkey, 
    pub market: Pubkey, 
    pub is_long: bool, 
    pub base_size: u64, 
    pub entry_price_fp: u128,
    pub leverage: u16,
    pub margin_deposited: u64,
}

#[event]
pub struct PositionClosed { 
    pub user: Pubkey, 
    pub market: Pubkey, 
    pub pnl_fp: i128, 
    pub fees_fp: u128,
    pub settlement_amount: u64,
}

#[event]
pub struct Liquidated { 
    pub user: Pubkey, 
    pub market: Pubkey, 
    pub seized_collateral: u64,
    pub liquidator: Pubkey,
    pub liquidation_price_fp: u128,
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub symbol: [u8; 12],
    pub oracle: Pubkey,
    pub max_leverage: u16,
}

#[event]
pub struct FundingPaid {
    pub user: Pubkey,
    pub market: Pubkey,
    pub funding_amount_fp: i128,
    pub funding_rate_fp: i128,
}

#[event]
pub struct OracleUpdated {
    pub oracle: Pubkey,
    pub old_price_fp: u128,
    pub new_price_fp: u128,
    pub confidence_fp: u128,
}

#[event]
pub struct EmergencyPause {
    pub reason: String,
    pub timestamp: i64,
    pub triggered_by: Pubkey,
}

#[event]
pub struct CircuitBreakerTriggered {
    pub market: Pubkey,
    pub price_change_bps: u64,
    pub old_price_fp: u128,
    pub new_price_fp: u128,
}

#[event]
pub struct RiskLimitExceeded {
    pub user: Pubkey,
    pub market: Pubkey,
    pub limit_type: String,
    pub current_value: u64,
    pub limit_value: u64,
}

#[event]
pub struct ProtocolStatsUpdated {
    pub total_volume: u128,
    pub total_fees_collected: u64,
    pub active_positions: u32,
    pub total_liquidations: u32,
}

// Advanced Position Events
#[event]
pub struct PositionUpdated {
    pub user: Pubkey,
    pub position: crate::state::UserPosition,
}

#[event]
pub struct MarginAdded {
    pub user: Pubkey,
    pub amount: u64,
    pub new_collateral: u64,
}

#[event]
pub struct MarginRemoved {
    pub user: Pubkey,
    pub amount: u64,
    pub new_collateral: u64,
}

#[event]
pub struct PartialPositionClosed {
    pub user: Pubkey,
    pub market: Pubkey,
    pub close_percentage: u8,
    pub closed_size: u64,
    pub remaining_size: u64,
    pub pnl_fp: i128,
    pub settlement_amount: u64,
    pub fees_paid: u64,
}

#[event]
pub struct PositionMarginModified {
    pub user: Pubkey,
    pub market: Pubkey,
    pub margin_change: i64,
    pub new_margin: u64,
    pub new_liquidation_price_fp: u128,
}

#[event]
pub struct StopLossSet {
    pub user: Pubkey,
    pub market: Pubkey,
    pub trigger_price_fp: u128,
    pub close_percentage: u8,
    pub is_long: bool,
}

#[event]
pub struct StopLossExecuted {
    pub user: Pubkey,
    pub market: Pubkey,
    pub trigger_price_fp: u128,
    pub close_percentage: u8,
    pub executor: Pubkey,
}

// Enhanced Liquidation Events
#[event]
pub struct LiquidationExecuted {
    pub liquidator: Pubkey,
    pub liquidated_user: Pubkey,
    pub liquidation_size: u64,
    pub liquidation_price_fp: u128,
    pub liquidator_reward: u64,
    pub insurance_fund_contribution: u64,
}

#[event]
pub struct InsuranceFundContribution {
    pub contributor: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
}

#[event]
pub struct PartialLiquidation {
    pub user: Pubkey,
    pub market: Pubkey,
    pub liquidator: Pubkey,
    pub liquidated_size: u64,
    pub remaining_size: u64,
    pub liquidation_price_fp: u128,
    pub liquidator_reward: u64,
    pub insurance_fund_contribution: u64,
}

#[event]
pub struct LiquidatorRewardPaid {
    pub liquidator: Pubkey,
    pub market: Pubkey,
    pub reward_amount: u64,
    pub reward_percentage: u16,
}

#[event]
pub struct InsuranceFundDeposit {
    pub depositor: Pubkey,
    pub amount: u64,
    pub new_total: u64,
}

#[event]
pub struct InsuranceFundWithdrawal {
    pub recipient: Pubkey,
    pub amount: u64,
    pub new_total: u64,
    pub reason: String,
}
