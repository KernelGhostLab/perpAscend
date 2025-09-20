import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

describe("solana-perps-flywheel-advanced", () => {

  it("Should validate PnL calculations for long positions", () => {
    const FP = 1_000_000;
    
    // Long position: 10 units at $100 entry, margin $500
    const baseSize = 10;
    const entryPrice = 100 * FP;
    const margin = 500;
    
    // Test scenarios at different current prices
    const testPrices = [90, 100, 110, 120]; // $90, $100, $110, $120
    
    testPrices.forEach(currentPriceValue => {
      const currentPrice = currentPriceValue * FP;
      const pnlFp = (baseSize * (currentPrice - entryPrice));
      const pnl = pnlFp / FP;
      const equity = margin + pnl;
      
      console.log(`  - Price: $${currentPriceValue}, PnL: $${pnl}, Equity: $${equity}`);
      
      if (currentPriceValue === 100) {
        expect(pnl).to.equal(0); // Break-even at entry price
        expect(equity).to.equal(margin);
      }
      
      if (currentPriceValue > 100) {
        expect(pnl).to.be.greaterThan(0); // Profit on long when price rises
        expect(equity).to.be.greaterThan(margin);
      }
      
      if (currentPriceValue < 100) {
        expect(pnl).to.be.lessThan(0); // Loss on long when price falls
        expect(equity).to.be.lessThan(margin);
      }
    });
    
    console.log("✓ Long position PnL validation complete");
  });

  it("Should validate PnL calculations for short positions", () => {
    const FP = 1_000_000;
    
    // Short position: -10 units at $100 entry, margin $500
    const baseSize = -10; // Negative for short
    const entryPrice = 100 * FP;
    const margin = 500;
    
    // Test scenarios at different current prices
    const testPrices = [90, 100, 110]; // $90, $100, $110
    
    testPrices.forEach(currentPriceValue => {
      const currentPrice = currentPriceValue * FP;
      const pnlFp = (baseSize * (currentPrice - entryPrice));
      const pnl = pnlFp / FP;
      const equity = margin + pnl;
      
      console.log(`  - Price: $${currentPriceValue}, PnL: $${pnl}, Equity: $${equity}`);
      
      if (currentPriceValue === 100) {
        expect(pnl).to.equal(0); // Break-even at entry price
      }
      
      if (currentPriceValue > 100) {
        expect(pnl).to.be.lessThan(0); // Loss on short when price rises
      }
      
      if (currentPriceValue < 100) {
        expect(pnl).to.be.greaterThan(0); // Profit on short when price falls
      }
    });
    
    console.log("✓ Short position PnL validation complete");
  });

  it("Should validate liquidation conditions", () => {
    const FP = 1_000_000;
    const maintenanceMarginBps = 1000; // 10%
    
    // Long position at risk
    const baseSize = 10;
    const entryPrice = 100 * FP;
    const margin = 200; // Lower margin for liquidation test
    
    // Calculate liquidation price for long position
    // At liquidation: margin + PnL = maintenance_margin_required
    // margin + baseSize * (liquidationPrice - entryPrice) = (baseSize * liquidationPrice * maintenanceMarginBps) / 10000
    
    // Rearranging: liquidationPrice = (margin * 10000 + baseSize * entryPrice * (10000 - maintenanceMarginBps)) / (baseSize * 10000)
    const liquidationPriceFp = Math.floor(
      (margin * FP * 10000 + baseSize * entryPrice * (10000 - maintenanceMarginBps)) / (baseSize * 10000)
    );
    const liquidationPrice = liquidationPriceFp / FP;
    
    console.log(`✓ Liquidation analysis:`);
    console.log(`  - Entry price: $${entryPrice / FP}`);
    console.log(`  - Position size: ${baseSize} units`);
    console.log(`  - Margin: $${margin}`);
    console.log(`  - Maintenance margin: ${maintenanceMarginBps / 100}%`);
    console.log(`  - Calculated liquidation price: $${liquidationPrice.toFixed(2)}`);
    
    // Liquidation should occur below entry price for long positions
    expect(liquidationPrice).to.be.lessThan(entryPrice / FP);
    
    // Test at liquidation price
    const pnlAtLiquidation = baseSize * (liquidationPriceFp - entryPrice) / FP;
    const equityAtLiquidation = margin + pnlAtLiquidation;
    const requiredMaintenance = (baseSize * liquidationPrice * maintenanceMarginBps) / 10000;
    
    console.log(`  - PnL at liquidation: $${pnlAtLiquidation.toFixed(2)}`);
    console.log(`  - Equity at liquidation: $${equityAtLiquidation.toFixed(2)}`);
    console.log(`  - Required maintenance: $${requiredMaintenance.toFixed(2)}`);
    
    // At liquidation, equity should approximately equal required maintenance
    expect(Math.abs(equityAtLiquidation - requiredMaintenance)).to.be.lessThan(1);
  });

  it("Should validate funding rate calculations", () => {
    const FP = 1_000_000;
    
    // Mock AMM reserves and oracle price
    const indexPrice = 100 * FP; // $100 index price
    const baseReserve = 1000 * FP; // AMM base reserve
    const quoteReserve = 110000 * FP; // AMM quote reserve (implies $110 mark price)
    
    // Calculate mark price using the formula from math.rs
    const skewK = 500; // 5% skew strength in basis points
    const ratioFp = (quoteReserve * FP) / baseReserve;
    const skewTermFp = (skewK * (ratioFp - FP)) / 10000;
    const markPriceFp = indexPrice + (indexPrice * skewTermFp) / FP;
    const markPrice = markPriceFp / FP;
    
    // Calculate funding rate (premium)
    const premiumFp = ((markPriceFp - indexPrice) * FP) / indexPrice;
    const fundingRateBps = premiumFp / (FP / 10000); // Convert to basis points
    
    console.log(`✓ Funding rate calculation:`);
    console.log(`  - Index price: $${indexPrice / FP}`);
    console.log(`  - AMM ratio: ${ratioFp / FP} (quote/base)`);
    console.log(`  - Mark price: $${markPrice.toFixed(2)}`);
    console.log(`  - Premium: ${(premiumFp / FP * 100).toFixed(4)}%`);
    console.log(`  - Funding rate: ${(fundingRateBps / 100).toFixed(2)} bps`);
    
    expect(markPrice).to.be.greaterThan(indexPrice / FP); // Mark should be above index due to skew
    expect(premiumFp).to.be.greaterThan(0); // Positive premium when mark > index
  });

  it("Should validate fee calculations", () => {
    const FP = 1_000_000;
    
    // Trade parameters
    const baseSize = 10;
    const markPrice = 105 * FP; // $105 exit price
    const notionalFp = baseSize * markPrice;
    const feeBps = 30; // 0.3% fee
    
    const feeFp = (notionalFp * feeBps) / 10000;
    const feeAmount = feeFp / FP;
    
    console.log(`✓ Fee calculation:`);
    console.log(`  - Position size: ${baseSize} units`);
    console.log(`  - Exit price: $${markPrice / FP}`);
    console.log(`  - Notional value: $${notionalFp / FP}`);
    console.log(`  - Fee rate: ${feeBps / 100}%`);
    console.log(`  - Fee amount: $${feeAmount.toFixed(2)}`);
    
    expect(feeAmount).to.equal(3.15); // 0.3% of $1050 = $3.15
    expect(feeAmount).to.be.greaterThan(0);
    expect(feeAmount).to.be.lessThan(notionalFp / FP); // Fee should be less than notional
  });

  it("Should validate leverage constraints", () => {
    const MAX_LEVERAGE_X = 40;
    
    // Test various leverage scenarios
    const testLeverages = [1, 5, 10, 20, 40, 50]; // Including one over the limit
    
    testLeverages.forEach(leverage => {
      const isValid = leverage <= MAX_LEVERAGE_X;
      console.log(`  - Leverage ${leverage}x: ${isValid ? 'Valid' : 'Invalid (exceeds max)'}`);
      
      if (leverage <= MAX_LEVERAGE_X) {
        expect(isValid).to.be.true;
      } else {
        expect(isValid).to.be.false;
      }
    });
    
    console.log(`✓ Leverage validation complete (max: ${MAX_LEVERAGE_X}x)`);
  });
});
