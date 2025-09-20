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
      <div className="space-y-4">
        {symbols.map((_, index) => (
          <div key={index} className="trading-card shimmer">
            <div className="flex justify-between items-center">
              <div className="h-4 bg-trading-bg-hover rounded w-20"></div>
              <div className="h-6 bg-trading-bg-hover rounded w-24"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="trading-card border-loss-500/20 bg-loss-900/5">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-loss-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-loss-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-loss-500">Price Feed Error</h3>
        </div>
        <p className="text-sm text-trading-text-secondary mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="btn-danger text-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Status - Only show if we have status info */}
      {isUsingEnhanced && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={isWebSocketActive ? 'status-connected' : 'status-warning'}></div>
            <span className="text-sm text-trading-text-secondary">
              {isWebSocketActive ? 'Live Data Stream' : 'Fallback Mode'}
            </span>
          </div>
        </div>
      )}

      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {symbols.map((symbol) => {
          // Look for price data under both the original symbol and symbol/USD format
          const priceData = prices[symbol] || prices[`${symbol}/USD`];
          
          if (!priceData) {
            return (
              <div key={symbol} className="price-card shimmer">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-trading-text-primary">{symbol}</span>
                  <div className="text-sm text-trading-text-tertiary">Loading...</div>
                </div>
              </div>
            );
          }

          const isPositive = priceData.change24h >= 0;
          
          return (
            <div key={symbol} className="price-card group relative overflow-hidden">
              {/* Gradient border effect for active cards */}
              <div className="absolute inset-0 bg-gradient-to-r from-trading-accent-primary/10 to-brand-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"></div>
              
              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-trading-text-primary text-lg">{symbol}</span>
                    <div className="w-6 h-6 rounded-full bg-trading-bg-secondary flex items-center justify-center">
                      <span className="text-xs font-mono text-trading-text-secondary">{symbol[0]}</span>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    isPositive ? 'price-positive' : 'price-negative'
                  }`}>
                    {isPositive ? '+' : ''}{priceData.change24h.toFixed(2)}%
                  </div>
                </div>
                
                {/* Price */}
                <div className="mb-4">
                  <div className="text-2xl font-bold text-trading-text-primary font-mono">
                    ${priceData.price.toLocaleString(undefined, { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: priceData.price >= 100 ? 2 : 4
                    })}
                  </div>
                </div>
                
                {/* Footer */}
                <div className="flex justify-between items-center text-xs">
                  {priceData.volume24h > 0 && (
                    <div className="text-trading-text-tertiary">
                      <span className="text-trading-text-secondary">Vol: </span>
                      ${(priceData.volume24h / 1000000).toFixed(0)}M
                    </div>
                  )}
                  <div className="text-trading-text-tertiary font-mono">
                    {new Date(priceData.timestamp).toLocaleTimeString()}
                  </div>
                </div>
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
