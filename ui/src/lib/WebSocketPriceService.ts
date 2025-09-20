// WebSocket Price Feed Service
// Provides real-time price feeds from multiple exchanges with automatic failover
import { RealTimePrice } from './realTimeDataService';

// Connection states for monitoring
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting', 
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

// Exchange configuration
export interface ExchangeConfig {
  name: string;
  url: string;
  symbolMapping: Record<string, string>;
  messageParser: (data: any) => RealTimePrice | null;
  subscriptionMessage: (symbols: string[]) => string;
  priority: number; // Lower = higher priority
}

// Connection status with metadata
export interface ConnectionStatus {
  exchange: string;
  state: ConnectionState;
  lastUpdate: number;
  latency: number;
  reconnectAttempts: number;
  error?: string;
}

// Price update with source information
export interface PriceUpdate extends RealTimePrice {
  source: string;
  latency: number;
  confidence: number; // 0-100, based on source reliability
}

export class WebSocketPriceService {
  private connections: Map<string, WebSocket> = new Map();
  private connectionStatus: Map<string, ConnectionStatus> = new Map();
  private priceCallbacks: Map<string, ((price: PriceUpdate) => void)[]> = new Map();
  private statusCallbacks: ((status: ConnectionStatus[]) => void)[] = [];
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private priceCache: Map<string, PriceUpdate> = new Map();
  
  // Configuration for supported exchanges
  private exchanges: ExchangeConfig[] = [
    // Binance - High priority, most liquid
    {
      name: 'binance',
      url: 'wss://stream.binance.com:9443/ws',
      priority: 1,
      symbolMapping: {
        'BTC': 'BTCUSDT',
        'ETH': 'ETHUSDT', 
        'SOL': 'SOLUSDT',
        'ADA': 'ADAUSDT',
        'AVAX': 'AVAXUSDT',
        'MATIC': 'MATICUSDT',
        'DOT': 'DOTUSDT',
        'LINK': 'LINKUSDT',
        'UNI': 'UNIUSDT',
        'ATOM': 'ATOMUSDT',
        'NEAR': 'NEARUSDT',
        'FTM': 'FTMUSDT',
        'ALGO': 'ALGOUSDT',
        'XRP': 'XRPUSDT',
        'LTC': 'LTCUSDT',
        'BCH': 'BCHUSDT'
      },
      messageParser: this.parseBinanceMessage.bind(this),
      subscriptionMessage: this.createBinanceSubscription.bind(this)
    },
    
    // Coinbase Pro - Medium priority, good for major pairs
    {
      name: 'coinbase',
      url: 'wss://ws-feed.exchange.coinbase.com',
      priority: 2,
      symbolMapping: {
        'BTC': 'BTC-USD',
        'ETH': 'ETH-USD',
        'SOL': 'SOL-USD',
        'ADA': 'ADA-USD',
        'AVAX': 'AVAX-USD',
        'MATIC': 'MATIC-USD',
        'DOT': 'DOT-USD',
        'LINK': 'LINK-USD',
        'UNI': 'UNI-USD',
        'ATOM': 'ATOM-USD',
        'ALGO': 'ALGO-USD',
        'LTC': 'LTC-USD'
      },
      messageParser: this.parseCoinbaseMessage.bind(this),
      subscriptionMessage: this.createCoinbaseSubscription.bind(this)
    },
    
    // Kraken - Lower priority fallback
    {
      name: 'kraken',
      url: 'wss://ws.kraken.com',
      priority: 3,
      symbolMapping: {
        'BTC': 'XBT/USD',
        'ETH': 'ETH/USD',
        'SOL': 'SOL/USD',
        'ADA': 'ADA/USD',
        'AVAX': 'AVAX/USD',
        'DOT': 'DOT/USD',
        'LINK': 'LINK/USD',
        'UNI': 'UNI/USD',
        'ATOM': 'ATOM/USD',
        'ALGO': 'ALGO/USD',
        'LTC': 'LTC/USD'
      },
      messageParser: this.parseKrakenMessage.bind(this),
      subscriptionMessage: this.createKrakenSubscription.bind(this)
    }
  ];

