use anchor_lang::prelude::*;

#[error_code]
pub enum PerpsError {
    // Math and calculation errors (6000-6019)
    #[msg("Math overflow occurred")]
    MathOverflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Invalid fixed point conversion")]
    InvalidFixedPoint,

    // Position errors (6020-6039) 
    #[msg("Leverage too high for this market")]
    LeverageTooHigh,
    #[msg("Insufficient margin for this position")]
    InsufficientMargin,
    #[msg("Position would exceed per-market max size")]
    MaxPositionExceeded,
    #[msg("Position not found or already closed")]
    PositionNotFound,
    #[msg("Position size too small to close")]
    PositionTooSmall,
    #[msg("Cannot modify position - insufficient margin")]
    InsufficientMarginForModification,
    #[msg("Position already at liquidation threshold")]
    PositionAtLiquidation,
    #[msg("Position is not liquidatable at current price")]
    PositionNotLiquidatable,
    #[msg("Insufficient funds for operation")]
    InsufficientFunds,
    #[msg("Position would be liquidated after this action")]
    WouldBeLiquidated,
    #[msg("Invalid close percentage - must be between 1-100")]
    InvalidClosePercentage,

    // Oracle and pricing errors (6040-6059)
    #[msg("Oracle price is stale or too old")]
    BadOracle,
    #[msg("Oracle price feed not found")]
    OracleFeedNotFound,
    #[msg("Oracle price deviation too large")]
    OraclePriceDeviation,
    #[msg("Multiple oracle sources disagree")]
    OracleConsensusFailure,
    #[msg("Oracle confidence too low")]
    OracleConfidenceLow,
    #[msg("Invalid price provided")]
    InvalidPrice,

    // Market errors (6060-6079)
    #[msg("Market is currently paused")]
    MarketPaused,
    #[msg("Market not found or invalid")]
    MarketNotFound,
    #[msg("Invalid market parameters")]
    InvalidMarketParameters,
    #[msg("Market liquidity insufficient")]
    InsufficientLiquidity,
    #[msg("Market impact too high")]
    MarketImpactTooHigh,

    // Access control errors (6080-6099)
    #[msg("Unauthorized access - admin only")]
    Unauthorized,
    #[msg("Invalid signer for this operation")]
    InvalidSigner,
    #[msg("Account not owned by program")]
    InvalidAccountOwner,
    #[msg("Invalid program derived address")]
    InvalidPDA,

    // Risk management errors (6100-6119)
    #[msg("Position exceeds user risk limits")]
    ExceedsPositionLimits,
    #[msg("Protocol risk limits exceeded")]
    ExceedsRiskLimits,
    #[msg("Circuit breaker triggered")]
    CircuitBreakerTriggered,
    #[msg("Emergency pause active")]
    EmergencyPauseActive,
    #[msg("Concentration limits exceeded")]
    ConcentrationLimitExceeded,

    // Token and account errors (6120-6139)
    #[msg("Insufficient token balance")]
    InsufficientBalance,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Token transfer failed")]
    TokenTransferFailed,
    #[msg("Invalid token mint")]
    InvalidTokenMint,

    // Funding and settlement errors (6140-6159)
    #[msg("Funding rate calculation failed")]
    FundingRateError,
    #[msg("Settlement calculation failed")]
    SettlementError,
    #[msg("Funding payment failed")]
    FundingPaymentFailed,

    // Protocol state errors (6160-6179)
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Invalid protocol configuration")]
    InvalidProtocolConfig,
    #[msg("Protocol initialization failed")]
    InitializationFailed,
    #[msg("Account already initialized")]
    AlreadyInitialized,

    // Order and stop loss errors (6180-6199)
    #[msg("Order is not active")]
    OrderNotActive,
    #[msg("Invalid stop loss configuration")]
    InvalidStopLoss,
    #[msg("Stop loss conditions not met")]
    StopLossNotTriggered,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Invalid parameters")]
    InvalidParameters,
    #[msg("Use full close for complete position")]
    UseFullCloseForCompletePosition,
    #[msg("Order already executed")]
    OrderAlreadyExecuted,
    #[msg("Would cause liquidation")]
    WouldCauseLiquidation,
    #[msg("Invalid stop loss condition")]
    InvalidStopLossCondition,
    #[msg("Stop loss condition not met")]
    StopLossConditionNotMet,
}

