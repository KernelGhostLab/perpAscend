use anchor_lang::prelude::*;

pub const FP: u128 = 1_000_000; // fixed point 1e6
pub const MAX_LEVERAGE_X: u64 = 40;

// PDA seed constants for secure account derivation
pub const CONFIG_SEED: &[u8] = b"config";
pub const MARKET_SEED: &[u8] = b"market"; 
pub const POSITION_SEED: &[u8] = b"position";
pub const VAULT_SEED: &[u8] = b"vault";
pub const ORACLE_SEED: &[u8] = b"oracle";
pub const STOP_LOSS_SEED: &[u8] = b"stop_loss";
pub const INSURANCE_FUND_SEED: &[u8] = b"insurance_fund";

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub quote_mint: Pubkey,
    pub fee_bps: u16,                    // Trading fee in basis points
    pub liq_fee_bps: u16,               // Liquidation fee in basis points  
    pub fee_destination: Pubkey,         // SPL token account (set to Pump/Pumpswap LP vault)
    pub insurance_vault: Pubkey,         // Insurance fund vault
    pub creator_reward_mint: Pubkey,     // Reward token mint
    pub creator_reward_bps: u16,         // Creator reward percentage
    pub paused: bool,                    // Emergency pause flag
    pub bump: u8,                        // PDA bump seed
    
    // Risk management parameters
    pub max_positions_per_user: u32,     // Maximum positions per user
    pub max_total_positions: u32,        // Maximum total protocol positions
    pub emergency_pause_threshold: u64,  // Auto-pause threshold
    pub circuit_breaker_threshold_bps: u64, // Price movement threshold
}

impl Config {
    pub const SPACE: usize = 8 + // discriminator
        32 + // admin
        32 + // quote_mint  
        2 +  // fee_bps
        2 +  // liq_fee_bps
        32 + // fee_destination
        32 + // insurance_vault
        32 + // creator_reward_mint
        2 +  // creator_reward_bps
        1 +  // paused
        1 +  // bump
        4 +  // max_positions_per_user
        4 +  // max_total_positions
        8 +  // emergency_pause_threshold
        8 +  // circuit_breaker_threshold_bps
        32;  // padding for future upgrades

    /// Generate PDA for the protocol config
    pub fn find_pda() -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[CONFIG_SEED],
            &crate::ID
        )
    }
}

#[account]  
pub struct Market {
    pub symbol: [u8; 12],               // Market symbol (e.g. "BTC", "ETH")
    pub base_decimals: u8,              // Base token decimal places
    pub oracle: Pubkey,                 // Primary oracle account
    pub pyth_oracle: Option<Pubkey>,    // Optional Pyth oracle
    pub bump: u8,                       // PDA bump seed
    
    // AMM parameters
    pub amm_base_reserve_fp: u128,      // Base token reserves (fixed point)
    pub amm_quote_reserve_fp: u128,     // Quote token reserves (fixed point)
    
    // Funding rate data
    pub funding_rate_fp: i128,          // Current funding rate (fixed point)
    pub last_funding_ts: i64,           // Last funding settlement timestamp
    pub cumulative_funding_long_fp: i128,  // Cumulative funding for longs
    pub cumulative_funding_short_fp: i128, // Cumulative funding for shorts
    
    // Market parameters  
    pub skew_k_bps: u32,               // Skew strength in basis points
    pub max_position_base: u64,         // Maximum position size
    pub maintenance_margin_bps: u16,    // Maintenance margin requirement
    pub taker_leverage_cap_x: u16,      // Maximum leverage multiplier
    
    // Market state
    pub total_long_size: u64,           // Total long open interest
    pub total_short_size: u64,          // Total short open interest
    pub total_volume: u128,             // Total trading volume
    pub is_paused: bool,                // Market-specific pause
    
    // Risk management
    pub max_funding_rate_fp: i128,      // Maximum allowed funding rate
    pub max_skew_ratio: u32,            // Maximum skew ratio (long/short)
}

