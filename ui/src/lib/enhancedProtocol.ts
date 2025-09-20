// Enhanced Protocol with Real-Time Data Integration
import { RealTimeDataService, RealTimePrice, useRealTimePrices } from './realTimeDataService';
import { mockProtocol, Market, Position, Trade } from './mockProtocol';

export class EnhancedProtocol {
  private realTimeService: RealTimeDataService;
  private useRealData: boolean = false;
  private priceCache: Map<string, RealTimePrice> = new Map();

  constructor() {
    this.realTimeService = new RealTimeDataService();
  }

  // Toggle between mock and real data
  setUseRealData(useReal: boolean) {
    this.useRealData = useReal;
    if (useReal) {
      this.startRealTimeUpdates();
    }
  }

  // Start real-time price updates
  private async startRealTimeUpdates() {
    const symbols = ['SOL/USD', 'BTC/USD', 'ETH/USD', 'USDC/USD'];
    
    // Use CoinGecko for reliable free data
    await this.realTimeService.subscribeToCoinGeckoPrices(symbols, (priceData) => {
      this.priceCache.set(priceData.symbol, priceData);
      console.log(`Real-time price update: ${priceData.symbol} = $${priceData.price}`);
    });
  }

  // Enhanced getMarkets with real prices
  getMarkets(): Market[] {
    const markets = mockProtocol.getMarkets();
    
    if (this.useRealData) {
      return markets.map(market => {
        const priceData = this.priceCache.get(`${market.symbol}/USD`);
        if (priceData) {
          return {
            ...market,
            oraclePrice: priceData.price,
            markPrice: priceData.price * (0.999 + Math.random() * 0.002), // Small spread
          };
        }
        return market;
      });
    }
    
    return markets;
  }

  // Enhanced getPositions with real-time P&L
  getPositions(): Position[] {
    const positions = mockProtocol.getPositions();
    
    if (this.useRealData) {
      return positions.map(position => {
        const priceData = this.priceCache.get(`${position.market}/USD`);
        if (priceData) {
          const currentPrice = priceData.price;
          const priceDiff = currentPrice - position.entryPrice;
          const pnl = position.isLong 
            ? priceDiff * position.baseSize
            : -priceDiff * position.baseSize;
          
          const equity = position.margin + pnl;
          
          return {
            ...position,
            pnl,
            equity,
            liquidationPrice: this.calculateLiquidationPrice(position, currentPrice),
          };
        }
        return position;
      });
    }
    
    return positions;
  }

  // Enhanced getTrades with real price references
  getTrades(limit?: number): Trade[] {
    const trades = mockProtocol.getTrades(limit);
    
    if (this.useRealData) {
      return trades.map(trade => {
        const priceData = this.priceCache.get(`${trade.market}/USD`);
        if (priceData) {
          // Use real price with some historical variation
          const historicalVariation = (Math.random() - 0.5) * 0.1; // ±5% variation
          return {
            ...trade,
            price: priceData.price * (1 + historicalVariation),
          };
        }
        return trade;
      });
    }
    
    return trades;
  }

  // Calculate liquidation price with real market data
  private calculateLiquidationPrice(position: Position, currentPrice: number): number {
    const maintenanceMargin = 0.05; // 5%
    const liquidationBuffer = position.margin * maintenanceMargin;
    
    if (position.isLong) {
      return position.entryPrice - liquidationBuffer / position.baseSize;
    } else {
      return position.entryPrice + liquidationBuffer / position.baseSize;
    }
  }

  // Get real-time price for a specific symbol
  getCurrentPrice(symbol: string): number | null {
    const priceData = this.priceCache.get(`${symbol}/USD`);
    return priceData?.price || null;
  }

  // Get price change for a symbol
  getPriceChange24h(symbol: string): number | null {
    const priceData = this.priceCache.get(`${symbol}/USD`);
    return priceData?.change24h || null;
  }

  // Get volume for a symbol
  getVolume24h(symbol: string): number | null {
    const priceData = this.priceCache.get(`${symbol}/USD`);
    return priceData?.volume24h || null;
  }

  // Pass through all other mockProtocol methods
  async partialClosePosition(positionId: string, closePercentage: number) {
    return mockProtocol.partialClosePosition(positionId, closePercentage);
  }

  async modifyPositionMargin(positionId: string, marginChange: number, isDeposit: boolean) {
    return mockProtocol.modifyPositionMargin(positionId, marginChange, isDeposit);
  }

  async setStopLoss(positionId: string, triggerPrice: number, closePercentage: number) {
    return mockProtocol.setStopLoss(positionId, triggerPrice, closePercentage);
  }

  getStopLossOrders() {
    return mockProtocol.getStopLossOrders();
  }

  async modifyStopLossOrder(orderId: string, newTriggerPrice: number, newClosePercentage: number) {
    return mockProtocol.modifyStopLossOrder(orderId, newTriggerPrice, newClosePercentage);
  }

  async cancelStopLossOrder(orderId: string) {
    return mockProtocol.cancelStopLossOrder(orderId);
  }

  async executeStopLossOrder(orderId: string) {
    return mockProtocol.executeStopLossOrder(orderId);
  }

  // Cleanup method
  disconnect() {
    this.realTimeService.disconnect();
  }
}

// Create enhanced protocol instance
export const enhancedProtocol = new EnhancedProtocol();

// React hook for enhanced protocol with real-time data
export const useEnhancedProtocol = (useRealData: boolean = false) => {
  const [markets, setMarkets] = React.useState<Market[]>([]);
  const [positions, setPositions] = React.useState<Position[]>([]);
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    enhancedProtocol.setUseRealData(useRealData);
    
    const updateData = () => {
      setMarkets(enhancedProtocol.getMarkets());
      setPositions(enhancedProtocol.getPositions());
      setTrades(enhancedProtocol.getTrades(10));
    };

    updateData();

    // Update every 30 seconds when using real data
    const interval = useRealData 
      ? setInterval(updateData, 30000)
      : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [useRealData, refreshKey]);

  const refresh = () => setRefreshKey(prev => prev + 1);

  return {
    markets,
    positions,
    trades,
    refresh,
    getCurrentPrice: (symbol: string) => enhancedProtocol.getCurrentPrice(symbol),
    getPriceChange24h: (symbol: string) => enhancedProtocol.getPriceChange24h(symbol),
    getVolume24h: (symbol: string) => enhancedProtocol.getVolume24h(symbol),
    protocol: enhancedProtocol,
  };
};

// Import React for the hook
import React from 'react';