impl PerpsError {
    pub fn to_error_code(&self) -> u32 {
        match self {
            // Math errors start at 6000
            PerpsError::MathOverflow => 6000,
            PerpsError::DivisionByZero => 6001,
            PerpsError::InvalidFixedPoint => 6002,
            
            // Position errors start at 6020
            PerpsError::LeverageTooHigh => 6020,
            PerpsError::InsufficientMargin => 6021,
            PerpsError::MaxPositionExceeded => 6022,
            PerpsError::PositionNotFound => 6023,
            PerpsError::PositionTooSmall => 6024,
            PerpsError::InsufficientMarginForModification => 6025,
            PerpsError::PositionAtLiquidation => 6026,
            PerpsError::PositionNotLiquidatable => 6027,
            PerpsError::InsufficientFunds => 6028,
            PerpsError::WouldBeLiquidated => 6029,
            PerpsError::InvalidClosePercentage => 6030,
            
            // Oracle errors start at 6040
            PerpsError::BadOracle => 6040,
            PerpsError::OracleFeedNotFound => 6041,
            PerpsError::OraclePriceDeviation => 6042,
            PerpsError::OracleConsensusFailure => 6043,
            PerpsError::OracleConfidenceLow => 6044,
            PerpsError::InvalidPrice => 6045,
            
            // Market errors start at 6060
            PerpsError::MarketPaused => 6060,
            PerpsError::MarketNotFound => 6061,
            PerpsError::InvalidMarketParameters => 6062,
            PerpsError::InsufficientLiquidity => 6063,
            PerpsError::MarketImpactTooHigh => 6064,
            
            // Access control start at 6080
            PerpsError::Unauthorized => 6080,
            PerpsError::InvalidSigner => 6081,
            PerpsError::InvalidAccountOwner => 6082,
            PerpsError::InvalidPDA => 6083,
            
            // Risk management start at 6100
            PerpsError::ExceedsPositionLimits => 6100,
            PerpsError::ExceedsRiskLimits => 6101,
            PerpsError::CircuitBreakerTriggered => 6102,
            PerpsError::EmergencyPauseActive => 6103,
            PerpsError::ConcentrationLimitExceeded => 6104,
            
            // Token errors start at 6120
            PerpsError::InsufficientBalance => 6120,
            PerpsError::InvalidTokenAccount => 6121,
            PerpsError::TokenTransferFailed => 6122,
            PerpsError::InvalidTokenMint => 6123,
            
            // Funding errors start at 6140
            PerpsError::FundingRateError => 6140,
            PerpsError::SettlementError => 6141,
            PerpsError::FundingPaymentFailed => 6142,
            
            // Protocol state start at 6160
            PerpsError::ProtocolPaused => 6160,
            PerpsError::InvalidProtocolConfig => 6161,
            PerpsError::InitializationFailed => 6162,
            PerpsError::AlreadyInitialized => 6163,

            // Order and stop loss errors start at 6180
            PerpsError::OrderNotActive => 6180,
            PerpsError::InvalidStopLoss => 6181,
            PerpsError::StopLossNotTriggered => 6182,
            PerpsError::UnauthorizedAccess => 6183,
            PerpsError::InvalidParameters => 6184,
            PerpsError::UseFullCloseForCompletePosition => 6185,
            PerpsError::OrderAlreadyExecuted => 6186,
            PerpsError::WouldCauseLiquidation => 6187,
            PerpsError::InvalidStopLossCondition => 6188,
            PerpsError::StopLossConditionNotMet => 6189,
        }
    }

    pub fn is_recoverable(&self) -> bool {
        matches!(self,
            PerpsError::BadOracle |
            PerpsError::InsufficientLiquidity |
            PerpsError::MarketImpactTooHigh |
            PerpsError::OracleConfidenceLow
        )
    }

    pub fn requires_emergency_pause(&self) -> bool {
        matches!(self,
            PerpsError::OracleConsensusFailure |
            PerpsError::CircuitBreakerTriggered |
            PerpsError::ExceedsRiskLimits
        )
    }
}