impl Market {
    pub const SPACE: usize = 8 + // discriminator  
        12 + // symbol
        1 +  // base_decimals
        32 + // oracle
        33 + // pyth_oracle (Option<Pubkey>)
        1 +  // bump
        16 + // amm_base_reserve_fp
        16 + // amm_quote_reserve_fp  
        16 + // funding_rate_fp
        8 +  // last_funding_ts
        16 + // cumulative_funding_long_fp
        16 + // cumulative_funding_short_fp
        4 +  // skew_k_bps
        8 +  // max_position_base
        2 +  // maintenance_margin_bps
        2 +  // taker_leverage_cap_x
        8 +  // total_long_size
        8 +  // total_short_size
        16 + // total_volume
        1 +  // is_paused
        16 + // max_funding_rate_fp
        4 +  // max_skew_ratio
        32;  // padding

    /// Generate PDA for a market account
    pub fn find_pda(symbol: &[u8]) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[MARKET_SEED, symbol],
            &crate::ID
        )
    }

    /// Calculate current skew ratio
    pub fn skew_ratio(&self) -> u32 {
        if self.total_short_size == 0 {
            return u32::MAX;
        }
        (self.total_long_size as u32 * 10_000) / self.total_short_size as u32
    }

    /// Check if market is balanced (skew within acceptable range)
    pub fn is_balanced(&self) -> bool {
        let skew = self.skew_ratio();
        skew >= 5_000 && skew <= 15_000 // Between 0.5x and 1.5x ratio
    }
}

#[account]
pub struct UserPosition {
    pub owner: Pubkey,                  // Position owner
    pub market: Pubkey,                 // Market this position belongs to
    pub bump: u8,                       // PDA bump seed
    
    // Position details
    pub is_long: bool,                  // Long or short position
    pub base_size: i64,                 // Position size (signed: + for long, - for short)
    pub entry_price_fp: u128,           // Entry price (fixed point)
    pub margin_deposited: u64,          // Collateral deposited
    
    // Funding tracking
    pub last_funding_settled: i64,      // Last funding settlement timestamp  
    pub funding_debt_fp: i128,          // Accumulated funding debt
    
    // Risk metrics
    pub liquidation_price_fp: u128,     // Calculated liquidation price
    pub last_updated_ts: i64,           // Last position update
    
    // Position history
    pub realized_pnl_fp: i128,          // Total realized PnL
    pub total_fees_paid: u64,           // Total fees paid on this position
}

impl UserPosition {
    pub const SPACE: usize = 8 + // discriminator
        32 + // owner
        32 + // market  
        1 +  // bump
        1 +  // is_long
        8 +  // base_size
        16 + // entry_price_fp
        8 +  // margin_deposited
        8 +  // last_funding_settled
        16 + // funding_debt_fp
        16 + // liquidation_price_fp
        8 +  // last_updated_ts
        16 + // realized_pnl_fp
        8 +  // total_fees_paid
        32;  // padding

    /// Generate PDA for a user position
    pub fn find_pda(owner: &Pubkey, market: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[POSITION_SEED, owner.as_ref(), market.as_ref()],
            &crate::ID
        )
    }

    /// Calculate unrealized PnL
    pub fn unrealized_pnl_fp(&self, current_price_fp: u128) -> i128 {
        if self.base_size == 0 {
            return 0;
        }

        let position_size_abs = self.base_size.abs() as u128;
        let entry_notional_fp = position_size_abs * self.entry_price_fp;
        let current_notional_fp = position_size_abs * current_price_fp;
        
        if self.is_long {
            (current_notional_fp as i128 - entry_notional_fp as i128) / FP as i128
        } else {
            (entry_notional_fp as i128 - current_notional_fp as i128) / FP as i128
        }
    }

    /// Calculate total equity (margin + unrealized PnL)
    pub fn equity_fp(&self, current_price_fp: u128) -> i128 {
        let margin_fp = (self.margin_deposited as i128) * FP as i128;
        let unrealized_pnl = self.unrealized_pnl_fp(current_price_fp);
        margin_fp + unrealized_pnl - self.funding_debt_fp
    }

    /// Check if position is liquidatable
    pub fn is_liquidatable(&self, current_price_fp: u128, maintenance_margin_bps: u16) -> bool {
        if self.base_size == 0 {
            return false;
        }

        let equity = self.equity_fp(current_price_fp);
        let notional_fp = (self.base_size.abs() as u128 * current_price_fp) / FP;
        let maintenance_required_fp = (notional_fp * maintenance_margin_bps as u128) / 10_000;

        equity < maintenance_required_fp as i128
    }
}

