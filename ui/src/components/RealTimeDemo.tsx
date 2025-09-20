// Demo App component showing how to integrate real-time data
import React, { useState } from 'react';
import { RealTimePriceDisplay, RealTimeStatsGrid } from '../components/RealTimePriceDisplay';

export const RealTimeDemo: React.FC = () => {
  const [useRealTimeData, setUseRealTimeData] = useState(false);
  const [selectedDataSource, setSelectedDataSource] = useState<'coingecko' | 'binance' | 'jupiter'>('coingecko');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            PerpAscend - Real-Time Data Integration Demo
          </h1>
          
          {/* Real-Time Data Controls */}
          <div className="bg-white rounded-lg p-4 shadow mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={useRealTimeData}
                    onChange={(e) => setUseRealTimeData(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium">Enable Real-Time Data</span>
                </label>
                
                {useRealTimeData && (
                  <select
                    value={selectedDataSource}
                    onChange={(e) => setSelectedDataSource(e.target.value as any)}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="coingecko">CoinGecko (Free)</option>
                    <option value="binance">Binance WebSocket</option>
                    <option value="jupiter">Jupiter (Solana DEX)</option>
                  </select>
                )}
              </div>
              
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                useRealTimeData 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {useRealTimeData ? `Live Data (${selectedDataSource})` : 'Mock Data'}
              </div>
            </div>
          </div>
        </div>

        {/* Real-Time Stats Grid */}
        <RealTimeStatsGrid useRealData={useRealTimeData} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Real-Time Price Display */}
          <div className="lg:col-span-1">
            <RealTimePriceDisplay 
              symbols={['SOL/USD', 'BTC/USD', 'ETH/USD', 'USDC/USD']}
              method={selectedDataSource}
            />
          </div>

          {/* Data Source Comparison */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg p-6 shadow">
              <h3 className="text-lg font-semibold mb-4">Real-Time Data Sources</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-green-600 mb-2">🔄 CoinGecko API</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Free tier available</li>
                    <li>• 10-30 second updates</li>
                    <li>• Reliable and stable</li>
                    <li>• Good for development</li>
                  </ul>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-blue-600 mb-2">⚡ Binance WebSocket</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Real-time updates</li>
                    <li>• High frequency data</li>
                    <li>• Professional trading</li>
                    <li>• Best for active trading</li>
                  </ul>
                </div>
                
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-purple-600 mb-2">🔗 Jupiter/Pyth</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Solana-native prices</li>
                    <li>• On-chain oracle data</li>
                    <li>• DeFi protocol prices</li>
                    <li>• Perfect for Solana perps</li>
                  </ul>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">💡 Implementation Benefits</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Accurate P&L:</strong> Real-time position values</li>
                  <li>• <strong>Better Risk Management:</strong> Live liquidation prices</li>
                  <li>• <strong>Professional Feel:</strong> Industry-standard data feeds</li>
                  <li>• <strong>Market Awareness:</strong> 24h changes, volume, trends</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Integration Examples */}
        <div className="bg-white rounded-lg p-6 shadow mb-8">
          <h3 className="text-lg font-semibold mb-4">Integration Examples</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">🎯 Position Management</h4>
              <p className="text-sm text-gray-600 mb-3">
                Your AdvancedPositionManager can now use real prices for accurate P&L calculations
                and dynamic liquidation price updates.
              </p>
              <div className="bg-gray-50 rounded p-3 text-xs font-mono">
                {`// Real-time P&L calculation
const currentPrice = getCurrentPrice('SOL/USD');
const pnl = (currentPrice - entryPrice) * size;
const healthRatio = equity / margin;`}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">🛡️ Stop-Loss Orders</h4>
              <p className="text-sm text-gray-600 mb-3">
                Stop-loss orders can monitor real prices and execute automatically when 
                trigger conditions are met.
              </p>
              <div className="bg-gray-50 rounded p-3 text-xs font-mono">
                {`// Real-time trigger monitoring  
if (currentPrice <= triggerPrice) {
  await executeStopLoss(orderId);
  notifyUser('Stop-loss triggered!');
}`}
              </div>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">🚀 Ready to Implement?</h3>
          <p className="text-blue-100 mb-4">
            The infrastructure is built! Here's how to integrate real-time data into your existing components:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/10 rounded p-4">
              <h4 className="font-medium mb-2">1. Replace Mock Data</h4>
              <p className="text-sm text-blue-100">
                Update your App.tsx to use enhancedProtocol.ts instead of mockProtocol.ts
              </p>
            </div>
            
            <div className="bg-white/10 rounded p-4">
              <h4 className="font-medium mb-2">2. Add Price Feeds</h4>
              <p className="text-sm text-blue-100">
                Choose your data source: CoinGecko (free), Binance (fast), or Pyth (Solana-native)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeDemo;
