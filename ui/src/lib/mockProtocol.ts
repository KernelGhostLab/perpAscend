// Mock PerpAscend Protocol for UI testing
export interface Market {
  symbol: string;
  baseDecimals: number;
  oraclePrice: number;
  markPrice: number;
  skewK: number;
  maxPositionBase: number;
  maintenanceMarginBps: number;
  leverageCap: number;
  baseReserve: number;
  quoteReserve: number;
  fundingRate: number;
  totalLongSize: number;
  totalShortSize: number;
}

export interface Position {
  id: string;
  user: string;
  market: string;
  isLong: boolean;
  baseSize: number;
  entryPrice: number;
  margin: number;
  openTime: number;
  pnl: number;
  equity: number;
  liquidationPrice: number;
}

export interface Trade {
  id: string;
  user: string;
  market: string;
  type: 'open' | 'close' | 'liquidate';
  isLong: boolean;
  size: number;
  price: number;
  fee: number;
  timestamp: number;
}

export interface StopLossOrder {
  id: string;
  positionId: string;
  user: string;
  market: string;
  triggerPrice: number;
  closePercentage: number;
  isLong: boolean;
  status: 'active' | 'triggered' | 'cancelled' | 'expired';
  createdAt: number;
  triggeredAt?: number;
  currentPrice: number;
  distanceToTrigger: number;
  estimatedLoss: number;
}

class MockProtocol {
  private markets: Map<string, Market> = new Map();
  private positions: Map<string, Position> = new Map();
  private trades: Trade[] = [];
  private stopLossOrders: Map<string, StopLossOrder> = new Map();
  private FP = 1_000_000;
  
  constructor() {
    this.initializeDefaultMarkets();
  }

  private initializeDefaultMarkets() {
    // BTC Market
    this.markets.set('BTC', {
      symbol: 'BTC',
      baseDecimals: 8,
      oraclePrice: 45000 * this.FP,
      markPrice: 45250 * this.FP,
      skewK: 500,
      maxPositionBase: 10,
      maintenanceMarginBps: 1000,
      leverageCap: 20,
      baseReserve: 1 * this.FP,
      quoteReserve: 45250 * this.FP,
      fundingRate: 125, // 1.25 bps
      totalLongSize: 5.2,
      totalShortSize: 4.8
    });

    // ETH Market  
    this.markets.set('ETH', {
      symbol: 'ETH',
      baseDecimals: 18,
      oraclePrice: 3000 * this.FP,
      markPrice: 3015 * this.FP,
      skewK: 300,
      maxPositionBase: 100,
      maintenanceMarginBps: 800,
      leverageCap: 25,
      baseReserve: 10 * this.FP,
      quoteReserve: 30150 * this.FP,
      fundingRate: -75, // -0.75 bps
      totalLongSize: 45.5,
      totalShortSize: 52.1
    });

    // SOL Market
    this.markets.set('SOL', {
      symbol: 'SOL',
      baseDecimals: 9,
      oraclePrice: 150 * this.FP,
      markPrice: 151.5 * this.FP,
      skewK: 800,
      maxPositionBase: 1000,
      maintenanceMarginBps: 1200,
      leverageCap: 15,
      baseReserve: 100 * this.FP,
      quoteReserve: 15150 * this.FP,
      fundingRate: 200, // 2.0 bps
      totalLongSize: 1250,
      totalShortSize: 980
    });
  }

  getMarkets(): Market[] {
    return Array.from(this.markets.values());
  }

  getMarket(symbol: string): Market | undefined {
    return this.markets.get(symbol);
  }

  calculateMarkPrice(symbol: string): number {
    const market = this.markets.get(symbol);
    if (!market) return 0;

    const ratio = (market.quoteReserve * this.FP) / market.baseReserve;
    const skewTerm = (market.skewK * (ratio - this.FP)) / 10000;
    const markPrice = market.oraclePrice + (market.oraclePrice * skewTerm) / this.FP;
    
    return Math.max(markPrice, 1);
  }

