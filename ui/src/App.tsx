import React, { useState, useEffect } from 'react';
import { mockProtocol, Market, Position, Trade } from './lib/mockProtocol';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRealSolanaProtocol } from './lib/realSolanaProtocol';
import { ProtocolSwitcher } from './components/ProtocolSwitcher';
import { AdvancedPositionManager } from './components/AdvancedPositionManager';
import { StopLossManager, StopLossOrder } from './components/StopLossManager';
import { RealTimePriceDisplay } from './components/RealTimePriceDisplay';

// Header Component
const Header = () => {
  const { connected, publicKey } = useWallet();
  
  return (
    <header className="header-glass sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <img 
                src="/my-logo.svg" 
                alt="PerpAscend Protocol" 
                className="w-10 h-10 float relative z-10" 
              />
              <div className="absolute -inset-1 bg-gradient-to-r from-trading-accent-primary to-brand-500 rounded-full opacity-20 blur"></div>
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">PerpAscend Protocol</h1>
              <div className="text-xs text-trading-text-tertiary">Advanced Perpetual Futures Platform</div>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            <div className="hidden md:flex items-center space-x-4">
              <div className="text-sm text-trading-text-secondary font-medium">
                Solana Network
              </div>
              {connected && publicKey && (
                <div className="flex items-center space-x-2 px-3 py-2 rounded-xl bg-trading-bg-secondary border border-trading-border-accent">
                  <div className="status-connected"></div>
                  <span className="text-xs font-mono text-trading-text-primary">
                    {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
                  </span>
                </div>
              )}
            </div>
            <WalletMultiButton className="!bg-gradient-to-r !from-trading-accent-primary !to-brand-500 !border-0 !rounded-xl !font-medium hover:!scale-105 !transition-all !duration-300" />
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
  
  const { connected } = useWallet();
  const { protocol: realProtocol } = useRealSolanaProtocol();

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

  return (
    <div className="min-h-screen bg-trading-bg-primary">
      <Header />
      
      <div className="flex">
        {/* Main Content */}
        <main className="flex-1 p-6 space-y-8 custom-scrollbar overflow-y-auto max-h-screen">
          {/* Dashboard Header */}
          <div className="flex items-center justify-between animate-slide-down">
            <div>
              <h2 className="text-responsive-2xl font-bold text-trading-text-primary mb-2">Trading Dashboard</h2>
              <p className="text-trading-text-secondary">Professional perpetual futures trading interface</p>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={handleRefresh}
                className="btn-secondary flex items-center space-x-2 group"
              >
                <svg className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Protocol Status */}
          <div className="flex items-center space-x-4 animate-fade-in">
            <div className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-300 ${
              useRealProtocol 
                ? 'bg-profit-900/10 text-profit-500 border-profit-500/20' 
                : 'bg-brand-900/10 text-brand-400 border-brand-500/20'
            }`}>
              <div className="flex items-center space-x-2">
                <div className={`status-dot ${useRealProtocol ? 'bg-profit-500' : 'bg-brand-400'}`}></div>
                <span>{useRealProtocol ? 'Live Protocol' : 'Demo Mode'}</span>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-300 ${
              connected 
                ? 'bg-profit-900/10 text-profit-500 border-profit-500/20' 
                : 'bg-loss-900/10 text-loss-500 border-loss-500/20'
            }`}>
              <div className="flex items-center space-x-2">
                <div className={connected ? 'status-connected' : 'status-disconnected'}></div>
                <span>{connected ? 'Wallet Connected' : 'Wallet Disconnected'}</span>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-300 ${
              useRealProtocol 
                ? 'bg-trading-accent-secondary/10 text-trading-accent-secondary border-trading-accent-secondary/20' 
                : 'bg-trading-text-tertiary/10 text-trading-text-tertiary border-trading-border-primary'
            }`}>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-current rounded-full opacity-60"></div>
                <span>Protocol: {useRealProtocol ? 'Solana Mainnet' : 'Local Mock'}</span>
              </div>
            </div>
          </div>

          {/* Real-Time Price Display */}
          <div className="trading-card-glass animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-trading-text-primary">Live Market Prices</h3>
              <div className="flex items-center space-x-2 text-sm text-trading-text-secondary">
                <div className="status-connected"></div>
                <span>Real-time data</span>
              </div>
            </div>
            <RealTimePriceDisplay 
              symbols={['BTC', 'ETH', 'SOL', 'ADA', 'AVAX', 'MATIC', 'DOT', 'LINK', 'UNI']} 
              method="hybrid"
            />
          </div>

          {/* Stop Loss Manager */}
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Stop Loss Orders</h3>
            <StopLossManager 
              orders={stopLossOrders}
              onCreateOrder={async (params) => {
                const newOrder: StopLossOrder = {
                  id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  user: 'demo_user',
                  market: 'BTC', // You might want to make this dynamic
                  isLong: true, // You might want to make this dynamic
                  status: 'active',
                  createdAt: Date.now(),
                  currentPrice: 66500, // This should be dynamic
                  distanceToTrigger: 0,
                  estimatedLoss: 0,
                  ...params
                };
                setStopLossOrders(prev => [...prev, newOrder]);
              }}
              onModifyOrder={async (orderId: string, newTriggerPrice: number, newClosePercentage: number) => {
                setStopLossOrders(prev => 
                  prev.map(order => 
                    order.id === orderId 
                      ? { ...order, triggerPrice: newTriggerPrice, closePercentage: newClosePercentage } 
                      : order
                  )
                );
              }}
              onCancelOrder={async (orderId: string) => {
                setStopLossOrders(prev =>
                  prev.map(order =>
                    order.id === orderId ? { ...order, status: 'cancelled' } : order
                  )
                );
              }}
            />
          </div>

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
                <div className="text-2xl font-bold text-orange-600">{stopLossOrders.filter(o => o.status === 'cancelled').length}</div>
                <div className="text-sm text-gray-600">Cancelled</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stopLossOrders.length}</div>
                <div className="text-sm text-gray-600">Total Orders</div>
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
  };export default App;
