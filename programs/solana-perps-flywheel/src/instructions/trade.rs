use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::*;
use crate::events::*;
use crate::math::*;

pub fn open_position(
    ctx: Context<OpenPosition>, 
    is_long: bool, 
    quote_to_spend: u64, 
    leverage_x: u16
) -> Result<()> {
    let cfg = &ctx.accounts.config;
    
    // Security checks
    require!(!cfg.paused, PerpsError::ProtocolPaused);
    require!(!ctx.accounts.market.is_paused, PerpsError::MarketPaused);
    require!(leverage_x as u64 <= MAX_LEVERAGE_X, PerpsError::LeverageTooHigh);
    require!(leverage_x <= ctx.accounts.market.taker_leverage_cap_x, PerpsError::LeverageTooHigh);
    require!(quote_to_spend > 0, PerpsError::InvalidMarketParameters);

    // Calculate margin and validate
    let margin = quote_to_spend.checked_div(leverage_x as u64)
        .ok_or(PerpsError::MathOverflow)?;
    require!(margin > 0, PerpsError::InsufficientMargin);

    // Get current price and calculate position size
    let price_fp = current_mark_price_fp(&ctx.accounts.market, &ctx.accounts.oracle)?;
    let base_size_fp: u128 = (quote_to_spend as u128)
        .checked_mul(FP)
        .ok_or(PerpsError::MathOverflow)?
        .checked_div(price_fp)
        .ok_or(PerpsError::DivisionByZero)?;
    
    let base_size_units: u64 = (base_size_fp / FP) as u64;
    require!(base_size_units > 0, PerpsError::PositionTooSmall);
    require!(base_size_units <= ctx.accounts.market.max_position_base, PerpsError::MaxPositionExceeded);

    // Calculate liquidation price
    let liquidation_price_fp = calculate_liquidation_price(
        price_fp,
        margin,
        base_size_units,
        ctx.accounts.market.maintenance_margin_bps,
        is_long,
    )?;

    // Transfer margin from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(), 
            Transfer { 
                from: ctx.accounts.user_token.to_account_info(), 
                to: ctx.accounts.vault_token.to_account_info(), 
                authority: ctx.accounts.user.to_account_info() 
            }
        ),
        margin
    )?;

    // Update market state (now we can borrow mutably)
    let market = &mut ctx.accounts.market;
    if is_long {
        market.total_long_size = market.total_long_size
            .checked_add(base_size_units)
            .ok_or(PerpsError::MathOverflow)?;
    } else {
        market.total_short_size = market.total_short_size
            .checked_add(base_size_units)
            .ok_or(PerpsError::MathOverflow)?;
    }
    
    market.total_volume = market.total_volume
        .checked_add(quote_to_spend as u128)
        .ok_or(PerpsError::MathOverflow)?;

    // Initialize user position
    let up = &mut ctx.accounts.user_position;
    up.owner = ctx.accounts.user.key();
    up.market = ctx.accounts.market.key();
    up.bump = ctx.bumps.user_position;
    up.is_long = is_long;
    up.base_size = if is_long { 
        base_size_units as i64 
    } else { 
        -(base_size_units as i64) 
    };
    up.entry_price_fp = price_fp;
    up.margin_deposited = margin;
    up.last_funding_settled = Clock::get()?.unix_timestamp;
    up.funding_debt_fp = 0;
    up.liquidation_price_fp = liquidation_price_fp;
    up.last_updated_ts = Clock::get()?.unix_timestamp;
    up.realized_pnl_fp = 0;
    up.total_fees_paid = 0;

    // Emit event
    emit!(PositionOpened { 
        user: up.owner, 
        market: up.market, 
        is_long, 
        base_size: base_size_units, 
        entry_price_fp: price_fp,
        leverage: leverage_x,
        margin_deposited: margin,
    });

    msg!("Position opened: {} {} units @ ${} with {}x leverage", 
         if is_long { "Long" } else { "Short" },
         base_size_units,
         price_fp / FP,
         leverage_x
    );

    Ok(())
}

pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(!market.is_paused, PerpsError::MarketPaused);

    let mark_fp = current_mark_price_fp(market, &ctx.accounts.oracle)?;

    // Read values from user_position first
    let position = &ctx.accounts.user_position;
    let signed_base = position.base_size as i128; 
    let entry_fp = position.entry_price_fp as i128;
    let margin_deposited = position.margin_deposited;
    let user_owner = position.owner;
    let user_market = position.market;
    let is_long = position.is_long;
    let base_size_abs = signed_base.abs() as u64;

    require!(signed_base != 0, PerpsError::PositionNotFound);

    // Calculate PnL
    let notional_entry_fp = (signed_base.abs() as i128) * entry_fp; 
    let notional_exit_fp = (signed_base.abs() as i128) * (mark_fp as i128);
    let direction = if signed_base >= 0 { 1 } else { -1 };
    let pnl_fp: i128 = direction * (notional_exit_fp - notional_entry_fp) / FP as i128;

    // Calculate fees
    let fee_fp: u128 = (notional_exit_fp.unsigned_abs() * (ctx.accounts.config.fee_bps as u128)) / 10_000u128;
    let fee_amt: u64 = (fee_fp / FP) as u64;

    // Calculate settlement amount
    let mut settle_fp: i128 = (margin_deposited as i128) * (FP as i128) + pnl_fp - (fee_fp as i128);
    if settle_fp < 0 { settle_fp = 0; }
    let settle_amt: u64 = (settle_fp as u128 / FP) as u64;

    // Update market state
    if is_long {
        market.total_long_size = market.total_long_size.saturating_sub(base_size_abs);
    } else {
        market.total_short_size = market.total_short_size.saturating_sub(base_size_abs);
    }

    // Execute transfers
    if settle_amt > 0 {
        token::transfer(ctx.accounts.transfer_vault_to_user(), settle_amt)?;
    }
    if fee_amt > 0 {
        token::transfer(ctx.accounts.transfer_vault_to_fee_dest(), fee_amt)?;
    }

    // Update position
    let up = &mut ctx.accounts.user_position;
    up.realized_pnl_fp += pnl_fp;
    up.total_fees_paid += fee_amt;
    up.base_size = 0; 
    up.margin_deposited = 0;
    up.last_updated_ts = Clock::get()?.unix_timestamp;

    emit!(PositionClosed { 
        user: user_owner, 
        market: user_market, 
        pnl_fp, 
        fees_fp: fee_fp,
        settlement_amount: settle_amt,
    });

    msg!("Position closed: PnL ${}, Fees ${}, Settlement ${}", 
         pnl_fp / FP as i128, fee_amt, settle_amt);

    Ok(())
}

/// Calculate liquidation price for a position
fn calculate_liquidation_price(
    entry_price_fp: u128,
    _margin: u64,
    _base_size: u64,
    maintenance_margin_bps: u16,
    is_long: bool,
) -> Result<u128> {
    let maintenance_ratio = maintenance_margin_bps as u128;

    let liq_price_fp = if is_long {
        // For longs: liq_price = entry_price * (margin - maintenance) / margin
        let numerator = entry_price_fp * (10_000 - maintenance_ratio);
        numerator.checked_div(10_000).ok_or(PerpsError::DivisionByZero)?
    } else {
        // For shorts: liq_price = entry_price * (margin + maintenance) / margin  
        let numerator = entry_price_fp * (10_000 + maintenance_ratio);
        numerator.checked_div(10_000).ok_or(PerpsError::DivisionByZero)?
    };

    Ok(liq_price_fp)
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
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
        init_if_needed, 
        payer = user, 
        space = UserPosition::SPACE, 
        seeds = [POSITION_SEED, user.key().as_ref(), market.key().as_ref()], 
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    
    #[account(mut)] 
    pub user_token: Account<'info, TokenAccount>,
    
    #[account(mut)] 
    pub vault_token: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> OpenPosition<'info> {
    pub fn transfer_user_to_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(), 
            Transfer { 
                from: self.user_token.to_account_info(), 
                to: self.vault_token.to_account_info(), 
                authority: self.user.to_account_info() 
            }
        )
    }
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
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
    
    /// CHECK: fees go to Pump/Pumpswap LP token account
    #[account(mut)] 
    pub fee_destination: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

impl<'info> ClosePosition<'info> {
    pub fn transfer_vault_to_user(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(), 
            Transfer { 
                from: self.vault_token.to_account_info(), 
                to: self.user_token.to_account_info(), 
                authority: self.config.to_account_info() 
            }
        )
    }
    
    pub fn transfer_vault_to_fee_dest(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(), 
            Transfer { 
                from: self.vault_token.to_account_info(), 
                to: self.fee_destination.to_account_info(), 
                authority: self.config.to_account_info() 
            }
        )
    }
}
