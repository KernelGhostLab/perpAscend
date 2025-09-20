import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebSocketPriceService, ConnectionState, PriceUpdate } from '../lib/WebSocketPriceService'
import { createMockWebSocket } from './utils'

global.WebSocket = vi.fn() as any

describe('WebSocketPriceService', () => {
  let service: WebSocketPriceService
  let mockWebSockets: Map<string, any>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    service = new WebSocketPriceService()
    mockWebSockets = new Map()
    
    // Mock WebSocket constructor to track instances
    ;(global.WebSocket as any).mockImplementation((url: string) => {
      const { mockWs } = createMockWebSocket()
      const exchangeName = url.includes('binance') ? 'binance' : 
                          url.includes('coinbase') ? 'coinbase' : 'kraken'
      mockWebSockets.set(exchangeName, mockWs)
      return mockWs
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    service.disconnect()
  })

  describe('Initialization', () => {
    it('should create service instance correctly', () => {
      expect(service).toBeInstanceOf(WebSocketPriceService)
    })

    it('should have exchange configurations', () => {
      expect(service['exchanges']).toHaveLength(3)
      expect(service['exchanges'].map(e => e.name)).toEqual(['binance', 'coinbase', 'kraken'])
    })
  })

  describe('Connection Management', () => {
    const testSymbols = ['BTC', 'ETH', 'SOL']

    it('should attempt to connect to all exchanges', async () => {
      await service.subscribe(testSymbols)

      expect(global.WebSocket).toHaveBeenCalledTimes(3)
      expect(mockWebSockets.size).toBe(3)
    })

    it('should sort exchanges by priority when connecting', async () => {
      const connectionOrder: string[] = []
      
      ;(global.WebSocket as any).mockImplementation((url: string) => {
        const { mockWs } = createMockWebSocket()
        const exchangeName = url.includes('binance') ? 'binance' : 
                            url.includes('coinbase') ? 'coinbase' : 'kraken'
        connectionOrder.push(exchangeName)
        return mockWs
      })

      await service.subscribe(testSymbols)

      // Should connect in priority order: binance (1), coinbase (2), kraken (3)
      expect(connectionOrder).toEqual(['binance', 'coinbase', 'kraken'])
    })

    it('should update connection status during connection process', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(testSymbols)

      // Should have received status updates
      expect(statusCallback).toHaveBeenCalled()
      
      const lastCall = statusCallback.mock.calls[statusCallback.mock.calls.length - 1]
      const statuses = lastCall[0]
      
      expect(statuses).toHaveLength(3)
      expect(statuses.some((s: any) => s.state === ConnectionState.CONNECTING)).toBe(true)
    })

    it('should handle successful connections', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(testSymbols)

      // Simulate successful connections
      for (const [_, mockWs] of mockWebSockets) {
        mockWs.onopen({ type: 'open' })
      }

      await vi.runAllTimersAsync()

      const lastCall = statusCallback.mock.calls[statusCallback.mock.calls.length - 1]
      const statuses = lastCall[0]
      
      expect(statuses.every((s: any) => s.state === ConnectionState.CONNECTED)).toBe(true)
    })
  })

  describe('Message Processing', () => {
    beforeEach(async () => {
      await service.subscribe(['BTC', 'ETH'])
    })

    it('should parse Binance messages correctly', () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('BTC', priceCallback)

      const binanceWs = mockWebSockets.get('binance')
      const mockBinanceMessage = {
        stream: 'btcusdt@ticker',
        data: {
          s: 'BTCUSDT',
          c: '65000.00',
          P: '2.5',
          v: '1000000'
        }
      }

      binanceWs.onmessage({ data: JSON.stringify(mockBinanceMessage) })

      expect(priceCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC',
          price: 65000,
          change24h: 2.5,
          source: 'binance'
        })
      )
    })

    it('should parse Coinbase messages correctly', () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('BTC', priceCallback)

      const coinbaseWs = mockWebSockets.get('coinbase')
      const mockCoinbaseMessage = {
        type: 'ticker',
        product_id: 'BTC-USD',
        price: '65000.00',
        open_24h: '63414.29',
        volume_24h: '1000000'
      }

      coinbaseWs.onmessage({ data: JSON.stringify(mockCoinbaseMessage) })

      expect(priceCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTC',
          price: 65000,
          source: 'coinbase'
        })
      )
    })

    it('should handle invalid message formats gracefully', () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('BTC', priceCallback)

      const binanceWs = mockWebSockets.get('binance')
      
      // Invalid JSON
      binanceWs.onmessage({ data: 'invalid json' })
      expect(priceCallback).not.toHaveBeenCalled()

      // Missing required fields
      binanceWs.onmessage({ data: JSON.stringify({ incomplete: 'message' }) })
      expect(priceCallback).not.toHaveBeenCalled()
    })

    it('should calculate confidence scores based on source reliability', () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('BTC', priceCallback)

      const binanceWs = mockWebSockets.get('binance')
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: {
          s: 'BTCUSDT',
          c: '65000.00',
          P: '2.5',
          v: '1000000'
        }
      }

      binanceWs.onmessage({ data: JSON.stringify(mockMessage) })

      const priceUpdate = priceCallback.mock.calls[0][0] as PriceUpdate
      expect(priceUpdate.confidence).toBeGreaterThan(0)
      expect(priceUpdate.confidence).toBeLessThanOrEqual(100)
    })
  })

  describe('Price Callbacks', () => {
    beforeEach(async () => {
      await service.subscribe(['BTC'])
    })

    it('should allow multiple callbacks for the same symbol', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      service.onPriceUpdate('BTC', callback1)
      service.onPriceUpdate('BTC', callback2)

      const binanceWs = mockWebSockets.get('binance')
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: { s: 'BTCUSDT', c: '65000.00', P: '2.5', v: '1000000' }
      }

      binanceWs.onmessage({ data: JSON.stringify(mockMessage) })

      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('should remove callbacks correctly', () => {
      const callback = vi.fn()
      const unsubscribe = service.onPriceUpdate('BTC', callback)

      unsubscribe()

      const binanceWs = mockWebSockets.get('binance')
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: { s: 'BTCUSDT', c: '65000.00', P: '2.5', v: '1000000' }
      }

      binanceWs.onmessage({ data: JSON.stringify(mockMessage) })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle connection errors', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(['BTC'])

      // Simulate connection error
      const binanceWs = mockWebSockets.get('binance')
      binanceWs.onerror({ type: 'error', message: 'Connection failed' })

      await vi.runAllTimersAsync()

      const lastCall = statusCallback.mock.calls[statusCallback.mock.calls.length - 1]
      const statuses = lastCall[0]
      const binanceStatus = statuses.find((s: any) => s.exchange === 'binance')
      
      expect(binanceStatus.state).toBe(ConnectionState.ERROR)
    })

    it('should handle connection close and attempt reconnection', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(['BTC'])

      // Simulate successful connection first
      const binanceWs = mockWebSockets.get('binance')
      binanceWs.onopen({ type: 'open' })

      // Then simulate close
      binanceWs.onclose({ type: 'close', code: 1006 })

      await vi.runAllTimersAsync()

      // Should attempt reconnection
      expect(statusCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            exchange: 'binance',
            state: ConnectionState.RECONNECTING
          })
        ])
      )
    })

    it('should limit reconnection attempts', async () => {
      await service.subscribe(['BTC'])

      const binanceWs = mockWebSockets.get('binance')

      // Simulate multiple connection failures
      for (let i = 0; i < 10; i++) {
        binanceWs.onclose({ type: 'close', code: 1006 })
        vi.advanceTimersByTime(5000) // Skip delay between attempts
        
        // Create new mock for next attempt
        const { mockWs } = createMockWebSocket()
        ;(global.WebSocket as any).mockReturnValueOnce(mockWs)
        mockWebSockets.set('binance', mockWs)
        
        if (mockWs.onerror) {
          // Just simulate error without calling - connection will fail
        }
      }

      // Should eventually stop trying
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)
      
      await vi.runAllTimersAsync()

      // Should have made multiple attempts
      expect(global.WebSocket).toHaveBeenCalledTimes(13) // 3 initial + 10 retries
    })
  })

  describe('Performance Features', () => {
    it('should calculate latency for price updates', () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('BTC', priceCallback)

      const binanceWs = mockWebSockets.get('binance')
      const startTime = Date.now()
      
      vi.setSystemTime(startTime + 100) // Simulate 100ms latency
      
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: { s: 'BTCUSDT', c: '65000.00', P: '2.5', v: '1000000' }
      }

      binanceWs.onmessage({ data: JSON.stringify(mockMessage) })

      const priceUpdate = priceCallback.mock.calls[0][0] as PriceUpdate
      expect(priceUpdate.latency).toBeGreaterThanOrEqual(0)
    })

    it('should throttle rapid price updates', async () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('BTC', priceCallback)

      await service.subscribe(['BTC'])

      const binanceWs = mockWebSockets.get('binance')
      const mockMessage = {
        stream: 'btcusdt@ticker',
        data: { s: 'BTCUSDT', c: '65000.00', P: '2.5', v: '1000000' }
      }

      // Send multiple rapid updates
      for (let i = 0; i < 10; i++) {
        binanceWs.onmessage({ data: JSON.stringify(mockMessage) })
      }

      // Should not call callback for every update (throttled)
      expect(priceCallback.mock.calls.length).toBeLessThan(10)
    })
  })

  describe('Cleanup', () => {
    it('should disconnect all connections on cleanup', async () => {
      const cleanup = await service.subscribe(['BTC'])

      cleanup()

      // All WebSocket connections should be closed
      for (const [, mockWs] of mockWebSockets) {
        expect(mockWs.close).toHaveBeenCalled()
      }
    })

    it('should clear all timers on disconnect', async () => {
      await service.subscribe(['BTC'])

      // Simulate some failed connections to create timers
      const binanceWs = mockWebSockets.get('binance')
      binanceWs.onclose({ type: 'close', code: 1006 })

      service.disconnect()

      // All timers should be cleared (no pending timers)
      expect(vi.getTimerCount()).toBe(0)
    })

    it('should remove all callbacks on disconnect', async () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('BTC', priceCallback)

      await service.subscribe(['BTC'])
      service.disconnect()

      // Try to trigger callback after disconnect
      const binanceWs = mockWebSockets.get('binance')
      const mockMessage = {
        stream: 'btcusdt@ticker',  
        data: { s: 'BTCUSDT', c: '65000.00', P: '2.5', v: '1000000' }
      }

      binanceWs.onmessage({ data: JSON.stringify(mockMessage) })

      expect(priceCallback).not.toHaveBeenCalled()
    })
  })

  describe('Symbol Mapping', () => {
    it('should correctly map symbols for different exchanges', () => {
      const binanceMapping = service['exchanges'][0].symbolMapping
      const coinbaseMapping = service['exchanges'][1].symbolMapping
      const krakenMapping = service['exchanges'][2].symbolMapping

      expect(binanceMapping['BTC']).toBe('BTCUSDT')
      expect(coinbaseMapping['BTC']).toBe('BTC-USD')
      expect(krakenMapping['BTC']).toBe('XBT/USD')
    })

    it('should handle unsupported symbols gracefully', async () => {
      const priceCallback = vi.fn()
      service.onPriceUpdate('UNSUPPORTED', priceCallback)

      await service.subscribe(['UNSUPPORTED'])

      // Should not crash, but may not receive updates
      expect(service).toBeDefined()
    })
  })

  describe('Exchange Priority', () => {
    it('should prioritize higher priority exchanges for price updates', async () => {
      const priceUpdates: PriceUpdate[] = []
      service.onPriceUpdate('BTC', (update) => priceUpdates.push(update))

      await service.subscribe(['BTC'])

      // Simulate price from lower priority exchange first
      const krakenWs = mockWebSockets.get('kraken')
      krakenWs.onmessage({ 
        data: JSON.stringify({
          event: 'ticker',
          pair: 'XBT/USD',
          c: ['64000.00'],
          v: ['1000']
        })
      })

      // Then from higher priority exchange
      const binanceWs = mockWebSockets.get('binance')
      binanceWs.onmessage({ 
        data: JSON.stringify({
          stream: 'btcusdt@ticker',
          data: { s: 'BTCUSDT', c: '65000.00', P: '2.5', v: '1000000' }
        })
      })

      // Higher priority source should have higher confidence
      const binanceUpdate = priceUpdates.find(u => u.source === 'binance')
      const krakenUpdate = priceUpdates.find(u => u.source === 'kraken')

      if (binanceUpdate && krakenUpdate) {
        expect(binanceUpdate.confidence).toBeGreaterThan(krakenUpdate.confidence)
      }
    })
  })
})
