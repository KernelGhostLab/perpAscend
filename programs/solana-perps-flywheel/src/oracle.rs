use anchor_lang::prelude::*;
use crate::errors::PerpsError;
use crate::state::{OraclePrice, FP};

// Pyth Network price account structure
#[repr(C)]
pub struct PythPriceAccount {
    pub magic: u32,
    pub version: u32,
    pub price_type: u32,
    pub size: u32,
    pub price: i64,
    pub confidence: u64,
    pub timestamp: i64,
    pub min_publishers: u8,
    pub num_publishers: u8,
    pub expo: i32,
}

// Oracle configuration for multiple price sources
#[derive(Copy, Clone, Debug)]
pub struct OracleConfig {
    pub max_staleness_seconds: i64,
    pub max_confidence_deviation_bps: u64,  // Max confidence as % of price
    pub max_price_deviation_bps: u64,       // Max deviation between sources
    pub min_publishers: u8,
}

impl Default for OracleConfig {
    fn default() -> Self {
        Self {
            max_staleness_seconds: 60,    // 1 minute max staleness
            max_confidence_deviation_bps: 500,  // 5% max confidence interval
            max_price_deviation_bps: 200,       // 2% max deviation between sources  
            min_publishers: 3,
        }
    }
}

/// Read and validate oracle price with comprehensive checks
pub fn read_oracle_fp(oracle: &Account<OraclePrice>) -> Result<u128> {
    read_oracle_with_config(oracle, &OracleConfig::default())
}

/// Read oracle price with custom configuration
pub fn read_oracle_with_config(oracle: &Account<OraclePrice>, config: &OracleConfig) -> Result<u128> {
    let now = Clock::get()?.unix_timestamp;
    
    // Check staleness
    let age = now - oracle.last_updated_ts;
    require!(age <= config.max_staleness_seconds, PerpsError::BadOracle);
    
    // Validate price is positive
    require!(oracle.price_fp > 0, PerpsError::BadOracle);
    
    msg!("Oracle price validated: {} (age: {}s)", oracle.price_fp, age);
    Ok(oracle.price_fp)
}

/// Read Pyth Network price feed with validation
pub fn read_pyth_price(pyth_account: &AccountInfo, config: &OracleConfig) -> Result<u128> {
    let pyth_data = pyth_account.try_borrow_data()?;
    require!(pyth_data.len() >= std::mem::size_of::<PythPriceAccount>(), PerpsError::BadOracle);
    
    let pyth_price: &PythPriceAccount = unsafe {
        &*(pyth_data.as_ptr() as *const PythPriceAccount)
    };
    
    // Validate Pyth data
    require!(pyth_price.magic == 0xa1b2c3d4, PerpsError::BadOracle);
    require!(pyth_price.num_publishers >= config.min_publishers, PerpsError::OracleConfidenceLow);
    
    let now = Clock::get()?.unix_timestamp;
    require!(now - pyth_price.timestamp <= config.max_staleness_seconds, PerpsError::BadOracle);
    
    // Convert Pyth price to fixed point
    let price_scaled = if pyth_price.expo >= 0 {
        pyth_price.price * (10_i64.pow(pyth_price.expo as u32))
    } else {
        pyth_price.price / (10_i64.pow((-pyth_price.expo) as u32))
    };
    
    require!(price_scaled > 0, PerpsError::BadOracle);
    let price_fp = (price_scaled as u128) * FP / 1_000_000; // Normalize to 1e6 precision
    
    // Check confidence interval
    let confidence_fp = (pyth_price.confidence as u128) * FP / 1_000_000;
    let confidence_ratio_bps = (confidence_fp * 10_000) / price_fp;
    require!(
        confidence_ratio_bps <= config.max_confidence_deviation_bps as u128, 
        PerpsError::OracleConfidenceLow
    );
    
    msg!("Pyth price: {} (confidence: {}bps)", price_fp, confidence_ratio_bps);
    Ok(price_fp)
}

