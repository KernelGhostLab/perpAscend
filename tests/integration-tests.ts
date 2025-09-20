import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { 
  Connection, 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";

// Mock implementation of protocol state and logic for complex testing
class MockPerpAscentProtocol {
  private markets: Map<string, any> = new Map();
  private positions: Map<string, any> = new Map();
  private config: any = {};
  private FP = 1_000_000;

  constructor() {
    // Initialize with default config
    this.config = {
      feeBps: 30, // 0.3%
      liqFeeBps: 500, // 5%
      creatorRewardBps: 100, // 1%
      paused: false,
      maxLeverage: 40
    };
  }

  // Create a new market
  createMarket(params: {
    symbol: string;
    baseDecimals: number;
    skewK: number;
    maxPositionBase: number;
    maintenanceMarginBps: number;
    leverageCap: number;
    baseReserve: number;
    quoteReserve: number;
    oraclePrice: number;
  }) {
    const market = {
      ...params,
      fundingRate: 0,
      lastFundingTs: Date.now(),
      totalLongSize: 0,
      totalShortSize: 0,
    };
    
    this.markets.set(params.symbol, market);
    return market;
  }

  // Calculate mark price with AMM skew
  getMarkPrice(symbol: string): number {
    const market = this.markets.get(symbol);
    if (!market) throw new Error("Market not found");

    const ratio = (market.quoteReserve * this.FP) / market.baseReserve;
    const skewTerm = (market.skewK * (ratio - this.FP)) / 10000;
    const markPrice = market.oraclePrice + (market.oraclePrice * skewTerm) / this.FP;
    
    return Math.max(markPrice, 1);
  }

  // Open a position
  openPosition(params: {
    user: string;
    symbol: string;
    isLong: boolean;
    quoteAmount: number;
    leverage: number;
  }) {
    const market = this.markets.get(params.symbol);
    if (!market) throw new Error("Market not found");

    if (params.leverage > this.config.maxLeverage) {
      throw new Error("Leverage too high");
    }

    const markPrice = this.getMarkPrice(params.symbol);
    const margin = params.quoteAmount / params.leverage;
    const baseSize = params.quoteAmount / markPrice;

    if (baseSize > market.maxPositionBase) {
      throw new Error("Position too large");
    }

    const positionKey = `${params.user}-${params.symbol}`;
    const position = {
      user: params.user,
      market: params.symbol,
      isLong: params.isLong,
      baseSize: params.isLong ? baseSize : -baseSize,
      entryPrice: markPrice,
      margin: margin,
      openTime: Date.now()
    };

    this.positions.set(positionKey, position);

    // Update market totals
    if (params.isLong) {
      market.totalLongSize += baseSize;
    } else {
      market.totalShortSize += baseSize;
    }

    return position;
  }

  // Calculate position PnL
  getPositionPnL(user: string, symbol: string): {
    position: any;
    pnl: number;
    equity: number;
    liquidationPrice: number;
  } {
    const positionKey = `${user}-${symbol}`;
    const position = this.positions.get(positionKey);
    if (!position) throw new Error("Position not found");

    const market = this.markets.get(symbol);
    const currentPrice = this.getMarkPrice(symbol);

    const pnl = position.baseSize * (currentPrice - position.entryPrice);
    const equity = position.margin + pnl;

    // Calculate liquidation price
    const maintenanceMargin = (Math.abs(position.baseSize) * currentPrice * market.maintenanceMarginBps) / 10000;
    const liquidationPrice = position.isLong 
      ? position.entryPrice - (position.margin - maintenanceMargin) / Math.abs(position.baseSize)
      : position.entryPrice + (position.margin - maintenanceMargin) / Math.abs(position.baseSize);

    return {
      position,
      pnl,
      equity,
      liquidationPrice
    };
  }

  // Check if position should be liquidated
  isLiquidatable(user: string, symbol: string): boolean {
    const { equity, liquidationPrice } = this.getPositionPnL(user, symbol);
    const currentPrice = this.getMarkPrice(symbol);
    
    const position = this.positions.get(`${user}-${symbol}`);
    if (!position) return false;

    return position.isLong ? currentPrice <= liquidationPrice : currentPrice >= liquidationPrice;
  }

  // Simulate market price movement
  updateOraclePrice(symbol: string, newPrice: number) {
    const market = this.markets.get(symbol);
    if (!market) throw new Error("Market not found");
    
    market.oraclePrice = newPrice;
  }

  // Close position
  closePosition(user: string, symbol: string) {
    const positionKey = `${user}-${symbol}`;
    const position = this.positions.get(positionKey);
    if (!position) throw new Error("Position not found");

    const { pnl } = this.getPositionPnL(user, symbol);
    const currentPrice = this.getMarkPrice(symbol);
    
    // Calculate fees
    const notional = Math.abs(position.baseSize) * currentPrice;
    const fee = (notional * this.config.feeBps) / 10000;
    
    const finalPnl = pnl - fee;
    const settlement = position.margin + finalPnl;

    // Update market totals
    const market = this.markets.get(symbol);
    if (position.isLong) {
      market.totalLongSize -= Math.abs(position.baseSize);
    } else {
      market.totalShortSize -= Math.abs(position.baseSize);
    }

    this.positions.delete(positionKey);

    return {
      pnl: finalPnl,
      fee,
      settlement: Math.max(settlement, 0) // Can't settle negative
    };
  }
}

describe("PerpAscent Protocol - Complex Integration Tests", () => {
  let protocol: MockPerpAscentProtocol;

  beforeEach(() => {
    protocol = new MockPerpAscentProtocol();
  });

  it("Should create and manage multiple markets", () => {
    // Create BTC market
    const btcMarket = protocol.createMarket({
      symbol: "BTC",
      baseDecimals: 8,
      skewK: 500, // 5% skew factor
      maxPositionBase: 10,
      maintenanceMarginBps: 1000, // 10%
      leverageCap: 20,
      baseReserve: 100_000_000, // 1 BTC in satoshis
      quoteReserve: 4_500_000_000_000, // $45,000 in cents
      oraclePrice: 45000_000_000 // $45,000 in fixed point
    });

    // Create ETH market
    const ethMarket = protocol.createMarket({
      symbol: "ETH",
      baseDecimals: 18,
      skewK: 300, // 3% skew factor
      maxPositionBase: 100,
      maintenanceMarginBps: 800, // 8%
      leverageCap: 25,
      baseReserve: 1000_000_000_000_000_000, // 1 ETH in wei
      quoteReserve: 3000_000_000_000, // $3,000 in cents
      oraclePrice: 3000_000_000 // $3,000 in fixed point
    });

    expect(btcMarket.symbol).to.equal("BTC");
    expect(ethMarket.symbol).to.equal("ETH");

    const btcMarkPrice = protocol.getMarkPrice("BTC");
    const ethMarkPrice = protocol.getMarkPrice("ETH");

    console.log(`✓ BTC Mark Price: $${(btcMarkPrice / 1_000_000).toFixed(2)}`);
    console.log(`✓ ETH Mark Price: $${(ethMarkPrice / 1_000_000).toFixed(2)}`);

    expect(btcMarkPrice).to.be.greaterThan(45000_000_000); // Should be above oracle due to skew
    expect(ethMarkPrice).to.be.greaterThan(3000_000_000);
  });

  it("Should handle complex multi-position scenarios", async () => {
    // Setup BTC market
    protocol.createMarket({
      symbol: "BTC",
      baseDecimals: 8,
      skewK: 500,
      maxPositionBase: 10,
      maintenanceMarginBps: 1000,
      leverageCap: 20,
      baseReserve: 100_000_000,
      quoteReserve: 4_500_000_000_000,
      oraclePrice: 45000_000_000
    });

    // User A opens long position
    const positionA = protocol.openPosition({
      user: "userA",
      symbol: "BTC",
      isLong: true,
      quoteAmount: 10000, // $10,000
      leverage: 10
    });

    // User B opens short position
    const positionB = protocol.openPosition({
      user: "userB", 
      symbol: "BTC",
      isLong: false,
      quoteAmount: 5000, // $5,000
      leverage: 5
    });

    console.log(`✓ Position A: ${positionA.baseSize.toFixed(6)} BTC long @ $${(positionA.entryPrice / 1_000_000).toFixed(2)}`);
    console.log(`✓ Position B: ${Math.abs(positionB.baseSize).toFixed(6)} BTC short @ $${(positionB.entryPrice / 1_000_000).toFixed(2)}`);

    // Simulate price movement - BTC goes to $50,000
    protocol.updateOraclePrice("BTC", 50000_000_000);

    const pnlA = protocol.getPositionPnL("userA", "BTC");
    const pnlB = protocol.getPositionPnL("userB", "BTC");

    console.log(`✓ After price move to $50k:`);
    console.log(`  - User A PnL: $${(pnlA.pnl / 1_000_000).toFixed(2)} (Equity: $${(pnlA.equity / 1_000_000).toFixed(2)})`);
    console.log(`  - User B PnL: $${(pnlB.pnl / 1_000_000).toFixed(2)} (Equity: $${(pnlB.equity / 1_000_000).toFixed(2)})`);

    // Long position should profit, short should lose
    expect(pnlA.pnl).to.be.greaterThan(0);
    expect(pnlB.pnl).to.be.lessThan(0);

    // Close positions
    const settlementA = protocol.closePosition("userA", "BTC");
    const settlementB = protocol.closePosition("userB", "BTC");

    console.log(`✓ Final settlements:`);
    console.log(`  - User A: $${(settlementA.settlement / 1_000_000).toFixed(2)} (PnL: $${(settlementA.pnl / 1_000_000).toFixed(2)}, Fee: $${(settlementA.fee / 1_000_000).toFixed(2)})`);
    console.log(`  - User B: $${(settlementB.settlement / 1_000_000).toFixed(2)} (PnL: $${(settlementB.pnl / 1_000_000).toFixed(2)}, Fee: $${(settlementB.fee / 1_000_000).toFixed(2)})`);
  });

  it("Should properly handle liquidation scenarios", () => {
    protocol.createMarket({
      symbol: "ETH",
      baseDecimals: 18,
      skewK: 300,
      maxPositionBase: 100,
      maintenanceMarginBps: 1000, // 10%
      leverageCap: 25,
      baseReserve: 1000_000_000_000_000_000,
      quoteReserve: 3000_000_000_000,
      oraclePrice: 3000_000_000 // $3,000
    });

    // Open high-leverage position susceptible to liquidation
    const position = protocol.openPosition({
      user: "riskUser",
      symbol: "ETH",
      isLong: true,
      quoteAmount: 1000, // $1,000
      leverage: 20 // 20x leverage - risky!
    });

    console.log(`✓ Risky position: ${position.baseSize.toFixed(6)} ETH @ $${(position.entryPrice / 1_000_000).toFixed(2)}`);
    console.log(`✓ Margin: $${(position.margin / 1_000_000).toFixed(2)}`);

    const initialPnL = protocol.getPositionPnL("riskUser", "ETH");
    console.log(`✓ Liquidation price: $${(initialPnL.liquidationPrice / 1_000_000).toFixed(2)}`);

    // Price drops by 4% - should approach liquidation
    protocol.updateOraclePrice("ETH", 2880_000_000); // 4% drop

    const nearLiqPnL = protocol.getPositionPnL("riskUser", "ETH");
    console.log(`✓ At $2,880 - Equity: $${(nearLiqPnL.equity / 1_000_000).toFixed(2)}`);

    // Price drops by 5% - should trigger liquidation
    protocol.updateOraclePrice("ETH", 2850_000_000); // 5% drop

    const isLiquidatable = protocol.isLiquidatable("riskUser", "ETH");
    console.log(`✓ Position liquidatable: ${isLiquidatable}`);
    
    expect(isLiquidatable).to.be.true;

    // Lower leverage position should survive
    protocol.openPosition({
      user: "safeUser",
      symbol: "ETH", 
      isLong: true,
      quoteAmount: 1000,
      leverage: 5 // Much safer
    });

    const safePnL = protocol.getPositionPnL("safeUser", "ETH");
    const safeIsLiquidatable = protocol.isLiquidatable("safeUser", "ETH");
    
    console.log(`✓ Safe position equity: $${(safePnL.equity / 1_000_000).toFixed(2)}`);
    console.log(`✓ Safe position liquidatable: ${safeIsLiquidatable}`);
    
    expect(safeIsLiquidatable).to.be.false;
  });
});