  openPosition(params: {
    user: string;
    symbol: string;
    isLong: boolean;
    quoteAmount: number;
    leverage: number;
  }): Position {
    const market = this.markets.get(params.symbol);
    if (!market) throw new Error("Market not found");

    if (params.leverage > market.leverageCap) {
      throw new Error("Leverage too high");
    }

    const markPrice = this.calculateMarkPrice(params.symbol);
    const margin = params.quoteAmount / params.leverage;
    const baseSize = params.quoteAmount / (markPrice / this.FP);

    if (baseSize > market.maxPositionBase) {
      throw new Error("Position too large");
    }

    const positionId = `${params.user}-${params.symbol}-${Date.now()}`;
    const position: Position = {
      id: positionId,
      user: params.user,
      market: params.symbol,
      isLong: params.isLong,
      baseSize: params.isLong ? baseSize : -baseSize,
      entryPrice: markPrice,
      margin: margin * this.FP,
      openTime: Date.now(),
      pnl: 0,
      equity: margin * this.FP,
      liquidationPrice: this.calculateLiquidationPrice(markPrice, baseSize, margin * this.FP, params.isLong, market.maintenanceMarginBps)
    };

    this.positions.set(positionId, position);

    // Update market totals
    if (params.isLong) {
      market.totalLongSize += baseSize;
    } else {
      market.totalShortSize += baseSize;
    }

    // Record trade
    this.trades.push({
      id: `trade-${Date.now()}`,
      user: params.user,
      market: params.symbol,
      type: 'open',
      isLong: params.isLong,
      size: baseSize,
      price: markPrice,
      fee: params.quoteAmount * 0.003, // 0.3% fee
      timestamp: Date.now()
    });

    return position;
  }

  private calculateLiquidationPrice(entryPrice: number, baseSize: number, margin: number, isLong: boolean, maintenanceMarginBps: number): number {
    const maintenanceMargin = (Math.abs(baseSize) * entryPrice * maintenanceMarginBps) / (10000 * this.FP);
    
    if (isLong) {
      return entryPrice - ((margin / this.FP) - maintenanceMargin) * this.FP / Math.abs(baseSize);
    } else {
      return entryPrice + ((margin / this.FP) - maintenanceMargin) * this.FP / Math.abs(baseSize);
    }
  }

  getPositions(user?: string): Position[] {
    let positions = Array.from(this.positions.values());
    if (user) {
      positions = positions.filter(p => p.user === user);
    }

    // Update PnL for each position
    return positions.map(pos => this.updatePositionPnL(pos));
  }

  private updatePositionPnL(position: Position): Position {
    const market = this.markets.get(position.market);
    if (!market) return position;

    const currentPrice = this.calculateMarkPrice(position.market);
    const pnl = position.baseSize * (currentPrice - position.entryPrice);
    const equity = position.margin + pnl;

    return {
      ...position,
      pnl,
      equity
    };
  }

  closePosition(positionId: string): { pnl: number; fee: number; settlement: number } {
    const position = this.positions.get(positionId);
    if (!position) throw new Error("Position not found");

    const updatedPosition = this.updatePositionPnL(position);
    const currentPrice = this.calculateMarkPrice(position.market);
    
    const notional = Math.abs(position.baseSize) * (currentPrice / this.FP);
    const fee = notional * 0.003; // 0.3% fee
    const finalPnl = updatedPosition.pnl - fee * this.FP;
    const settlement = Math.max((updatedPosition.margin + finalPnl) / this.FP, 0);

    // Update market totals
    const market = this.markets.get(position.market);
    if (market) {
      if (position.isLong) {
        market.totalLongSize -= Math.abs(position.baseSize);
      } else {
        market.totalShortSize -= Math.abs(position.baseSize);
      }
    }

    // Record trade
    this.trades.push({
      id: `trade-${Date.now()}`,
      user: position.user,
      market: position.market,
      type: 'close',
      isLong: position.isLong,
      size: Math.abs(position.baseSize),
      price: currentPrice,
      fee: fee,
      timestamp: Date.now()
    });

    this.positions.delete(positionId);

    return {
      pnl: finalPnl / this.FP,
      fee,
      settlement
    };
  }

  updateOraclePrice(symbol: string, newPrice: number) {
    const market = this.markets.get(symbol);
    if (!market) return;
    
    market.oraclePrice = newPrice * this.FP;
    market.markPrice = this.calculateMarkPrice(symbol);
    
    // Update funding rate based on mark/oracle divergence
    const premium = ((market.markPrice - market.oraclePrice) * this.FP) / market.oraclePrice;
    market.fundingRate = Math.floor(premium / (this.FP / 10000)); // Convert to bps
  }

