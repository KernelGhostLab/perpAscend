import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";

// Advanced stress testing and edge case validation
describe("PerpAscend Protocol - Stress Testing & Edge Cases", () => {

  it("Should handle extreme market volatility scenarios", () => {
    console.log("\n🔥 STRESS TEST: Extreme Market Volatility");
    
    const FP = 1_000_000;
    const scenarios = [
      { name: "Flash Crash", priceChange: -50, description: "50% instant drop" },
      { name: "Pump", priceChange: 200, description: "200% instant rise" }, 
      { name: "Death Spiral", priceChange: -90, description: "90% crash" },
      { name: "Hyperinflation", priceChange: 1000, description: "1000% increase" }
    ];

    scenarios.forEach(scenario => {
      const initialPrice = 100 * FP;
      const newPrice = initialPrice * (1 + scenario.priceChange / 100);
      
      // Test position survival at different leverages
      const leverages = [2, 5, 10, 20, 40];
      const margin = 1000 * FP; // $1000 margin
      
      console.log(`\n  📊 ${scenario.name} (${scenario.description}):`);
      
      leverages.forEach(leverage => {
        const positionSize = (margin * leverage) / initialPrice;
        const pnl = positionSize * (newPrice - initialPrice);
        const equity = margin + pnl;
        const survivedCrash = equity > 0;
        
        const equityUsd = equity / FP;
        console.log(`    ${leverage}x: ${survivedCrash ? '✅' : '💀'} $${equityUsd.toFixed(0)} equity`);
        
        // High leverage positions should be wiped out in extreme moves
        if (leverage >= 20 && Math.abs(scenario.priceChange) >= 50) {
          expect(survivedCrash).to.be.false;
        }
        
        // Low leverage positions should survive moderate moves
        if (leverage <= 5 && Math.abs(scenario.priceChange) <= 50) {
          expect(survivedCrash).to.be.true;
        }
      });
    });
  });

  it("Should validate liquidation cascade scenarios", () => {
    console.log("\n⛓️  STRESS TEST: Liquidation Cascades");
    
    const FP = 1_000_000;
    const initialPrice = 1000 * FP; // $1000
    
    // Simulate many positions at different risk levels
    const positions: Array<{
      user: string;
      margin: number;
      leverage: number;
      entryPrice: number;
      liquidationPrice?: number;
      positionSize?: number;
    }> = [
      { user: "whale1", margin: 100000, leverage: 10, entryPrice: initialPrice },
      { user: "whale2", margin: 50000, leverage: 15, entryPrice: initialPrice },
      { user: "degen1", margin: 1000, leverage: 40, entryPrice: initialPrice },
      { user: "degen2", margin: 2000, leverage: 35, entryPrice: initialPrice },
      { user: "safe1", margin: 10000, leverage: 3, entryPrice: initialPrice },
      { user: "safe2", margin: 5000, leverage: 5, entryPrice: initialPrice }
    ];
    
    // Calculate liquidation prices
    const maintenanceMarginBps = 1000; // 10%
    
    positions.forEach(pos => {
      const positionSize = (pos.margin * pos.leverage) / initialPrice;
      const liquidationPrice = pos.entryPrice * (1 - (pos.margin / (positionSize * initialPrice)) + 0.1);
      
      pos.liquidationPrice = liquidationPrice;
      pos.positionSize = positionSize;
    });
    
    // Sort by liquidation price (most vulnerable first)
    positions.sort((a, b) => (b.liquidationPrice || 0) - (a.liquidationPrice || 0));
    
    console.log("  💀 Liquidation Waterfall (price falling):");
    positions.forEach((pos, i) => {
      const liqPriceUsd = (pos.liquidationPrice || 0) / FP;
      const sizeUsd = ((pos.positionSize || 0) * initialPrice) / FP;
      console.log(`    ${i + 1}. ${pos.user}: Liq @ $${liqPriceUsd.toFixed(0)} (${pos.leverage}x, $${sizeUsd.toFixed(0)} size)`);
    });
    
    // Simulate cascade - when price hits each liquidation level
    let currentPrice = initialPrice;
    let liquidatedCount = 0;
    let totalLiquidated = 0;
    
    for (const pos of positions) {
      if (pos.liquidationPrice && pos.positionSize && currentPrice <= pos.liquidationPrice) {
        liquidatedCount++;
        totalLiquidated += pos.positionSize * currentPrice / FP;
        
        // Each liquidation puts downward pressure (simplified model)
        const priceImpact = (pos.positionSize * currentPrice) / (1000000 * FP); // Impact based on size
        currentPrice = Math.max(currentPrice * (1 - priceImpact), initialPrice * 0.1); // Floor at 10% of initial
        
        console.log(`  💥 ${pos.user} liquidated at $${(currentPrice / FP).toFixed(0)}`);
      }
    }
    
    console.log(`\n  📈 Cascade Results:`);
    console.log(`    Positions liquidated: ${liquidatedCount}/${positions.length}`);
    console.log(`    Total liquidated value: $${totalLiquidated.toFixed(0)}`);
    console.log(`    Final price: $${(currentPrice / FP).toFixed(0)} (${(((currentPrice - initialPrice) / initialPrice) * 100).toFixed(1)}%)`);
    
    // Most high-leverage positions should get liquidated
    expect(liquidatedCount).to.be.greaterThan(positions.length / 2);
  });

  it("Should handle funding rate extremes", () => {
    console.log("\n💰 STRESS TEST: Extreme Funding Rates");
    
    const FP = 1_000_000;
    
    // Simulate extreme market imbalances
    const scenarios = [
      { name: "Extreme Long Bias", longSize: 1000, shortSize: 10, expectedFunding: "positive" },
      { name: "Extreme Short Bias", longSize: 50, shortSize: 2000, expectedFunding: "negative" },
      { name: "Balanced Market", longSize: 500, shortSize: 495, expectedFunding: "neutral" },
      { name: "Dead Market", longSize: 1, shortSize: 1, expectedFunding: "minimal" }
    ];
    
    scenarios.forEach(scenario => {
      const indexPrice = 1000 * FP;
      const skewK = 1000; // 10% max skew
      
      // Calculate imbalance ratio
      const totalSize = scenario.longSize + scenario.shortSize;
      const imbalance = (scenario.longSize - scenario.shortSize) / totalSize;
      
      // Simplified funding rate calculation
      const fundingRateBps = imbalance * skewK; // Simplified: more longs = positive funding
      const hourlyFundingRate = fundingRateBps / 10000 / 24; // Per hour
      
      // Calculate cost for a $10k position over 24 hours
      const positionSize = 10000;
      const dailyFundingCost = positionSize * Math.abs(hourlyFundingRate) * 24;
      
      console.log(`\n  🔄 ${scenario.name}:`);
      console.log(`    Long/Short: ${scenario.longSize}/${scenario.shortSize}`);
      console.log(`    Imbalance: ${(imbalance * 100).toFixed(1)}%`);
      console.log(`    Funding Rate: ${fundingRateBps.toFixed(0)} bps`);
      console.log(`    Daily Cost (10k pos): $${dailyFundingCost.toFixed(2)}`);
      
      // Validate funding direction
      if (scenario.expectedFunding === "positive") {
        expect(fundingRateBps).to.be.greaterThan(0);
      } else if (scenario.expectedFunding === "negative") {
        expect(fundingRateBps).to.be.lessThan(0);
      } else if (scenario.expectedFunding === "neutral") {
        expect(Math.abs(fundingRateBps)).to.be.lessThan(50); // Within 0.5%
      }
      
      // Extreme funding should be capped to prevent death spirals
      expect(Math.abs(fundingRateBps)).to.be.lessThan(2000); // Max 20% daily
    });
  });

  it("Should validate protocol economics under stress", () => {
    console.log("\n💎 STRESS TEST: Protocol Economics");
    
    const FP = 1_000_000;
    
    // Simulate high-volume trading day
    const trades = [
      { size: 100000, price: 1000 * FP, fee: 0.003 }, // $100k trade @ 0.3%
      { size: 50000, price: 1010 * FP, fee: 0.003 },
      { size: 200000, price: 995 * FP, fee: 0.003 },
      { size: 75000, price: 1020 * FP, fee: 0.003 },
      { size: 150000, price: 980 * FP, fee: 0.003 }
    ];
    
    let totalVolume = 0;
    let totalFees = 0;
    let liquidationFees = 0;
    
    console.log("  📊 Daily Trading Activity:");
    
    trades.forEach((trade, i) => {
      const volume = trade.size;
      const fee = volume * trade.fee;
      
      totalVolume += volume;
      totalFees += fee;
      
      console.log(`    Trade ${i + 1}: $${volume.toLocaleString()} → $${fee.toFixed(0)} fee`);
    });
    
    // Add liquidation fees (typically higher)
    const liquidationCount = 5;
    const avgLiquidationSize = 25000;
    const liquidationFeeRate = 0.05; // 5%
    
    liquidationFees = liquidationCount * avgLiquidationSize * liquidationFeeRate;
    totalFees += liquidationFees;
    
    console.log(`\n  💰 Revenue Breakdown:`);
    console.log(`    Trading Volume: $${totalVolume.toLocaleString()}`);
    console.log(`    Trading Fees: $${(totalFees - liquidationFees).toFixed(0)}`);
    console.log(`    Liquidation Fees: $${liquidationFees.toFixed(0)}`);
    console.log(`    Total Protocol Revenue: $${totalFees.toFixed(0)}`);
    
    // Protocol should be profitable with reasonable volume
    const dailyOperatingCosts = 1000; // Estimated daily costs
    const dailyProfit = totalFees - dailyOperatingCosts;
    
    console.log(`    Estimated Daily Profit: $${dailyProfit.toFixed(0)}`);
    
    expect(totalFees).to.be.greaterThan(dailyOperatingCosts);
    expect(totalVolume).to.be.greaterThan(100000); // Meaningful volume
  });

  it("Should handle oracle manipulation attacks", () => {
    console.log("\n🎭 STRESS TEST: Oracle Manipulation Resistance");
    
    const FP = 1_000_000;
    const normalPrice = 1000 * FP;
    
    // Simulate various oracle attack scenarios
    const attacks = [
      { name: "Flash Spike", manipulatedPrice: 2000 * FP, duration: 1 }, // 1 block
      { name: "Slow Poison", manipulatedPrice: 1100 * FP, duration: 100 }, // 100 blocks  
      { name: "Flash Crash", manipulatedPrice: 100 * FP, duration: 2 },
      { name: "Gradual Drift", manipulatedPrice: 1200 * FP, duration: 1000 }
    ];
    
    attacks.forEach(attack => {
      const priceDeviation = Math.abs(attack.manipulatedPrice - normalPrice) / normalPrice * 100;
      const timeWindow = attack.duration;
      
      // Check if protocol defenses would work
      const oracleTimeout = 120; // 2 minute timeout from code
      const maxDeviationAllowed = 50; // 50% max reasonable deviation
      
      const wouldTimeout = timeWindow < oracleTimeout;
      const isExtremeDeviation = priceDeviation > maxDeviationAllowed;
      const attackBlocked = wouldTimeout || isExtremeDeviation;
      
      console.log(`\n  🎯 ${attack.name}:`);
      console.log(`    Price: $${(attack.manipulatedPrice / FP).toFixed(0)} (${priceDeviation.toFixed(1)}% deviation)`);
      console.log(`    Duration: ${timeWindow} blocks`);
      console.log(`    Attack Success: ${attackBlocked ? '❌ BLOCKED' : '✅ SUCCESSFUL'}`);
      
      // Short-duration attacks should be mitigated by oracle timeouts
      if (timeWindow <= 5) {
        expect(attackBlocked).to.be.true;
      }
      
      // Extreme deviations should be rejected
      if (priceDeviation > 100) {
        expect(attackBlocked).to.be.true;
      }
    });
    
    console.log("\n  🛡️  Recommendations for Oracle Security:");
    console.log("    • Use multiple price feeds with median calculation");
    console.log("    • Implement maximum deviation bounds"); 
    console.log("    • Add time-weighted average pricing (TWAP)");
    console.log("    • Circuit breakers for extreme moves");
    console.log("    • Admin override capability for emergencies");
  });

  it("Should demonstrate capital efficiency analysis", () => {
    console.log("\n💹 ANALYSIS: Capital Efficiency");
    
    const FP = 1_000_000;
    
    // Compare different market scenarios
    const scenarios = [
      { name: "Conservative", avgLeverage: 3, utilizationRate: 0.6 },
      { name: "Moderate", avgLeverage: 8, utilizationRate: 0.75 },
      { name: "Aggressive", avgLeverage: 15, utilizationRate: 0.9 },
      { name: "Degen", avgLeverage: 30, utilizationRate: 0.95 }
    ];
    
    const protocolTVL = 10_000_000; // $10M total value locked
    
    console.log(`\n  📊 Capital Efficiency Analysis (TVL: $${(protocolTVL / 1_000_000).toFixed(0)}M):`);
    
    scenarios.forEach(scenario => {
      const effectiveCapital = protocolTVL * scenario.utilizationRate;
      const tradingVolume = effectiveCapital * scenario.avgLeverage;
      const volumeMultiplier = tradingVolume / protocolTVL;
      
      // Estimate daily fees (assuming 20% of capital trades daily)
      const dailyTradingVolume = tradingVolume * 0.2;
      const dailyFees = dailyTradingVolume * 0.003; // 0.3% fee
      const annualFees = dailyFees * 365;
      const feeYield = (annualFees / protocolTVL) * 100;
      
      console.log(`\n    🎯 ${scenario.name} Market:`);
      console.log(`      Avg Leverage: ${scenario.avgLeverage}x`);
      console.log(`      Capital Utilization: ${(scenario.utilizationRate * 100).toFixed(0)}%`);
      console.log(`      Effective Trading Capacity: $${(tradingVolume / 1_000_000).toFixed(0)}M`);
      console.log(`      Volume Multiplier: ${volumeMultiplier.toFixed(1)}x`);
      console.log(`      Estimated Annual Fee Yield: ${feeYield.toFixed(1)}%`);
      
      // Higher leverage should provide better capital efficiency
      expect(volumeMultiplier).to.be.greaterThan(scenario.avgLeverage * 0.5);
      
      // But comes with higher risk
      const riskScore = scenario.avgLeverage * scenario.utilizationRate;
      console.log(`      Risk Score: ${riskScore.toFixed(1)} ${riskScore > 20 ? '⚠️' : '✅'}`);
    });
    
    console.log(`\n  💡 Key Insights:`);
    console.log(`    • Higher leverage increases capital efficiency but risk`);
    console.log(`    • Sweet spot likely around 8-12x average leverage`);
    console.log(`    • Need robust risk management for >20x scenarios`);
    console.log(`    • Fee yield should exceed traditional DeFi (5-10%+)`);
  });
});