  // Start WebSocket connections for given symbols
  public async subscribe(symbols: string[]): Promise<() => void> {
    console.log('WebSocket service subscribing to:', symbols);

    // Sort exchanges by priority
    const sortedExchanges = [...this.exchanges].sort((a, b) => a.priority - b.priority);

    // Connect to each exchange
    for (const exchange of sortedExchanges) {
      await this.connectToExchange(exchange, symbols);
    }

    // Return cleanup function
    return () => this.disconnect();
  }

  // Connect to a specific exchange
  private async connectToExchange(exchange: ExchangeConfig, symbols: string[]): Promise<void> {
    const exchangeName = exchange.name;
    
    try {
      this.updateConnectionStatus(exchangeName, ConnectionState.CONNECTING);
      
      // Create WebSocket connection
      const ws = new WebSocket(exchange.url);
      this.connections.set(exchangeName, ws);

      ws.onopen = () => {
        console.log(`Connected to ${exchangeName}`);
        this.updateConnectionStatus(exchangeName, ConnectionState.CONNECTED);
        
        // Subscribe to symbols
        const availableSymbols = symbols.filter(symbol => 
          exchange.symbolMapping[symbol] !== undefined
        );
        
        if (availableSymbols.length > 0) {
          const subscriptionMsg = exchange.subscriptionMessage(availableSymbols);
          ws.send(subscriptionMsg);
          console.log(`Subscribed to ${exchangeName}:`, availableSymbols);
        }
      };

      ws.onmessage = (event) => {
        const startTime = performance.now();
        
        try {
          const data = JSON.parse(event.data);
          const priceUpdate = exchange.messageParser(data);
          
          if (priceUpdate) {
            const latency = performance.now() - startTime;
            const enhancedUpdate: PriceUpdate = {
              ...priceUpdate,
              source: exchangeName,
              latency,
              confidence: this.calculateConfidence(exchangeName, latency)
            };

            this.handlePriceUpdate(enhancedUpdate);
            this.updateConnectionStatus(exchangeName, ConnectionState.CONNECTED, latency);
          }
        } catch (error) {
          console.error(`Error parsing ${exchangeName} message:`, error);
        }
      };

      ws.onerror = (error) => {
        console.error(`${exchangeName} WebSocket error:`, error);
        this.updateConnectionStatus(exchangeName, ConnectionState.ERROR, 0, 
          `WebSocket error: ${error}`);
      };

      ws.onclose = (event) => {
        console.log(`${exchangeName} WebSocket closed:`, event.code, event.reason);
        this.updateConnectionStatus(exchangeName, ConnectionState.DISCONNECTED);
        
        // Schedule reconnection if not intentional close
        if (event.code !== 1000) {
          this.scheduleReconnection(exchange, symbols);
        }
      };

    } catch (error) {
      console.error(`Failed to connect to ${exchangeName}:`, error);
      this.updateConnectionStatus(exchangeName, ConnectionState.ERROR, 0,
        `Connection failed: ${error}`);
      this.scheduleReconnection(exchange, symbols);
    }
  }

  // Handle incoming price updates with aggregation logic
  private handlePriceUpdate(update: PriceUpdate): void {
    const symbol = update.symbol;
    
    // Cache the update
    this.priceCache.set(`${symbol}_${update.source}`, update);
    
    // Get all callbacks for this symbol
    const callbacks = this.priceCallbacks.get(symbol) || [];
    
    // Apply aggregation logic to determine best price
    const bestPrice = this.aggregatePriceData(symbol);
    
    if (bestPrice) {
      callbacks.forEach(callback => callback(bestPrice));
    }
  }