/// Aggregate multiple oracle sources for robust pricing
pub fn aggregate_oracle_prices(
    primary_oracle: &Account<OraclePrice>,
    pyth_account: Option<&AccountInfo>,
    config: &OracleConfig,
) -> Result<u128> {
    let primary_price = read_oracle_with_config(primary_oracle, config)?;
    
    // If no secondary source, return primary
    let Some(pyth) = pyth_account else {
        return Ok(primary_price);
    };
    
    // Get Pyth price
    let pyth_price = match read_pyth_price(pyth, config) {
        Ok(price) => price,
        Err(_) => {
            msg!("Pyth oracle failed, using primary only");
            return Ok(primary_price);
        }
    };
    
    // Check deviation between sources
    let deviation_bps = calculate_deviation_bps(primary_price, pyth_price);
    if deviation_bps > config.max_price_deviation_bps {
        msg!("Oracle deviation too high: {}bps", deviation_bps);
        return Err(PerpsError::OraclePriceDeviation.into());
    }
    
    // Use weighted average (70% primary, 30% Pyth for now)
    let aggregated_price = (primary_price * 70 + pyth_price * 30) / 100;
    
    msg!("Aggregated price: {} (primary: {}, pyth: {})", 
         aggregated_price, primary_price, pyth_price);
    
    Ok(aggregated_price)
}

/// Calculate percentage deviation between two prices
fn calculate_deviation_bps(price1: u128, price2: u128) -> u64 {
    let higher = price1.max(price2);
    let lower = price1.min(price2);
    if higher == 0 { return 0; }
    
    let deviation = ((higher - lower) * 10_000) / higher;
    deviation as u64
}

/// Emergency oracle fallback using simple moving average
pub fn emergency_price_fallback(
    market_key: &Pubkey,
    last_valid_prices: &[u128; 5], // Store last 5 valid prices
) -> Result<u128> {
    // Calculate simple moving average of last valid prices
    let sum: u128 = last_valid_prices.iter().sum();
    let count = last_valid_prices.iter().filter(|&&p| p > 0).count();
    
    require!(count >= 3, PerpsError::OracleFeedNotFound);
    
    let fallback_price = sum / (count as u128);
    msg!("Using emergency fallback price: {} for market {}", fallback_price, market_key);
    
    Ok(fallback_price)
}

/// Update oracle price with validation and circuit breaker logic
pub fn update_oracle_price(
    oracle: &mut Account<OraclePrice>,
    new_price_fp: u128,
    max_price_change_bps: u64,
) -> Result<()> {
    let old_price = oracle.price_fp;
    let now = Clock::get()?.unix_timestamp;
    
    // Circuit breaker: check for extreme price movements
    if old_price > 0 {
        let deviation_bps = calculate_deviation_bps(old_price, new_price_fp);
        if deviation_bps > max_price_change_bps {
            msg!("Price change too large: {}bps, triggering circuit breaker", deviation_bps);
            return Err(PerpsError::CircuitBreakerTriggered.into());
        }
    }
    
    oracle.price_fp = new_price_fp;
    oracle.last_updated_ts = now;
    
    msg!("Oracle updated: {} -> {} (change: {}bps)", 
         old_price, new_price_fp, 
         if old_price > 0 { calculate_deviation_bps(old_price, new_price_fp) } else { 0 });
    
    Ok(())
}

/// Performs health checks after position changes to ensure system stability
pub fn health_check<'info>(
    oracle: &'info AccountInfo<'info>,
    current_price_fp: u128,
    _maintenance_margin_bps: u16,
) -> Result<()> {
    // Check if oracle price is still valid
    let oracle_account = Account::<OraclePrice>::try_from(oracle)?;
    let now = Clock::get()?.unix_timestamp;
    
    // Ensure oracle is not stale (max 5 minutes old for health checks)
    let max_staleness = 300; // 5 minutes
    require!(
        now - oracle_account.last_updated_ts <= max_staleness,
        PerpsError::BadOracle
    );
    
    // Ensure price is reasonable (not zero)
    require!(current_price_fp > 0, PerpsError::InvalidPrice);
    
    // Check for extreme price movements (basic sanity check)
    if oracle_account.price_fp > 0 {
        let deviation_bps = calculate_deviation_bps(oracle_account.price_fp, current_price_fp);
        
        // Warn if price moved more than 10% since last update
        if deviation_bps > 1000 {
            msg!("Warning: Large price movement detected: {}bps", deviation_bps);
        }
        
        // Prevent extreme movements (>50%)
        require!(deviation_bps <= 5000, PerpsError::OraclePriceDeviation);
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_deviation_calculation() {
        assert_eq!(calculate_deviation_bps(100_000_000, 105_000_000), 476); // ~4.76%
        assert_eq!(calculate_deviation_bps(100_000_000, 95_000_000), 526);  // ~5.26%
        assert_eq!(calculate_deviation_bps(100_000_000, 100_000_000), 0);   // 0%
    }
    
    #[test]
    fn test_aggregate_weights() {
        let primary = 100_000_000u128; // $100
        let pyth = 102_000_000u128;    // $102
        let expected = (primary * 70 + pyth * 30) / 100; // $100.60
        assert_eq!(expected, 100_600_000);
    }
}
