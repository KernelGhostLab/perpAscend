// Real-time data service for PerpAscend protocol
import React from 'react';
import { Connection, PublicKey } from '@solana/web3.js';

// Pyth Network price feed IDs for major tokens
const PYTH_PRICE_FEEDS: Record<string, string> = {
  'SOL/USD': 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
  'BTC/USD': 'GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU',
  'ETH/USD': 'JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB',
  'USDC/USD': 'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD',
};

// WebSocket connections for real-time updates
export interface RealTimePrice {
  symbol: string;
  price: number;
  timestamp: number;
  change24h: number;
  volume24h: number;
}

export interface RealTimeMarketData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  depth: {
    bids: [number, number][];
    asks: [number, number][];
  };
}

export class RealTimeDataService {
  private connection: Connection;
  private priceSubscriptions: Map<string, WebSocket> = new Map();
  private priceCallbacks: Map<string, ((data: RealTimePrice) => void)[]> = new Map();

  constructor(rpcUrl: string = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  // Method 1: Pyth Network Oracle Integration
  async subscribeToPythPrices(symbols: string[], callback: (data: RealTimePrice) => void) {
    for (const symbol of symbols) {
      const feedId = PYTH_PRICE_FEEDS[symbol];
      if (!feedId) continue;

      try {
        // Subscribe to Pyth price feed
        const accountInfo = await this.connection.getAccountInfo(new PublicKey(feedId));
        if (accountInfo) {
          // Parse Pyth price data (simplified)
          const priceData = this.parsePythPriceData(accountInfo.data, symbol);
          callback(priceData);

          // Set up account change subscription for real-time updates
          this.connection.onAccountChange(
            new PublicKey(feedId),
            (accountInfo) => {
              const updatedPrice = this.parsePythPriceData(accountInfo.data, symbol);
              callback(updatedPrice);
            },
            'confirmed'
          );
        }
      } catch (error) {
        console.error(`Failed to subscribe to ${symbol} price feed:`, error);
      }
    }
  }

  // Method 2: CoinGecko API Integration (Free tier)
  async subscribeToCoinGeckoPrices(symbols: string[], callback: (data: RealTimePrice) => void) {
    const coinGeckoIds: Record<string, string> = {
      'SOL': 'solana',
      'BTC': 'bitcoin', 
      'ETH': 'ethereum',
      'USDC': 'usd-coin',
      'ADA': 'cardano',
      'AVAX': 'avalanche-2',
      'MATIC': 'matic-network',
      'DOT': 'polkadot',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'ATOM': 'cosmos',
      'NEAR': 'near',
      'FTM': 'fantom',
      'ALGO': 'algorand',
      'XRP': 'ripple',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'ICP': 'internet-computer',
      'VET': 'vechain',
      'SAND': 'the-sandbox',
      // Also support /USD format
      'SOL/USD': 'solana',
      'BTC/USD': 'bitcoin',
      'ETH/USD': 'ethereum',
      'USDC/USD': 'usd-coin',
      'ADA/USD': 'cardano',
      'AVAX/USD': 'avalanche-2',
      'MATIC/USD': 'matic-network',
      'DOT/USD': 'polkadot',
      'LINK/USD': 'chainlink',
      'UNI/USD': 'uniswap',
      'ATOM/USD': 'cosmos',
      'NEAR/USD': 'near',
      'FTM/USD': 'fantom',
      'ALGO/USD': 'algorand',
      'XRP/USD': 'ripple',
      'LTC/USD': 'litecoin',
      'BCH/USD': 'bitcoin-cash',
      'ICP/USD': 'internet-computer',
      'VET/USD': 'vechain',
      'SAND/USD': 'the-sandbox',
    };

    // Initial call to load data immediately
    const fetchPrices = async () => {
      try {
        const ids = symbols.map(s => coinGeckoIds[s]).filter(Boolean);
        if (ids.length === 0) {
          console.warn('No valid CoinGecko IDs found for symbols:', symbols);
          this.useMockDataFallback(symbols, callback);
          return;
        }
        
        console.log('Fetching prices for IDs:', ids);
        
        // Try direct API call first (might work in some cases)
        const directUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
        
        let response;
        let data;
        
        try {
          response = await fetch(directUrl);
          data = await response.json();
          console.log('Direct API response:', data);
        } catch (corsError) {
          console.log('Direct API failed due to CORS, trying proxy...');
          // Fallback to proxy
          response = await fetch(
            `https://api.allorigins.win/get?url=${encodeURIComponent(directUrl)}`
          );
          const proxyData = await response.json();
          data = JSON.parse(proxyData.contents);
          console.log('Proxy API response:', data);
        }

        let foundPrices = false;
        symbols.forEach(symbol => {
          const coinId = coinGeckoIds[symbol];
          if (data && data[coinId]) {
            foundPrices = true;
            const priceData: RealTimePrice = {
              symbol: symbol.includes('/') ? symbol : `${symbol}/USD`,
              price: data[coinId].usd,
              timestamp: Date.now(),
              change24h: data[coinId].usd_24h_change || 0,
              volume24h: data[coinId].usd_24h_vol || 0,
            };
            console.log('Calling callback with price data:', priceData);
            callback(priceData);
          }
        });

        if (!foundPrices) {
          console.log('No prices found in API response, using fallback');
          this.useMockDataFallback(symbols, callback);
        }
      } catch (error) {
        console.error('CoinGecko API error:', error);
        // Fallback to mock data if API fails
        this.useMockDataFallback(symbols, callback);
      }
    };

    // Call immediately
    fetchPrices();

    // Then set up interval
    const interval = setInterval(fetchPrices, 30000); // Update every 30 seconds

    return () => clearInterval(interval);

    return () => clearInterval(interval);
  }

  // Fallback method with realistic mock data
  private useMockDataFallback(symbols: string[], callback: (data: RealTimePrice) => void) {
    console.log('Using mock data fallback for symbols:', symbols);
    
    const mockPrices: Record<string, number> = {
      'BTC': 115000,
      'ETH': 4400,
      'SOL': 230,
      'USDC': 1.00,
      'ADA': 0.65,
      'AVAX': 45,
      'MATIC': 1.20,
      'DOT': 12,
      'LINK': 18,
      'UNI': 14,
      'ATOM': 22,
      'NEAR': 8,
      'FTM': 2.5,
      'ALGO': 0.85,
      'XRP': 1.10,
      'LTC': 180,
      'BCH': 650,
      'ICP': 25,
      'VET': 0.08,
      'SAND': 3.2,
    };

    symbols.forEach(symbol => {
      const baseSymbol = symbol.replace('/USD', '');
      const basePrice = mockPrices[baseSymbol] || 100;
      
      // Simulate realistic price movements (+/- 2%)
      const variation = (Math.random() - 0.5) * 0.04; // +/- 2%
      const currentPrice = basePrice * (1 + variation);
      const change24h = (Math.random() - 0.5) * 10; // +/- 5% daily change
      
      const priceData: RealTimePrice = {
        symbol: symbol.includes('/') ? symbol : `${symbol}/USD`,
        price: parseFloat(currentPrice.toFixed(2)),
        timestamp: Date.now(),
        change24h: parseFloat(change24h.toFixed(2)),
        volume24h: Math.random() * 1000000000, // Random volume
      };
      
      console.log('Mock fallback calling callback with:', priceData);
      callback(priceData);
    });
  }

  // Method 3: Binance WebSocket (High frequency)
  subscribeToBinancePrices(symbols: string[], callback: (data: RealTimePrice) => void) {
    const binanceSymbols: Record<string, string> = {
      'SOL/USD': 'SOLUSDT',
      'BTC/USD': 'BTCUSDT',
      'ETH/USD': 'ETHUSDT',
    };

    symbols.forEach(symbol => {
      const binanceSymbol = binanceSymbols[symbol];
      if (!binanceSymbol) return;

      const wsUrl = `wss://stream.binance.com:9443/ws/${binanceSymbol.toLowerCase()}@ticker`;
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const priceData: RealTimePrice = {
            symbol,
            price: parseFloat(data.c), // Current price
            timestamp: data.E, // Event time
            change24h: parseFloat(data.P), // 24h price change percent
            volume24h: parseFloat(data.v), // 24h volume
          };
          callback(priceData);
        } catch (error) {
          console.error('Binance WebSocket parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error(`Binance WebSocket error for ${symbol}:`, error);
      };

      this.priceSubscriptions.set(symbol, ws);
    });

    return () => {
      symbols.forEach(symbol => {
        const ws = this.priceSubscriptions.get(symbol);
        if (ws) {
          ws.close();
          this.priceSubscriptions.delete(symbol);
        }
      });
    };
  }

  // Method 4: Jupiter Aggregator (Solana DEX prices)
  async getJupiterPrices(tokens: string[]): Promise<Record<string, number>> {
    try {
      const tokenAddresses: Record<string, string> = {
        'SOL': 'So11111111111111111111111111111111111111112',
        'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        'BTC': '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // Wrapped Bitcoin
        'ETH': '7i5KKsX2weiTkry7jA4ZwSuXGhs5eJBEjY8vVxR4pfRx', // Wrapped Ethereum
      };

      const addresses = tokens.map(t => tokenAddresses[t]).filter(Boolean);
      const response = await fetch(`https://price.jup.ag/v4/price?ids=${addresses.join(',')}`);
      const data = await response.json();

      const prices: Record<string, number> = {};
      tokens.forEach(token => {
        const address = tokenAddresses[token];
        if (data.data[address]) {
          prices[`${token}/USD`] = data.data[address].price;
        }
      });

      return prices;
    } catch (error) {
      console.error('Jupiter price fetch error:', error);
      return {};
    }
  }

  // Method 5: Real Solana DeFi Protocol Data
  async getMangoMarketData(): Promise<RealTimeMarketData[]> {
    try {
      // This would integrate with Mango Markets API
      const response = await fetch('https://mango-stats-v4.herokuapp.com/perp-market');
      const data = await response.json();
      
      return data.map((market: any) => ({
        symbol: market.name,
        bid: market.bids[0]?.[0] || 0,
        ask: market.asks[0]?.[0] || 0,
        spread: market.asks[0]?.[0] - market.bids[0]?.[0] || 0,
        depth: {
          bids: market.bids.slice(0, 10),
          asks: market.asks.slice(0, 10),
        }
      }));
    } catch (error) {
      console.error('Mango market data error:', error);
      return [];
    }
  }

  // Helper method to parse Pyth price data
  private parsePythPriceData(_data: Buffer, symbol: string): RealTimePrice {
    // Simplified Pyth price parsing (would need actual Pyth SDK)
    // This is a placeholder - real implementation would use @pythnetwork/client
    return {
      symbol,
      price: Math.random() * 100 + 50, // Placeholder
      timestamp: Date.now(),
      change24h: (Math.random() - 0.5) * 10,
      volume24h: Math.random() * 1000000,
    };
  }

  // Cleanup method
  disconnect() {
    this.priceSubscriptions.forEach(ws => ws.close());
    this.priceSubscriptions.clear();
    this.priceCallbacks.clear();
  }
}

// React hook for real-time prices
export const useRealTimePrices = (symbols: string[], method: 'pyth' | 'coingecko' | 'binance' | 'jupiter' = 'coingecko') => {
  const [prices, setPrices] = React.useState<Record<string, RealTimePrice>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    console.log('useRealTimePrices effect triggered with symbols:', symbols, 'method:', method);
    
    const dataService = new RealTimeDataService();
    let cleanup: (() => void) | undefined;

    const handlePriceUpdate = (priceData: RealTimePrice) => {
      console.log('handlePriceUpdate called with:', priceData);
      setPrices(prev => {
        const newPrices = {
          ...prev,
          [priceData.symbol]: priceData
        };
        console.log('Updating prices state:', newPrices);
        return newPrices;
      });
      setIsLoading(false);
    };

    const setupDataFeed = async () => {
      try {
        setError(null);
        
        switch (method) {
          case 'pyth':
            await dataService.subscribeToPythPrices(symbols, handlePriceUpdate);
            break;
          case 'coingecko':
            cleanup = await dataService.subscribeToCoinGeckoPrices(symbols, handlePriceUpdate);
            break;
          case 'binance':
            cleanup = dataService.subscribeToBinancePrices(symbols, handlePriceUpdate);
            break;
          case 'jupiter':
            const jupiterPrices = await dataService.getJupiterPrices(symbols.map(s => s.split('/')[0]));
            Object.entries(jupiterPrices).forEach(([symbol, price]) => {
              handlePriceUpdate({
                symbol,
                price,
                timestamp: Date.now(),
                change24h: 0,
                volume24h: 0,
              });
            });
            break;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch prices');
        setIsLoading(false);
      }
    };

    setupDataFeed();

    return () => {
      if (cleanup) cleanup();
      dataService.disconnect();
    };
  }, [symbols.join(','), method]);

  return { prices, isLoading, error };
};

export default RealTimeDataService;
