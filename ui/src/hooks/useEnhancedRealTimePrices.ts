// Enhanced Real-Time Prices Hook with WebSocket Integration
import { useState, useEffect, useCallback, useRef } from 'react';
import WebSocketPriceService, { 
  ConnectionState, 
  ConnectionStatus, 
  PriceUpdate 
} from '../lib/WebSocketPriceService';
import { RealTimePrice } from '../lib/realTimeDataService';

// Hook configuration options
export interface UseRealTimePricesConfig {
  method?: 'websocket' | 'coingecko' | 'hybrid';
  fallbackEnabled?: boolean;
  updateInterval?: number; // For fallback polling
  maxStaleness?: number; // Max age of price data in ms
}

// Enhanced hook return type with WebSocket status
export interface UseRealTimePricesResult {
  prices: Record<string, RealTimePrice>;
  isLoading: boolean;
  error: string | null;
  connectionStatuses: ConnectionStatus[];
  isWebSocketActive: boolean;
  lastUpdateTime: number;
  priceUpdateCount: number;
  averageLatency: number;
}

// Global WebSocket service instance (singleton)
let globalWebSocketService: WebSocketPriceService | null = null;

export const useRealTimePrices = (
  symbols: string[],
  config: UseRealTimePricesConfig = {}
): UseRealTimePricesResult => {
  const {
    method = 'hybrid',
    fallbackEnabled = true,
    updateInterval = 30000,
    maxStaleness = 60000
  } = config;

  // State management
  const [prices, setPrices] = useState<Record<string, RealTimePrice>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatuses, setConnectionStatuses] = useState<ConnectionStatus[]>([]);
  const [isWebSocketActive, setIsWebSocketActive] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  const [priceUpdateCount, setPriceUpdateCount] = useState(0);
  const [averageLatency, setAverageLatency] = useState(0);

  // Refs for cleanup and tracking
  const fallbackInterval = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeFunctions = useRef<(() => void)[]>([]);
  const latencyBuffer = useRef<number[]>([]);

  // Initialize WebSocket service (singleton pattern)
  const initializeWebSocketService = useCallback(() => {
    if (!globalWebSocketService) {
      globalWebSocketService = new WebSocketPriceService();
    }
    return globalWebSocketService;
  }, []);

  // Handle WebSocket price updates
  const handlePriceUpdate = useCallback((priceUpdate: PriceUpdate) => {
    console.log('Received WebSocket price update:', priceUpdate);

    // Update latency tracking
    latencyBuffer.current.push(priceUpdate.latency);
    if (latencyBuffer.current.length > 10) {
      latencyBuffer.current = latencyBuffer.current.slice(-10);
    }
    const avgLatency = latencyBuffer.current.reduce((a, b) => a + b, 0) / latencyBuffer.current.length;
    setAverageLatency(avgLatency);

    // Convert PriceUpdate to RealTimePrice format for backward compatibility
    const standardPrice: RealTimePrice = {
      symbol: priceUpdate.symbol,
      price: priceUpdate.price,
      timestamp: priceUpdate.timestamp,
      change24h: priceUpdate.change24h,
      volume24h: priceUpdate.volume24h
    };

    setPrices(prev => ({
      ...prev,
      [priceUpdate.symbol]: standardPrice
    }));

    setLastUpdateTime(Date.now());
    setPriceUpdateCount(prev => prev + 1);
    setIsLoading(false);
    setError(null);
  }, []);

  // Handle connection status updates
  const handleStatusUpdate = useCallback((statuses: ConnectionStatus[]) => {
    console.log('Connection status update:', statuses);
    setConnectionStatuses(statuses);
    
    // Check if any connection is active
    const hasActiveConnection = statuses.some(s => s.state === ConnectionState.CONNECTED);
    setIsWebSocketActive(hasActiveConnection);
  }, []);

  // Fallback to CoinGecko API
  const fetchFallbackPrices = useCallback(async () => {
    if (!fallbackEnabled) return;

    try {
      console.log('Fetching fallback prices from CoinGecko');
      
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
        'BCH': 'bitcoin-cash'
      };

      const ids = symbols.map(s => coinGeckoIds[s]).filter(Boolean);
      if (ids.length === 0) return;

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
      );
      
      const data = await response.json();

      symbols.forEach(symbol => {
        const coinId = coinGeckoIds[symbol];
        if (data && data[coinId]) {
          const fallbackPrice: RealTimePrice = {
            symbol,
            price: data[coinId].usd,
            timestamp: Date.now(),
            change24h: data[coinId].usd_24h_change || 0,
            volume24h: data[coinId].usd_24h_vol || 0
          };

          setPrices(prev => {
            // Only update if we don't have fresh WebSocket data
            const existing = prev[symbol];
            if (!existing || Date.now() - existing.timestamp > maxStaleness) {
              return { ...prev, [symbol]: fallbackPrice };
            }
            return prev;
          });
        }
      });

      setIsLoading(false);
    } catch (error) {
      console.error('Fallback price fetch error:', error);
      setError('Both WebSocket and fallback price feeds failed');
    }
  }, [symbols, fallbackEnabled, maxStaleness]);

  // Start WebSocket connections
  const startWebSocketConnections = useCallback(async () => {
    try {
      setError(null);
      const wsService = initializeWebSocketService();

      // Subscribe to price updates for each symbol
      const unsubscribes: (() => void)[] = [];
      
      symbols.forEach(symbol => {
        const unsubscribe = wsService.onPriceUpdate(symbol, handlePriceUpdate);
        unsubscribes.push(unsubscribe);
      });

      // Subscribe to status updates
      const statusUnsubscribe = wsService.onStatusUpdate(handleStatusUpdate);
      unsubscribes.push(statusUnsubscribe);

      // Start WebSocket connections
      const wsCleanup = await wsService.subscribe(symbols);
      unsubscribes.push(wsCleanup);

      unsubscribeFunctions.current = unsubscribes;

      // Set up fallback timer
      if (fallbackEnabled && method !== 'websocket') {
        fallbackInterval.current = setInterval(fetchFallbackPrices, updateInterval);
        // Initial fallback call
        setTimeout(fetchFallbackPrices, 2000); // Give WebSocket 2s to connect
      }

    } catch (error) {
      console.error('WebSocket startup error:', error);
      setError(`WebSocket initialization failed: ${error}`);
      
      if (fallbackEnabled) {
        await fetchFallbackPrices();
      }
    }
  }, [symbols, method, fallbackEnabled, initializeWebSocketService, handlePriceUpdate, handleStatusUpdate, fetchFallbackPrices, updateInterval]);

  // Main effect - setup and cleanup
  useEffect(() => {
    console.log('useRealTimePrices effect running:', { symbols, method });

    // Choose strategy based on method
    if (method === 'websocket' || method === 'hybrid') {
      startWebSocketConnections();
    } else if (method === 'coingecko') {
      // Pure polling mode
      fetchFallbackPrices();
      fallbackInterval.current = setInterval(fetchFallbackPrices, updateInterval);
    }

    // Cleanup function
    return () => {
      console.log('useRealTimePrices cleanup running');
      
      // Clear intervals
      if (fallbackInterval.current) {
        clearInterval(fallbackInterval.current);
        fallbackInterval.current = null;
      }

      // Unsubscribe from WebSocket updates
      unsubscribeFunctions.current.forEach(unsub => unsub());
      unsubscribeFunctions.current = [];

      // Note: We don't disconnect the global WebSocket service here
      // as it might be used by other components
    };
  }, [symbols.join(','), method, startWebSocketConnections, fetchFallbackPrices, updateInterval]);

  // Cleanup global service on unmount of last component
  useEffect(() => {
    return () => {
      // This runs when the component using the hook unmounts
      // We'll implement reference counting if needed
    };
  }, []);

  // Calculate data freshness
  const dataFreshness = Math.min(
    ...Object.values(prices).map(p => Date.now() - p.timestamp)
  );

  // Determine if data is stale
  const isStale = dataFreshness > maxStaleness;

  return {
    prices,
    isLoading: isLoading || (Object.keys(prices).length === 0 && priceUpdateCount === 0),
    error: isStale ? 'Price data is stale' : error,
    connectionStatuses,
    isWebSocketActive,
    lastUpdateTime,
    priceUpdateCount,
    averageLatency
  };
};

