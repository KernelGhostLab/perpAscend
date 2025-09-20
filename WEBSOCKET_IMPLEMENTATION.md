# WebSocket Price Feed Implementation

This document describes the enhanced real-time price feed system implemented for PerpAscend, featuring WebSocket connections with multiple exchange support and automatic fallback mechanisms.

## Architecture Overview

### Core Components

1. **WebSocketPriceService** (`/src/lib/WebSocketPriceService.ts`)
   - Main service managing WebSocket connections to multiple exchanges
   - Handles connection lifecycle, reconnection, and error recovery
   - Provides price aggregation from multiple sources
   - Supports Binance, Coinbase Pro, and Kraken WebSocket APIs

2. **useEnhancedRealTimePrices** (`/src/hooks/useEnhancedRealTimePrices.ts`)
   - React hook providing WebSocket price data with fallback support
   - Maintains backward compatibility with existing useRealTimePrices
   - Supports hybrid mode (WebSocket + polling fallback)
   - Provides connection health monitoring

3. **WebSocketStatusMonitor** (`/src/components/WebSocketStatusMonitor.tsx`)
   - UI component for displaying connection status and health metrics
   - Shows individual exchange connection status
   - Displays latency, update frequency, and error information

4. **WebSocketTestPanel** (`/src/components/WebSocketTestPanel.tsx`)
   - Development tool for testing WebSocket functionality
   - Real-time logging and status monitoring
   - Price update validation and debugging

## Features

### Multi-Exchange Support
- **Binance** - Primary source (highest priority, most liquid)
- **Coinbase Pro** - Secondary source (major pairs)
- **Kraken** - Tertiary source (additional coverage)

### Connection Management
- Automatic connection establishment
- Exponential backoff reconnection strategy
- Connection state monitoring and reporting
- Graceful error handling and recovery

### Price Aggregation
- Confidence-based price selection
- Cross-source validation (detects price anomalies)
- Automatic failover to backup sources
- Data freshness validation

### Fallback Mechanisms
- Automatic fallback to CoinGecko API if WebSockets fail
- Hybrid mode combining WebSocket and polling
- Configurable fallback thresholds and intervals

## Usage Examples

### Basic WebSocket Usage
```typescript
import useEnhancedRealTimePrices from '../hooks/useEnhancedRealTimePrices';

const MyComponent = () => {
  const { prices, isWebSocketActive, connectionStatuses } = useEnhancedRealTimePrices(
    ['BTC', 'ETH', 'SOL'], 
    { method: 'websocket' }
  );
  
  return (
    <div>
      {Object.entries(prices).map(([symbol, price]) => (
        <div key={symbol}>{symbol}: ${price.price}</div>
      ))}
    </div>
  );
};
```

### Hybrid Mode with Fallback
```typescript
const { prices, error, isWebSocketActive } = useEnhancedRealTimePrices(
  symbols, 
  {
    method: 'hybrid',
    fallbackEnabled: true,
    updateInterval: 30000,
    maxStaleness: 60000
  }
);
```

### Connection Status Monitoring
```typescript
import { WebSocketStatusMonitor } from '../components/WebSocketStatusMonitor';

<WebSocketStatusMonitor
  connectionStatuses={connectionStatuses}
  averageLatency={averageLatency}
  lastUpdateTime={lastUpdateTime}
  priceUpdateCount={priceUpdateCount}
  isWebSocketActive={isWebSocketActive}
/>
```

## Configuration Options

### useEnhancedRealTimePrices Options
- `method`: 'websocket' | 'coingecko' | 'hybrid'
- `fallbackEnabled`: boolean (default: true)
- `updateInterval`: number (fallback polling interval in ms)
- `maxStaleness`: number (max age of price data in ms)

### WebSocket Service Configuration
- Exchange priority levels
- Reconnection backoff settings
- Price validation thresholds
- Connection timeout values

## Performance Characteristics

### Latency
- **WebSocket**: 50-200ms typical latency
- **Fallback API**: 1-5 seconds typical latency
- Real-time latency monitoring and reporting

### Update Frequency
- **Binance**: Real-time ticker updates
- **Coinbase Pro**: Real-time ticker updates  
- **Kraken**: Real-time ticker updates
- **Fallback**: 30-second polling intervals

### Reliability Features
- Automatic reconnection with exponential backoff
- Multiple exchange redundancy
- Price validation and anomaly detection
- Graceful degradation to fallback sources

## Debugging and Monitoring

### WebSocket Test Panel
The `WebSocketTestPanel` component provides comprehensive debugging tools:
- Real-time connection status
- Price update logging
- Latency measurements
- Error tracking and reporting

### Console Logging
Detailed logging is available for:
- Connection establishment and failures
- Price updates and validation
- Reconnection attempts
- Fallback activations

### Health Monitoring
The system provides health metrics including:
- Connection uptime and reliability
- Average latency across exchanges
- Price update frequency
- Error rates and types

## Security and CORS Considerations

### CORS Handling
Some exchanges may have CORS restrictions in browser environments. The implementation includes:
- Direct WebSocket connections (bypasses CORS)
- Proxy fallback for REST API calls when needed
- Error handling for cross-origin restrictions

### Rate Limiting
- Exchange-specific rate limiting awareness
- Automatic backoff on rate limit errors
- Connection pooling to minimize resource usage

## Future Enhancements

### Planned Features
1. **Custom Exchange Integration** - Support for additional exchanges
2. **Price History Caching** - Local storage of price data
3. **Advanced Aggregation** - Volume-weighted price averaging
4. **Anomaly Detection** - Enhanced price validation algorithms
5. **Performance Metrics** - Detailed analytics and reporting

### Integration Points
- Order execution price validation
- Stop-loss trigger price accuracy
- Portfolio valuation updates
- Trading signal generation

## Troubleshooting

### Common Issues
1. **WebSocket Connection Failures**
   - Check network connectivity
   - Verify exchange WebSocket URLs
   - Review browser console for CORS errors

2. **Price Update Delays**
   - Monitor connection status indicators
   - Check average latency metrics
   - Verify fallback mechanisms are working

3. **Compilation Errors**
   - Ensure all TypeScript dependencies are installed
   - Verify import paths are correct
   - Check for missing type declarations

### Debug Steps
1. Enable WebSocket test panel in development
2. Monitor browser network tab for WebSocket connections
3. Check console logs for detailed error messages
4. Verify fallback API responses in network tab

This implementation provides a robust, scalable foundation for real-time price feeds with enterprise-grade reliability and monitoring capabilities.