  getTrades(limit: number = 50): Trade[] {
    return this.trades
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getProtocolStats() {
    const markets = this.getMarkets();
    const positions = this.getPositions();
    
    const totalTVL = positions.reduce((sum, pos) => sum + (pos.margin / this.FP), 0);
    const totalVolume = markets.reduce((sum, market) => 
      sum + (market.totalLongSize + market.totalShortSize) * (market.markPrice / this.FP), 0
    );
    const openPositions = positions.length;
    const totalTrades = this.trades.length;
    
    return {
      totalTVL,
      totalVolume,
      openPositions,
      totalTrades,
      markets: markets.length
    };
  }

  // Advanced position management methods
  partialClosePosition(positionId: string, closePercentage: number): { 
    pnl: number; 
    settlement: number; 
    remainingSize: number; 
  } {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    if (closePercentage <= 0 || closePercentage >= 100) {
      throw new Error('Close percentage must be between 1-99%');
    }

    const market = this.markets.get(position.market);
    if (!market) {
      throw new Error('Market not found');
    }

    // Update position PnL before calculations
    const updatedPositionForCalc = this.updatePositionPnL(position);

    // Calculate partial close amounts
    const closeSize = (Math.abs(position.baseSize) * closePercentage) / 100;
    const remainingSize = Math.abs(position.baseSize) - closeSize;
    const closeSizeNotional = closeSize * (market.markPrice / this.FP);
    
    // Calculate PnL for closed portion
    const entryPrice = position.entryPrice / this.FP;
    const exitPrice = market.markPrice / this.FP;
    const closedPnl = position.isLong
      ? (exitPrice - entryPrice) * closeSize
      : (entryPrice - exitPrice) * closeSize;

    // Calculate settlement after fees
    const fee = closeSizeNotional * (market.maintenanceMarginBps / 10000 * 0.5); // Use half maintenance as trading fee
    const settlement = closedPnl + (position.margin / this.FP * closePercentage / 100) - fee;

    // Update position
    const remainingPercentage = 100 - closePercentage;
    const updatedPosition: Position = {
      ...position,
      baseSize: position.isLong 
        ? (position.baseSize * remainingPercentage) / 100
        : (position.baseSize * remainingPercentage) / 100,
      margin: (position.margin * remainingPercentage) / 100,
      pnl: position.pnl * remainingPercentage / 100,
      equity: (position.margin * remainingPercentage / 100) + (position.pnl * remainingPercentage / 100)
    };

    this.positions.set(positionId, updatedPosition);

    // Record trade
    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: position.user,
      market: position.market,
      type: 'close',
      isLong: position.isLong,
      size: closeSize,
      price: market.markPrice,
      fee: fee * this.FP,
      timestamp: Date.now()
    };
    this.trades.push(trade);

    return {
      pnl: closedPnl,
      settlement: settlement,
      remainingSize: remainingSize
    };
  }

  modifyPositionMargin(positionId: string, marginChange: number, isDeposit: boolean): void {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    const marginChangeInFp = marginChange * this.FP;
    let newMargin: number;

    if (isDeposit) {
      newMargin = position.margin + marginChangeInFp;
    } else {
      if (marginChangeInFp >= position.margin) {
        throw new Error('Cannot remove more margin than available');
      }
      newMargin = position.margin - marginChangeInFp;
      
      // Check if remaining margin meets minimum requirements
      const market = this.markets.get(position.market);
      if (market) {
        const notionalValue = Math.abs(position.baseSize) * (market.markPrice / this.FP);
        const requiredMargin = notionalValue * (market.maintenanceMarginBps / 10000);
        
        if ((newMargin / this.FP) < requiredMargin) {
          throw new Error('Insufficient margin - would trigger liquidation');
        }
      }
    }

    const updatedPosition: Position = {
      ...position,
      margin: newMargin,
      equity: newMargin + position.pnl
    };

    this.positions.set(positionId, updatedPosition);
  }

  setStopLoss(positionId: string, triggerPrice: number, closePercentage: number): string {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    if (closePercentage <= 0 || closePercentage > 100) {
      throw new Error('Close percentage must be between 1-100%');
    }

    const market = this.markets.get(position.market);
    if (!market) {
      throw new Error('Market not found');
    }

    const currentPrice = market.markPrice / this.FP;

    // Validate stop loss price
    if (position.isLong && triggerPrice >= currentPrice) {
      throw new Error('Stop loss price must be below current price for long positions');
    }
    if (!position.isLong && triggerPrice <= currentPrice) {
      throw new Error('Stop loss price must be above current price for short positions');
    }

    // In a real implementation, this would create a stop loss order on-chain
    // For now, we'll just store the stop loss details in the position
    const stopLossId = `sl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Stop loss order created: ${stopLossId}`, {
      positionId,
      triggerPrice,
      closePercentage,
      currentPrice
    });