  // Aggregate price data from multiple sources
  private aggregatePriceData(symbol: string): PriceUpdate | null {
    const sources: PriceUpdate[] = [];
    
    // Collect all recent updates for this symbol
    for (const [key, update] of this.priceCache.entries()) {
      if (key.startsWith(symbol + '_') && 
          Date.now() - update.timestamp < 30000) { // 30 second freshness
        sources.push(update);
      }
    }

    if (sources.length === 0) return null;

    // Sort by confidence (highest first)
    sources.sort((a, b) => b.confidence - a.confidence);

    // Use highest confidence source as primary
    const primary = sources[0];

    // If we have multiple sources, validate against others
    if (sources.length > 1) {
      const prices = sources.map(s => s.price);
      const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
      const deviation = Math.abs(primary.price - avgPrice) / avgPrice;

      // If primary deviates too much, use average
      if (deviation > 0.005) { // 0.5% threshold
        return {
          ...primary,
          price: avgPrice,
          source: 'aggregated',
          confidence: Math.min(95, primary.confidence + 10)
        };
      }
    }

    return primary;
  }

  // Calculate confidence score based on exchange and latency
  private calculateConfidence(exchange: string, latency: number): number {
    let baseScore = 70;

    // Exchange-specific scores
    switch (exchange) {
      case 'binance': baseScore = 95; break;
      case 'coinbase': baseScore = 90; break;  
      case 'kraken': baseScore = 80; break;
    }

    // Adjust for latency
    if (latency < 100) baseScore += 5;
    else if (latency > 1000) baseScore -= 10;
    else if (latency > 500) baseScore -= 5;

    return Math.max(10, Math.min(100, baseScore));
  }

  // Schedule reconnection with exponential backoff
  private scheduleReconnection(exchange: ExchangeConfig, symbols: string[]): void {
    const exchangeName = exchange.name;
    const status = this.connectionStatus.get(exchangeName);
    const attempts = status ? status.reconnectAttempts + 1 : 1;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
    
    console.log(`Scheduling ${exchangeName} reconnection in ${delay}ms (attempt ${attempts})`);
    
    const timer = setTimeout(async () => {
      this.updateConnectionStatus(exchangeName, ConnectionState.RECONNECTING, 0, '', attempts);
      await this.connectToExchange(exchange, symbols);
    }, delay);
    
    this.reconnectTimers.set(exchangeName, timer);
  }

  // Update connection status and notify listeners
  private updateConnectionStatus(
    exchange: string, 
    state: ConnectionState, 
    latency: number = 0, 
    error?: string,
    reconnectAttempts: number = 0
  ): void {
    const status: ConnectionStatus = {
      exchange,
      state,
      lastUpdate: Date.now(),
      latency,
      reconnectAttempts,
      error
    };

    this.connectionStatus.set(exchange, status);
    
    // Notify status callbacks
    const allStatuses = Array.from(this.connectionStatus.values());
    this.statusCallbacks.forEach(callback => callback(allStatuses));
  }

  // Subscribe to price updates for specific symbols
  public onPriceUpdate(symbol: string, callback: (price: PriceUpdate) => void): () => void {
    if (!this.priceCallbacks.has(symbol)) {
      this.priceCallbacks.set(symbol, []);
    }
    
    this.priceCallbacks.get(symbol)!.push(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.priceCallbacks.get(symbol);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    };
  }

  // Subscribe to connection status updates  
  public onStatusUpdate(callback: (statuses: ConnectionStatus[]) => void): () => void {
    this.statusCallbacks.push(callback);
    
    // Send current status immediately
    callback(Array.from(this.connectionStatus.values()));
    
    return () => {
      const index = this.statusCallbacks.indexOf(callback);
      if (index > -1) this.statusCallbacks.splice(index, 1);
    };
  }

  // Exchange-specific message parsers
  private parseBinanceMessage(data: any): PriceUpdate | null {
    if (data.e === '24hrTicker') {
      // Find original symbol from Binance symbol
      const binanceSymbol = data.s;
      const originalSymbol = this.findOriginalSymbol('binance', binanceSymbol);
      
      if (originalSymbol) {
        return {
          symbol: originalSymbol,
          price: parseFloat(data.c),
          timestamp: data.E,
          change24h: parseFloat(data.P),
          volume24h: parseFloat(data.v),
          source: 'binance',
          latency: 0,
          confidence: 95
        };
      }
    }
    return null;
  }

