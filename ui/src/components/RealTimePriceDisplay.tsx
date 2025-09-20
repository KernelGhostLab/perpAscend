// Real-Time Price Display Component with WebSocket Integration
import React from 'react';
import { useRealTimePrices } from '../lib/realTimeDataService';
import useEnhancedRealTimePrices from '../hooks/useEnhancedRealTimePrices';

interface RealTimePriceDisplayProps {
  symbols: string[];
  method?: 'websocket' | 'coingecko' | 'hybrid';
}

export const RealTimePriceDisplay: React.FC<RealTimePriceDisplayProps> = ({ 
  symbols, 
  method = 'hybrid'
}) => {
  
  // Use enhanced hook for WebSocket support, fallback to original for coingecko-only
  const enhancedData = useEnhancedRealTimePrices(symbols, { 
    method,
    fallbackEnabled: true,
    updateInterval: 30000
  });
  
  const legacyData = useRealTimePrices(symbols, method === 'coingecko' ? 'coingecko' : 'coingecko');
  
  // Choose which data source to use
  const isUsingEnhanced = method === 'websocket' || method === 'hybrid';
  const { 
    prices, 
    isLoading, 
    error,
    isWebSocketActive = false
  } = isUsingEnhanced ? enhancedData : { 
    ...legacyData, 
    isWebSocketActive: false
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="text-lg font-semibold mb-4">Live Prices</h3>
        <div className="animate-pulse">
          {symbols.map((_, index) => (
            <div key={index} className="flex justify-between items-center py-2">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-4 bg-gray-200 rounded w-24"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="text-lg font-semibold mb-4 text-red-600">Price Feed Error</h3>
        <p className="text-sm text-red-500">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Live Prices</h3>
        <div className="flex items-center space-x-2">
          {/* Simple Status Indicator */}
          {isUsingEnhanced && (
            <div className="flex items-center text-xs text-gray-500">
              <div className={`w-2 h-2 rounded-full mr-1 ${
                isWebSocketActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
              }`}></div>
              {isWebSocketActive ? 'Live' : 'Updating'}
            </div>
          )}
        </div>
      </div>

      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {symbols.map((symbol) => {
          // Look for price data under both the original symbol and symbol/USD format
          const priceData = prices[symbol] || prices[`${symbol}/USD`];
          
          if (!priceData) {
            return (
              <div key={symbol} className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{symbol}</span>
                  <div className="text-sm text-gray-400">Loading...</div>
                </div>
              </div>
            );
          }

          const isPositive = priceData.change24h >= 0;
          
          return (
            <div key={symbol} className="bg-gray-50 rounded-lg p-4 border hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-gray-900 text-lg">{symbol}</span>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {isPositive ? '+' : ''}{priceData.change24h.toFixed(2)}%
                </div>
              </div>
              
              <div className="mb-2">
                <div className="text-2xl font-bold text-gray-900">
                  ${priceData.price.toLocaleString(undefined, { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: priceData.price >= 100 ? 2 : 4
                  })}
                </div>
              </div>
              
              <div className="flex justify-between items-center text-xs text-gray-500">
                {priceData.volume24h > 0 && (
                  <span>Vol: ${(priceData.volume24h / 1000000).toFixed(0)}M</span>
                )}
                <span>{new Date(priceData.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Enhanced Stats Grid with Real-Time Data
interface RealTimeStatsGridProps {
  useRealData?: boolean;
}

export const RealTimeStatsGrid: React.FC<RealTimeStatsGridProps> = ({ useRealData = false }) => {
  const { prices } = useRealTimePrices(['SOL/USD', 'BTC/USD', 'ETH/USD'], 'coingecko');

  const calculatePortfolioValue = () => {
    if (!useRealData || Object.keys(prices).length === 0) {
      return {
        totalValue: 125000,
        totalPnL: 12450,
        totalChange: 5.2
      };
    }

    // Real calculation would use actual positions
    const solPrice = prices['SOL/USD']?.price || 50;
    const btcPrice = prices['BTC/USD']?.price || 45000;
    
    return {
      totalValue: solPrice * 1000 + btcPrice * 0.5, // Mock portfolio
      totalPnL: (solPrice - 45) * 1000, // Mock P&L
      totalChange: prices['SOL/USD']?.change24h || 0
    };
  };

  const portfolio = calculatePortfolioValue();

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Portfolio Value</p>
            <p className="text-xl font-bold text-gray-900">
              ${portfolio.totalValue.toLocaleString()}
            </p>
          </div>
          {useRealData && (
            <div className="text-xs text-green-500 flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
              Live
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">24h P&L</p>
            <p className={`text-xl font-bold ${
              portfolio.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              ${portfolio.totalPnL > 0 ? '+' : ''}
              {portfolio.totalPnL.toLocaleString()}
            </p>
          </div>
          <div className={`text-sm font-medium ${
            portfolio.totalChange >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {portfolio.totalChange > 0 ? '+' : ''}{portfolio.totalChange.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-600">Active Positions</p>
            <p className="text-xl font-bold text-gray-900">7</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-600">Stop Loss Orders</p>
            <p className="text-xl font-bold text-gray-900">3</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimePriceDisplay;