    return stopLossId;
  }

  // Public method to access positions for UI advanced features
  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  // Public method to update a position (for UI simulations)
  updatePosition(positionId: string, updates: Partial<Position>): void {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }
    
    this.positions.set(positionId, { ...position, ...updates });
  }

  // Stop-Loss Order Management
  getStopLossOrders(): StopLossOrder[] {
    return Array.from(this.stopLossOrders.values()).map(order => {
      // Update current market data for each order
      const market = this.markets.get(order.market);
      if (market) {
        const currentPrice = market.markPrice / this.FP;
        const distanceToTrigger = order.isLong
          ? ((currentPrice - order.triggerPrice) / currentPrice) * 100
          : ((order.triggerPrice - currentPrice) / currentPrice) * 100;
        
        return {
          ...order,
          currentPrice,
          distanceToTrigger
        };
      }
      return order;
    });
  }

  createStopLossOrder(params: {
    positionId: string;
    triggerPrice: number;
    closePercentage: number;
  }): string {
    const position = this.positions.get(params.positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    const market = this.markets.get(position.market);
    if (!market) {
      throw new Error('Market not found');
    }

    const currentPrice = market.markPrice / this.FP;
    
    // Validate trigger price
    if (position.isLong && params.triggerPrice >= currentPrice) {
      throw new Error('Stop loss price must be below current price for long positions');
    }
    if (!position.isLong && params.triggerPrice <= currentPrice) {
      throw new Error('Stop loss price must be above current price for short positions');
    }

    const orderId = `sl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const distanceToTrigger = position.isLong
      ? ((currentPrice - params.triggerPrice) / currentPrice) * 100
      : ((params.triggerPrice - currentPrice) / currentPrice) * 100;

    // Estimate potential loss
    const positionSize = Math.abs(position.baseSize);
    const closeSize = (positionSize * params.closePercentage) / 100;
    const entryPrice = position.entryPrice / this.FP;
    const estimatedPnL = position.isLong
      ? (params.triggerPrice - entryPrice) * closeSize
      : (entryPrice - params.triggerPrice) * closeSize;
    const marginAtRisk = (position.margin / this.FP) * (params.closePercentage / 100);
    const estimatedLoss = Math.max(0, -(estimatedPnL - marginAtRisk));

    const stopLossOrder: StopLossOrder = {
      id: orderId,
      positionId: params.positionId,
      user: position.user,
      market: position.market,
      triggerPrice: params.triggerPrice,
      closePercentage: params.closePercentage,
      isLong: position.isLong,
      status: 'active',
      createdAt: Date.now(),
      currentPrice,
      distanceToTrigger,
      estimatedLoss
    };

    this.stopLossOrders.set(orderId, stopLossOrder);
    return orderId;
  }

  modifyStopLossOrder(orderId: string, newTriggerPrice: number, newClosePercentage: number): void {
    const order = this.stopLossOrders.get(orderId);
    if (!order) {
      throw new Error('Stop loss order not found');
    }

    if (order.status !== 'active') {
      throw new Error('Cannot modify inactive order');
    }

    const market = this.markets.get(order.market);
    if (!market) {
      throw new Error('Market not found');
    }

    const currentPrice = market.markPrice / this.FP;
    
    // Validate new trigger price
    if (order.isLong && newTriggerPrice >= currentPrice) {
      throw new Error('Stop loss price must be below current price for long positions');
    }
    if (!order.isLong && newTriggerPrice <= currentPrice) {
      throw new Error('Stop loss price must be above current price for short positions');
    }

    // Update the order
    const updatedOrder = {
      ...order,
      triggerPrice: newTriggerPrice,
      closePercentage: newClosePercentage,
      distanceToTrigger: order.isLong
        ? ((currentPrice - newTriggerPrice) / currentPrice) * 100
        : ((newTriggerPrice - currentPrice) / currentPrice) * 100
    };

    this.stopLossOrders.set(orderId, updatedOrder);
  }

  cancelStopLossOrder(orderId: string): void {
    const order = this.stopLossOrders.get(orderId);
    if (!order) {
      throw new Error('Stop loss order not found');
    }

    this.stopLossOrders.set(orderId, {
      ...order,
      status: 'cancelled'
    });
  }

  executeStopLossOrder(orderId: string): void {
    const order = this.stopLossOrders.get(orderId);
    if (!order) {
      throw new Error('Stop loss order not found');
    }

    if (order.status !== 'active') {
      throw new Error('Cannot execute inactive order');
    }

    try {
      // Execute the partial close
      this.partialClosePosition(order.positionId, order.closePercentage);
      
      // Mark order as triggered
      this.stopLossOrders.set(orderId, {
        ...order,
        status: 'triggered',
        triggeredAt: Date.now()
      });
    } catch (error) {
      // If execution fails, keep order active
      throw error;
    }
  }

  // Check for triggered stop loss orders (would be done by oracle/keeper in real implementation)
  checkAndExecuteStopLossOrders(): void {
    const activeOrders = Array.from(this.stopLossOrders.values())
      .filter(order => order.status === 'active');

    for (const order of activeOrders) {
      const market = this.markets.get(order.market);
      if (!market) continue;

      const currentPrice = market.markPrice / this.FP;
      
      // Check if trigger condition is met
      const shouldTrigger = order.isLong
        ? currentPrice <= order.triggerPrice
        : currentPrice >= order.triggerPrice;

      if (shouldTrigger) {
        try {
          this.executeStopLossOrder(order.id);
          console.log(`Stop loss order ${order.id} triggered at price ${currentPrice}`);
        } catch (error) {
          console.error(`Failed to execute stop loss order ${order.id}:`, error);
        }
      }
    }
  }
}

export const mockProtocol = new MockProtocol();