#[account]
pub struct OraclePrice { 
    pub price_fp: u128,                 // Current price (fixed point)
    pub last_updated_ts: i64,           // Last update timestamp
    pub confidence_fp: u128,            // Price confidence interval
    pub num_publishers: u8,             // Number of price publishers
    pub is_valid: bool,                 // Whether price is currently valid
    pub bump: u8,                       // PDA bump seed
}

impl OraclePrice {
    pub const SPACE: usize = 8 + // discriminator
        16 + // price_fp
        8 +  // last_updated_ts  
        16 + // confidence_fp
        1 +  // num_publishers
        1 +  // is_valid
        1 +  // bump
        16;  // padding

    /// Generate PDA for oracle price account
    pub fn find_pda(symbol: &[u8]) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[ORACLE_SEED, symbol],
            &crate::ID
        )
    }
}

#[account]
pub struct StopLossOrder {
    pub owner: Pubkey,                  // Order owner
    pub market: Pubkey,                 // Market this order belongs to
    pub position_key: Pubkey,           // Associated position account
    pub trigger_price_fp: u128,         // Price at which to trigger
    pub close_percentage: u8,           // Percentage to close (1-100)
    pub is_active: bool,                // Whether order is active
    pub created_at: i64,                // Order creation timestamp
    pub executed_at: Option<i64>,       // Execution timestamp
    pub bump: u8,                       // PDA bump seed
}

impl StopLossOrder {
    pub const SPACE: usize = 8 + // discriminator
        32 + // owner
        32 + // market
        32 + // position_key
        16 + // trigger_price_fp
        1 +  // close_percentage
        1 +  // is_active
        8 +  // created_at
        9 +  // executed_at (Option<i64>)
        1 +  // bump
        16;  // padding

    /// Generate PDA for stop-loss order
    pub fn find_pda(owner: &Pubkey, market: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"stop_loss", owner.as_ref(), market.as_ref()],
            &crate::ID
        )
    }
}

#[account]
pub struct InsuranceFund {
    pub total_deposits: u64,            // Total insurance fund deposits
    pub total_claims: u64,              // Total claims paid out
    pub vault_authority: Pubkey,        // Authority for the vault
    pub vault_token_account: Pubkey,    // Token account holding funds
    pub bump: u8,                       // PDA bump seed
}

impl InsuranceFund {
    pub const SPACE: usize = 8 + // discriminator
        8 +  // total_deposits
        8 +  // total_claims
        32 + // vault_authority
        32 + // vault_token_account
        1 +  // bump
        16;  // padding

    /// Generate PDA for insurance fund
    pub fn find_pda() -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"insurance_fund"],
            &crate::ID
        )
    }

    /// Calculate current fund ratio (deposits / claims)
    pub fn fund_ratio(&self) -> u64 {
        if self.total_claims == 0 {
            return u64::MAX;
        }
        (self.total_deposits * 10_000) / self.total_claims
    }

    /// Check if fund is healthy (ratio > 150%)
    pub fn is_healthy(&self) -> bool {
        self.fund_ratio() > 15_000 // 150%
    }
}
