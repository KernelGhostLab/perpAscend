import React, { useState, useEffect, useCallback } from 'react';
import { mockProtocol, Market, Position, Trade } from './lib/mockProtocol';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealSolanaProtocol } from './lib/realSolanaProtocol';
import { ProtocolSwitcher } from './components/ProtocolSwitcher';
import { AdvancedPositionManager } from './components/AdvancedPositionManager';
import { StopLossOrder } from './components/StopLossManager';
import { RealTimePriceDisplay } from './components/RealTimePriceDisplay';
import { OrderDashboard } from './components/OrderDashboard';

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
              alt="PerpAscend Protocol" 
              className="w-8 h-8" 
            />
            <h1 className="text-2xl font-bold text-white">PerpAscend Protocol</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-blue-200">
              Advanced Solana Perpetual Futures Trading Interface
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

// Main App Component with Advanced Order Management
const App: React.FC = () => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stopLossOrders, setStopLossOrders] = useState<StopLossOrder[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [useRealProtocol, setUseRealProtocol] = useState(false);
  const [autoExecutionEnabled, setAutoExecutionEnabled] = useState(false);
  
  const { connected } = useWallet();
  const { protocol: realProtocol } = useRealSolanaProtocol();

  const handleBulkCancel = useCallback(async (orderIds: string[]) => {
    setStopLossOrders(prevOrders => 
      prevOrders.map(order => 
        orderIds.includes(order.id)
          ? { ...order, status: 'cancelled' as const }
          : order
      )
    );
    console.log('Bulk cancel:', orderIds);
  }, []);

  const handleBulkExecute = useCallback(async (orderIds: string[]) => {
    setStopLossOrders(prevOrders => 
      prevOrders.map(order => 
        orderIds.includes(order.id)
          ? { ...order, status: 'triggered' as const, triggeredAt: Date.now() }
          : order
      )
    );
    console.log('Bulk execute:', orderIds);
  }, []);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      if (useRealProtocol && realProtocol) {
        console.log('Real protocol mode selected - using enhanced mock data for PerpAscend');
        setMarkets(mockProtocol.getMarkets());
        setPositions(mockProtocol.getPositions());
        setTrades(mockProtocol.getTrades(10));
        // Keep existing orders when switching protocols
      } else {
        setMarkets(mockProtocol.getMarkets());
        setPositions(mockProtocol.getPositions());
        setTrades(mockProtocol.getTrades(10));
        // Add mock stop loss orders if none exist
        if (stopLossOrders.length === 0) {
          const mockOrders = mockProtocol.getStopLossOrders();
          setStopLossOrders(mockOrders.map(order => ({
            ...order,
            orderType: 'stop_loss' as const,
            createdAt: Date.now() - Math.random() * 3600000,
            status: 'active' as const
          })));
        }
      }
    };

    loadData();
  }, [useRealProtocol, realProtocol, refreshKey, stopLossOrders.length]);

  // Add demo orders for testing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (stopLossOrders.length === 0) {
        const sampleOrders: StopLossOrder[] = [
          {
            id: 'demo_1',
            positionId: 'pos_1',
            user: 'demo_user',
            market: 'BTC',
            triggerPrice: 64000,
            currentPrice: 66500,
            closePercentage: 50,
            isLong: true,
            status: 'active',
            orderType: 'stop_loss',
            createdAt: Date.now() - 3600000,
            distanceToTrigger: 0,
            estimatedLoss: 0
          },
          {
            id: 'demo_2',
            positionId: 'pos_2',
            user: 'demo_user',
            market: 'ETH',
            triggerPrice: 3800,
            currentPrice: 3950,
            closePercentage: 100,
            isLong: false,
            status: 'active',
            orderType: 'trailing_stop',
            trailingDistance: 3,
            trailingHighWaterMark: 3950,
            createdAt: Date.now() - 1800000,
            distanceToTrigger: 0,
            estimatedLoss: 0
          },
          {
            id: 'demo_3',
            positionId: 'pos_3',
            user: 'demo_user',
            market: 'SOL',
            triggerPrice: 210,
            currentPrice: 205,
            closePercentage: 75,
            isLong: true,
            status: 'active',
            orderType: 'oco',
            takeProfitPrice: 220,
            stopLossPrice: 195,
            createdAt: Date.now() - 900000,
            distanceToTrigger: 0,
            estimatedLoss: 0
          }
        ];
        
        setStopLossOrders(sampleOrders);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [stopLossOrders.length]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Mock position for order creator
  const mockPosition: Position = {
    id: 'pos_demo',
    user: 'demo_user',
    market: 'BTC',
    isLong: true,
    baseSize: 1.5,
    entryPrice: 65000,
    margin: 10000,
    openTime: Date.now() - 3600000,
    pnl: 2250,
    equity: 12250,
    liquidationPrice: 55000
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="flex">
        {/* Main Content */}
        <main className="flex-1 p-6 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-gray-900">Advanced Trading Dashboard</h2>
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
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              autoExecutionEnabled 
                ? 'bg-purple-100 text-purple-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              Auto-Execution: {autoExecutionEnabled ? 'ON' : 'OFF'}
            </div>
          </div>

          {/* Real-Time Price Display */}
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Live Market Prices</h3>
            <RealTimePriceDisplay 
              symbols={['BTC', 'ETH', 'SOL', 'ADA', 'AVAX', 'MATIC', 'DOT', 'LINK', 'UNI']} 
              method="coingecko" 
            />
          </div>

          {/* Advanced Order Dashboard */}
          <OrderDashboard
            orders={stopLossOrders}
            onBulkCancel={handleBulkCancel}
            onBulkExecute={handleBulkExecute}
            onToggleAutoExecution={setAutoExecutionEnabled}
            autoExecutionEnabled={autoExecutionEnabled}
          />

          {/* Simple monitoring stats */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Order Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stopLossOrders.filter(o => o.status === 'active').length}</div>
                <div className="text-sm text-gray-600">Active Orders</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stopLossOrders.filter(o => o.status === 'triggered').length}</div>
                <div className="text-sm text-gray-600">Triggered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stopLossOrders.filter(o => o.orderType === 'trailing_stop').length}</div>
                <div className="text-sm text-gray-600">Trailing Stops</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stopLossOrders.filter(o => o.orderType === 'oco').length}</div>
                <div className="text-sm text-gray-600">OCO Orders</div>
              </div>
            </div>
          </div>          {/* Position Management */}
          {positions.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Position Management</h3>
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
            </div>
          )}

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