  private parseCoinbaseMessage(data: any): PriceUpdate | null {
    if (data.type === 'ticker') {
      const coinbaseSymbol = data.product_id;
      const originalSymbol = this.findOriginalSymbol('coinbase', coinbaseSymbol);
      
      if (originalSymbol) {
        return {
          symbol: originalSymbol,
          price: parseFloat(data.price),
          timestamp: new Date(data.time).getTime(),
          change24h: parseFloat(data.open_24h) ? 
            ((parseFloat(data.price) - parseFloat(data.open_24h)) / parseFloat(data.open_24h)) * 100 : 0,
          volume24h: parseFloat(data.volume_24h),
          source: 'coinbase',
          latency: 0,
          confidence: 90
        };
      }
    }
    return null;
  }

  private parseKrakenMessage(data: any): PriceUpdate | null {
    // Kraken has a different message format
    if (Array.isArray(data) && data.length > 3 && data[2] === 'ticker') {
      const krakenSymbol = data[3];
      const originalSymbol = this.findOriginalSymbol('kraken', krakenSymbol);
      
      if (originalSymbol && data[1]) {
        const ticker = data[1];
        return {
          symbol: originalSymbol,
          price: parseFloat(ticker.c?.[0]) || 0,
          timestamp: Date.now(),
          change24h: 0, // Kraken doesn't provide this easily
          volume24h: parseFloat(ticker.v?.[1]) || 0,
          source: 'kraken', 
          latency: 0,
          confidence: 80
        };
      }
    }
    return null;
  }

  // Find original symbol from exchange-specific symbol
  private findOriginalSymbol(exchangeName: string, exchangeSymbol: string): string | null {
    const exchange = this.exchanges.find(e => e.name === exchangeName);
    if (!exchange) return null;

    for (const [original, mapped] of Object.entries(exchange.symbolMapping)) {
      if (mapped === exchangeSymbol) {
        return original;
      }
    }
    return null;
  }

  // Create exchange-specific subscription messages
  private createBinanceSubscription(symbols: string[]): string {
    const streams = symbols
      .map(symbol => this.exchanges[0].symbolMapping[symbol])
      .filter(Boolean)
      .map(symbol => `${symbol.toLowerCase()}@ticker`);
    
    return JSON.stringify({
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now()
    });
  }

  private createCoinbaseSubscription(symbols: string[]): string {
    const products = symbols
      .map(symbol => this.exchanges[1].symbolMapping[symbol])
      .filter(Boolean);

    return JSON.stringify({
      type: 'subscribe',
      channels: ['ticker'],
      product_ids: products
    });
  }

  private createKrakenSubscription(symbols: string[]): string {
    const pairs = symbols
      .map(symbol => this.exchanges[2].symbolMapping[symbol])
      .filter(Boolean);

    return JSON.stringify({
      event: 'subscribe',
      pair: pairs,
      subscription: { name: 'ticker' }
    });
  }

  // Get current connection statuses
  public getConnectionStatuses(): ConnectionStatus[] {
    return Array.from(this.connectionStatus.values());
  }

  // Get cached prices
  public getCachedPrices(): Map<string, PriceUpdate> {
    return new Map(this.priceCache);
  }

  // Clean disconnect
  public disconnect(): void {
    console.log('Disconnecting WebSocket price service');
    
    // Close all connections
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Service shutdown');
      }
    });
    
    // Clear timers
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    
    // Clear data
    this.connections.clear();
    this.connectionStatus.clear();
    this.priceCallbacks.clear();
    this.statusCallbacks.length = 0;
    this.reconnectTimers.clear();
    this.priceCache.clear();
  }
}

export default WebSocketPriceService;