// Utility hook for connection health monitoring
export const useWebSocketHealth = () => {
  const [health, setHealth] = useState({
    overallStatus: 'disconnected' as 'connected' | 'partial' | 'disconnected' | 'error',
    activeConnections: 0,
    totalConnections: 0,
    averageLatency: 0,
    lastUpdate: 0
  });

  useEffect(() => {
    if (!globalWebSocketService) return;

    const updateHealth = (statuses: ConnectionStatus[]) => {
      const connected = statuses.filter(s => s.state === ConnectionState.CONNECTED);
      const avgLatency = connected.length > 0 
        ? connected.reduce((sum, s) => sum + s.latency, 0) / connected.length 
        : 0;

      let overallStatus: 'connected' | 'partial' | 'disconnected' | 'error';
      if (connected.length === statuses.length && statuses.length > 0) {
        overallStatus = 'connected';
      } else if (connected.length > 0) {
        overallStatus = 'partial';
      } else if (statuses.some(s => s.state === ConnectionState.ERROR)) {
        overallStatus = 'error';
      } else {
        overallStatus = 'disconnected';
      }

      setHealth({
        overallStatus,
        activeConnections: connected.length,
        totalConnections: statuses.length,
        averageLatency: avgLatency,
        lastUpdate: Date.now()
      });
    };

    const unsubscribe = globalWebSocketService.onStatusUpdate(updateHealth);
    return unsubscribe;
  }, []);

  return health;
};

// Clean up global service (call this when app is shutting down)
export const cleanupGlobalWebSocketService = () => {
  if (globalWebSocketService) {
    globalWebSocketService.disconnect();
    globalWebSocketService = null;
  }
};

export default useRealTimePrices;
