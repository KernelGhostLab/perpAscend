// WebSocket Price Feed Test Component
import React, { useEffect, useState } from 'react';
import useEnhancedRealTimePrices from '../hooks/useEnhancedRealTimePrices';
import { WebSocketStatusMonitor } from './WebSocketStatusMonitor';

export const WebSocketTestPanel: React.FC = () => {
  const [testSymbols] = useState(['BTC', 'ETH', 'SOL']);
  const [logs, setLogs] = useState<string[]>([]);

  const { 
    prices, 
    connectionStatuses, 
    isWebSocketActive, 
    lastUpdateTime, 
    priceUpdateCount, 
    averageLatency,
    error 
  } = useEnhancedRealTimePrices(testSymbols, {
    method: 'websocket',
    fallbackEnabled: true
  });

  // Log price updates
  useEffect(() => {
    const newLog = `[${new Date().toLocaleTimeString()}] Price update: ${JSON.stringify(Object.keys(prices))} (Count: ${priceUpdateCount})`;
    setLogs(prev => [newLog, ...prev.slice(0, 9)]); // Keep last 10 logs
  }, [priceUpdateCount, prices]);

  // Log connection changes
  useEffect(() => {
    if (connectionStatuses.length > 0) {
      const connected = connectionStatuses.filter(s => s.state === 'connected').length;
      const total = connectionStatuses.length;
      const newLog = `[${new Date().toLocaleTimeString()}] Connections: ${connected}/${total}`;
      setLogs(prev => [newLog, ...prev.slice(0, 9)]);
    }
  }, [connectionStatuses]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
      <h3 className="text-xl font-semibold text-gray-900 mb-4">WebSocket Test Panel</h3>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm text-gray-600">WebSocket Active</div>
          <div className={`text-lg font-bold ${isWebSocketActive ? 'text-green-600' : 'text-red-600'}`}>
            {isWebSocketActive ? 'YES' : 'NO'}
          </div>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm text-gray-600">Price Updates</div>
          <div className="text-lg font-bold text-blue-600">{priceUpdateCount}</div>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm text-gray-600">Avg Latency</div>
          <div className="text-lg font-bold text-purple-600">
            {averageLatency > 0 ? `${averageLatency.toFixed(0)}ms` : '--'}
          </div>
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm text-gray-600">Last Update</div>
          <div className="text-lg font-bold text-gray-600">
            {Math.floor((Date.now() - lastUpdateTime) / 1000)}s ago
          </div>
        </div>
      </div>

      {/* Current Prices */}
      <div className="mb-6">
        <h4 className="text-lg font-medium mb-3">Current Prices</h4>
        <div className="grid grid-cols-3 gap-4">
          {testSymbols.map(symbol => {
            const price = prices[symbol];
            return (
              <div key={symbol} className="bg-gray-50 p-3 rounded-lg">
                <div className="font-medium">{symbol}</div>
                <div className="text-lg font-bold text-green-600">
                  {price ? `$${price.price.toLocaleString()}` : 'Loading...'}
                </div>
                {price && (
                  <div className="text-sm text-gray-500">
                    {new Date(price.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-700 font-medium">Error:</div>
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      )}

      {/* Connection Status */}
      <div className="mb-6">
        <WebSocketStatusMonitor
          connectionStatuses={connectionStatuses}
          averageLatency={averageLatency}
          lastUpdateTime={lastUpdateTime}
          priceUpdateCount={priceUpdateCount}
          isWebSocketActive={isWebSocketActive}
          compact={true}
        />
      </div>

      {/* Activity Log */}
      <div>
        <h4 className="text-lg font-medium mb-3">Activity Log</h4>
        <div className="bg-gray-50 p-3 rounded-lg max-h-48 overflow-y-auto">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="text-sm font-mono text-gray-700 mb-1">
                {log}
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500">No activity yet...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebSocketTestPanel;
