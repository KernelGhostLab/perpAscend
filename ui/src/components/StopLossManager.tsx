import React, { useState, useEffect } from 'react';
import { 
  ShieldExclamationIcon, 
  ClockIcon, 
  TrashIcon, 
  PencilIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

// Stop Loss Order Types
export interface StopLossOrder {
  id: string;
  positionId: string;
  user: string;
  market: string;
  triggerPrice: number;
  closePercentage: number;
  isLong: boolean;
  status: 'active' | 'triggered' | 'cancelled' | 'expired';
  createdAt: number;
  triggeredAt?: number;
  currentPrice: number;
  distanceToTrigger: number;
  estimatedLoss: number;
}

interface StopLossManagerProps {
  orders: StopLossOrder[];
  onCreateOrder: (params: {
    positionId: string;
    triggerPrice: number;
    closePercentage: number;
  }) => Promise<void>;
  onModifyOrder: (orderId: string, newTriggerPrice: number, newClosePercentage: number) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
  onExecuteOrder?: (orderId: string) => Promise<void>; // For manual execution/testing
}

export const StopLossManager: React.FC<StopLossManagerProps> = ({
  orders,
  onCreateOrder,
  onModifyOrder,
  onCancelOrder,
  onExecuteOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editPercentage, setEditPercentage] = useState(100);

  // Filter orders by status
  const activeOrders = orders.filter(order => order.status === 'active');
  const historyOrders = orders.filter(order => order.status !== 'active');

  // Sort by urgency (closest to trigger price)
  const sortedActiveOrders = [...activeOrders].sort((a, b) => 
    Math.abs(a.distanceToTrigger) - Math.abs(b.distanceToTrigger)
  );

  const handleStartEdit = (order: StopLossOrder) => {
    setEditingOrder(order.id);
    setEditPrice(order.triggerPrice.toString());
    setEditPercentage(order.closePercentage);
  };

  const handleSaveEdit = async (orderId: string) => {
    try {
      await onModifyOrder(orderId, parseFloat(editPrice), editPercentage);
      setEditingOrder(null);
    } catch (error) {
      alert(`Error modifying order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancelEdit = () => {
    setEditingOrder(null);
    setEditPrice('');
    setEditPercentage(100);
  };

  const formatDistance = (distance: number) => {
    const absDistance = Math.abs(distance);
    const direction = distance > 0 ? 'above' : 'below';
    return `${absDistance.toFixed(2)}% ${direction}`;
  };

  const getOrderUrgency = (order: StopLossOrder) => {
    const absDistance = Math.abs(order.distanceToTrigger);
    if (absDistance <= 1) return 'critical';
    if (absDistance <= 5) return 'warning';
    return 'safe';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'triggered': return 'text-blue-600 bg-blue-100';
      case 'cancelled': return 'text-gray-600 bg-gray-100';
      case 'expired': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'border-red-500 bg-red-50';
      case 'warning': return 'border-yellow-500 bg-yellow-50';
      default: return 'border-gray-200 bg-white';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ShieldExclamationIcon className="w-8 h-8" />
            <div>
              <h3 className="text-2xl font-bold">Stop-Loss Orders</h3>
              <p className="text-red-100">Automated risk management</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{activeOrders.length}</div>
            <div className="text-red-100 text-sm">Active Orders</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-4 px-6 text-sm font-medium ${
            activeTab === 'active'
              ? 'text-red-600 border-b-2 border-red-600 bg-red-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Active Orders ({activeOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-4 px-6 text-sm font-medium ${
            activeTab === 'history'
              ? 'text-red-600 border-b-2 border-red-600 bg-red-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          Order History ({historyOrders.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'active' ? (
          <div>
            {activeOrders.length === 0 ? (
              <div className="text-center py-12">
                <ShieldExclamationIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h4 className="text-xl font-medium text-gray-600 mb-2">No Active Stop-Loss Orders</h4>
                <p className="text-gray-500">
                  Create stop-loss orders through the Advanced Position Manager to protect your positions.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedActiveOrders.map((order) => {
                  const urgency = getOrderUrgency(order);
                  const isEditing = editingOrder === order.id;

                  return (
                    <div
                      key={order.id}
                      className={`border-2 rounded-lg p-4 ${getUrgencyColor(urgency)}`}
                    >
                      <div className="flex items-start justify-between">
                        {/* Order Info */}
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className="flex items-center space-x-1">
                              {order.isLong ? (
                                <ArrowTrendingUpIcon className="w-4 h-4 text-green-600" />
                              ) : (
                                <ArrowTrendingDownIcon className="w-4 h-4 text-red-600" />
                              )}
                              <span className="font-mono text-sm font-medium">
                                {order.market}/USDC
                              </span>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                              {order.status.toUpperCase()}
                            </span>
                            {urgency === 'critical' && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white animate-pulse">
                                CRITICAL
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                            <div>
                              <p className="text-xs text-gray-600">Current Price</p>
                              <p className="font-mono text-sm font-medium">${order.currentPrice.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Trigger Price</p>
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  step="0.01"
                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                                />
                              ) : (
                                <p className="font-mono text-sm font-medium text-red-600">
                                  ${order.triggerPrice.toFixed(2)}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Close Amount</p>
                              {isEditing ? (
                                <div className="flex items-center space-x-1">
                                  <input
                                    type="number"
                                    value={editPercentage}
                                    onChange={(e) => setEditPercentage(parseInt(e.target.value) || 100)}
                                    min="1"
                                    max="100"
                                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                                  />
                                  <span className="text-xs">%</span>
                                </div>
                              ) : (
                                <p className="font-mono text-sm font-medium">{order.closePercentage}%</p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Distance to Trigger</p>
                              <p className={`font-mono text-sm font-medium ${
                                urgency === 'critical' ? 'text-red-600' : 
                                urgency === 'warning' ? 'text-yellow-600' : 'text-gray-700'
                              }`}>
                                {formatDistance(order.distanceToTrigger)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-1 text-gray-600">
                                <ClockIcon className="w-4 h-4" />
                                <span>Created {new Date(order.createdAt).toLocaleDateString()}</span>
                              </div>
                              <div className="text-gray-600">
                                Est. Loss: <span className="font-mono text-red-600">
                                  ${order.estimatedLoss.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-2 ml-4">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(order.id)}
                                className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                title="Save Changes"
                              >
                                <CheckCircleIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Cancel Edit"
                              >
                                <XCircleIcon className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEdit(order)}
                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Edit Order"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              {onExecuteOrder && (
                                <button
                                  onClick={() => onExecuteOrder(order.id)}
                                  className="p-2 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors"
                                  title="Execute Order (Testing)"
                                >
                                  <ShieldExclamationIcon className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => onCancelOrder(order.id)}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                title="Cancel Order"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Order History */
          <div>
            {historyOrders.length === 0 ? (
              <div className="text-center py-12">
                <ClockIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h4 className="text-xl font-medium text-gray-600 mb-2">No Order History</h4>
                <p className="text-gray-500">
                  Your triggered, cancelled, and expired stop-loss orders will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyOrders
                  .sort((a, b) => (b.triggeredAt || b.createdAt) - (a.triggeredAt || a.createdAt))
                  .map((order) => (
                    <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            {order.isLong ? (
                              <ArrowTrendingUpIcon className="w-4 h-4 text-green-600" />
                            ) : (
                              <ArrowTrendingDownIcon className="w-4 h-4 text-red-600" />
                            )}
                            <span className="font-mono text-sm font-medium">{order.market}/USDC</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                              {order.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            Trigger: <span className="font-mono">${order.triggerPrice.toFixed(2)}</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            Amount: <span className="font-mono">{order.closePercentage}%</span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {order.status === 'triggered' && order.triggeredAt
                            ? `Triggered ${new Date(order.triggeredAt).toLocaleString()}`
                            : `Created ${new Date(order.createdAt).toLocaleString()}`}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {activeOrders.length > 0 && activeTab === 'active' && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <div className="flex justify-between items-center text-sm">
            <div className="flex space-x-6">
              <div>
                <span className="text-gray-600">Total Protected Value:</span>
                <span className="font-mono font-medium ml-2">
                  ${activeOrders.reduce((sum, order) => sum + order.estimatedLoss, 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Critical Orders:</span>
                <span className="font-mono font-medium ml-2 text-red-600">
                  {activeOrders.filter(order => getOrderUrgency(order) === 'critical').length}
                </span>
              </div>
            </div>
            <div className="text-gray-500 text-xs">
              Orders update in real-time with market prices
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
