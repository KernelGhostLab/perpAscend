import React, { useState, useEffect } from 'react';
import { mockProtocol, Market, Position, Trade } from './lib/mockProtocol';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealSolanaProtocol } from './lib/realSolanaProtocol';
import { ProtocolSwitcher } from './components/ProtocolSwitcher';
import { AdvancedPositionManager } from './components/AdvancedPositionManager';
import { StopLossManager } from './components/StopLossManager';

// Header Component
const Header = () => {
  const { connected, publicKey } = useWallet();
  
  return (
    <header className="bg-gradient-to-r from-blue-900 to-purple-900 shadow-lg">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img 
              src="/logo.svg" 
              alt="PerpAscent Protocol" 
              className="w-8 h-8" 
            />
            <h1 className="text-2xl font-bold text-white">PerpAscent Protocol</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-blue-200">
              Solana Perpetual Futures Trading Interface
            </div>
            {connected && publicKey && (
              <div className="text-xs text-green-300">
                Connected: {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
              </div>
            )}
            <WalletMultiButton />
          </div>
        </div>
      </div>
    </header>
  );
};

// Statistics Grid Component
const StatsGrid = () => {
  const stats = {
    totalVolume: 1250000,
    totalPositions: 47,
    totalPnL: 12450,
    markets: 8
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Volume</p>
            <p className="text-xl font-bold text-gray-900">${stats.totalVolume.toLocaleString()}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-600">Active Positions</p>
            <p className="text-xl font-bold text-gray-900">{stats.totalPositions}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center">
          <div className={`p-3 rounded-full mr-4 ${
            stats.totalPnL >= 0 
              ? 'bg-green-100 text-green-600' 
              : 'bg-red-100 text-red-600'
          }`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total P&L</p>
            <p className={`text-xl font-bold ${
              stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              ${stats.totalPnL > 0 ? '+' : ''}
              {stats.totalPnL.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl p-6 shadow-sm border">
        <div className="flex items-center">
          <div className="p-3 rounded-full bg-indigo-100 text-indigo-600 mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-600">Markets</p>
            <p className="text-xl font-bold text-indigo-600">{stats.markets}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
const App: React.FC = () => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stopLossOrders, setStopLossOrders] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [useRealProtocol, setUseRealProtocol] = useState(false);
  
  const { connected } = useWallet();
  const { protocol: realProtocol } = useRealSolanaProtocol();

  useEffect(() => {
    const loadData = async () => {
      if (useRealProtocol && realProtocol) {
        // For now, continue using mock protocol even when "real" is selected
        // This allows testing of the protocol switcher UI while we build the real integration
        console.log('Real protocol mode selected - using enhanced mock data for PerpAscent');
        setMarkets(mockProtocol.getMarkets());
        setPositions(mockProtocol.getPositions());
        setTrades(mockProtocol.getTrades(10));
        setStopLossOrders(mockProtocol.getStopLossOrders());
      } else {
        setMarkets(mockProtocol.getMarkets());
        setPositions(mockProtocol.getPositions());
        setTrades(mockProtocol.getTrades(10));
        setStopLossOrders(mockProtocol.getStopLossOrders());
      }
    };

    loadData();
  }, [useRealProtocol, realProtocol, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="flex">
        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold text-gray-900">Trading Dashboard</h2>
              <button 
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>

            {/* Protocol Status */}
            <div className="mb-6">
              <div className="flex items-center space-x-4">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  useRealProtocol 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {useRealProtocol ? 'Real Solana Protocol' : 'Mock Protocol (Development)'}
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                  connected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {connected ? 'Wallet Connected' : 'Wallet Disconnected'}
                </div>
              </div>
            </div>

            <StatsGrid />
            
            {/* Position Management - Show positions individually */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Position Management</h3>
              {positions.length > 0 ? (
                <div className="space-y-4">
                  {positions.map((position) => {
                    const market = markets.find(m => m.symbol === position.market);
                    if (!market) return null;
                    
                    return (
                      <AdvancedPositionManager 
                        key={position.id}
                        position={position}
                        market={market}
                        onPartialClose={async (positionId, closePercentage) => {
                          await mockProtocol.partialClosePosition(positionId, closePercentage);
                          handleRefresh();
                        }}
                        onModifyMargin={async (positionId, marginChange, isDeposit) => {
                          await mockProtocol.modifyPositionMargin(positionId, marginChange, isDeposit);
                          handleRefresh();
                        }}
                        onSetStopLoss={async (positionId, triggerPrice, closePercentage) => {
                          await mockProtocol.setStopLoss(positionId, triggerPrice, closePercentage);
                          handleRefresh();
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-lg p-8 text-center">
                  <p className="text-gray-500">No positions to manage</p>
                </div>
              )}
            </div>
            
            {/* Stop Loss Orders Dashboard */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Stop Loss Orders</h3>
              <StopLossManager 
                orders={stopLossOrders}
                onCreateOrder={async (params) => {
                  await mockProtocol.setStopLoss(params.positionId, params.triggerPrice, params.closePercentage);
                  handleRefresh();
                }}
                onModifyOrder={async (orderId, newTriggerPrice, newClosePercentage) => {
                  await mockProtocol.modifyStopLossOrder(orderId, newTriggerPrice, newClosePercentage);
                  handleRefresh();
                }}
                onCancelOrder={async (orderId) => {
                  await mockProtocol.cancelStopLossOrder(orderId);
                  handleRefresh();
                }}
                onExecuteOrder={async (orderId) => {
                  await mockProtocol.executeStopLossOrder(orderId);
                  handleRefresh();
                }}
              />
            </div>

            {/* Recent Trades */}
            {trades.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Recent Trades</h3>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Market</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Side</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {trades.map((trade, index) => (
                        <tr key={index}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {trade.market}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              trade.isLong 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {trade.isLong ? 'LONG' : 'SHORT'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {trade.size}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${trade.price.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`text-sm font-semibold ${
                              trade.fee >= 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              -${Math.abs(trade.fee).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(trade.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
        
        {/* Sidebar with Protocol Switcher */}
        <aside className="w-80 bg-white shadow-lg">
          <ProtocolSwitcher
            useRealProtocol={useRealProtocol}
            onToggle={setUseRealProtocol}
            canUseReal={connected}
          />
        </aside>
      </div>
    </div>
  );
};

export default App;
