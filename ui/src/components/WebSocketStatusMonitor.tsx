// WebSocket Connection Status Monitor Component
import React from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  SignalIcon
} from '@heroicons/react/24/outline';
import { ConnectionState, ConnectionStatus } from '../lib/WebSocketPriceService';

interface WebSocketStatusMonitorProps {
  connectionStatuses: ConnectionStatus[];
  averageLatency: number;
  lastUpdateTime: number;
  priceUpdateCount: number;
  isWebSocketActive: boolean;
  compact?: boolean;
}

export const WebSocketStatusMonitor: React.FC<WebSocketStatusMonitorProps> = ({
  connectionStatuses,
  averageLatency,
  lastUpdateTime,
  priceUpdateCount,
  isWebSocketActive,
  compact = false
}) => {
  // Calculate overall health
  const connectedCount = connectionStatuses.filter(s => s.state === ConnectionState.CONNECTED).length;
  const totalCount = connectionStatuses.length;
  
  const overallHealth = () => {
    if (connectedCount === totalCount && totalCount > 0) return 'healthy';
    if (connectedCount > 0) return 'partial';
    if (connectionStatuses.some(s => s.state === ConnectionState.ERROR)) return 'error';
    return 'disconnected';
  };

  const health = overallHealth();
  const timeSinceUpdate = Date.now() - lastUpdateTime;
  const isStale = timeSinceUpdate > 60000; // 1 minute

  // Get appropriate color scheme
  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'partial': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Get connection state icon and color
  const getStateIcon = (state: ConnectionState) => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case ConnectionState.CONNECTING:
      case ConnectionState.RECONNECTING:
        return <ArrowPathIcon className="w-4 h-4 text-yellow-500 animate-spin" />;
      case ConnectionState.ERROR:
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      default:
        return <ExclamationTriangleIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-2 text-xs">
        <div className={`flex items-center space-x-1 px-2 py-1 rounded-full ${getHealthColor(health)}`}>
          <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
          <span className="font-medium">
            {isWebSocketActive ? 'WebSocket' : 'Fallback'}
          </span>
        </div>
        
        {isWebSocketActive && (
          <>
            <span className="text-gray-500">
              {connectedCount}/{totalCount} Connected
            </span>
            {averageLatency > 0 && (
              <span className="text-gray-500">
                {averageLatency.toFixed(0)}ms
              </span>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Connection Status</h3>
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${getHealthColor(health)}`}>
          <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
          <span className="text-sm font-medium capitalize">{health}</span>
        </div>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Active Feeds</span>
            <SignalIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">
            {connectedCount}/{totalCount}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Avg Latency</span>
            <div className={`w-4 h-4 rounded-full ${
              averageLatency < 100 ? 'bg-green-400' : 
              averageLatency < 500 ? 'bg-yellow-400' : 'bg-red-400'
            }`}></div>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">
            {averageLatency > 0 ? `${averageLatency.toFixed(0)}ms` : '--'}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Updates</span>
            <div className={`w-2 h-2 rounded-full ${
              !isStale ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
            }`}></div>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">
            {priceUpdateCount.toLocaleString()}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Last Update</span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1">
            {isStale ? 
              <span className="text-red-500">Stale</span> :
              `${Math.floor(timeSinceUpdate / 1000)}s ago`
            }
          </div>
        </div>
      </div>

      {/* Individual Exchange Status */}
      {connectionStatuses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Exchange Connections</h4>
          <div className="space-y-2">
            {connectionStatuses.map((status) => (
              <div key={status.exchange} 
                   className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStateIcon(status.state)}
                  <div>
                    <div className="font-medium text-gray-900 capitalize">
                      {status.exchange}
                    </div>
                    <div className="text-sm text-gray-500 capitalize">
                      {status.state.replace('_', ' ')}
                      {status.reconnectAttempts > 0 && 
                        ` (${status.reconnectAttempts} attempts)`
                      }
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  {status.latency > 0 && (
                    <div className="text-sm font-medium text-gray-900">
                      {status.latency.toFixed(0)}ms
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    {new Date(status.lastUpdate).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning messages */}
      {isStale && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
            <span className="text-sm font-medium text-yellow-800">
              Price data is stale. Check your internet connection.
            </span>
          </div>
        </div>
      )}

      {!isWebSocketActive && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <SignalIcon className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-blue-800">
              Using fallback price feed. WebSocket connections will retry automatically.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// Simple status indicator for embedding in other components
export const WebSocketStatusIndicator: React.FC<{
  isActive: boolean;
  health: 'healthy' | 'partial' | 'error' | 'disconnected';
  latency?: number;
}> = ({ isActive, health, latency }) => {
  const getColor = () => {
    if (!isActive) return 'bg-gray-400';
    switch (health) {
      case 'healthy': return 'bg-green-400';
      case 'partial': return 'bg-yellow-400'; 
      case 'error': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-2 h-2 rounded-full ${getColor()} ${
        isActive && health === 'healthy' ? 'animate-pulse' : ''
      }`}></div>
      <span className="text-xs text-gray-500">
        {isActive ? 'WebSocket' : 'Fallback'}
        {latency && latency > 0 && ` ${latency.toFixed(0)}ms`}
      </span>
    </div>
  );
};

export default WebSocketStatusMonitor;
