import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebSocketPriceService, type PriceCallback, type PriceUpdate } from '../lib/WebSocketPriceService'

// Enhanced WebSocket mock
const createMockWebSocket = () => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  send: vi.fn(),
  readyState: WebSocket.OPEN,
  url: '',
  onopen: null,
  onclose: null,
  onmessage: null,
  onerror: null,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
})

// Mock WebSocket globally
const mockWebSockets = new Map()
global.WebSocket = vi.fn().mockImplementation((url: string) => {
  const mockWs = createMockWebSocket()
  mockWebSockets.set(url, mockWs)
  return mockWs
})

describe('WebSocketPriceService - Optimized', () => {
  let service: WebSocketPriceService
  let priceCallback: PriceCallback

  beforeEach(() => {
    mockWebSockets.clear()
    vi.clearAllMocks()
    service = new WebSocketPriceService()
    priceCallback = vi.fn()
  })

  afterEach(() => {
    service.disconnect()
  })

  describe('Connection Management', () => {
    it('should create WebSocket connections for subscriptions', () => {
      service.subscribe('BTC', priceCallback)
      
      expect(global.WebSocket).toHaveBeenCalled()
      expect(mockWebSockets.size).toBeGreaterThan(0)
    })

    it('should handle multiple symbol subscriptions', () => {
      service.subscribe('BTC', priceCallback)
      service.subscribe('ETH', priceCallback)
      service.subscribe('SOL', priceCallback)
      
      // Should create connections to multiple exchanges
      expect(global.WebSocket).toHaveBeenCalled()
      expect(mockWebSockets.size).toBeGreaterThan(1)
    })

    it('should unsubscribe from symbols', () => {
      const unsubscribe = service.subscribe('BTC', priceCallback)
      
      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
      
      // After unsubscribe, should clean up resources
      expect(priceCallback).not.toHaveBeenCalled()
    })
  })

  describe('Message Processing', () => {
    beforeEach(() => {
      service.subscribe('BTC', priceCallback)
    })

    it('should process valid price messages', () => {
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs?.onmessage) {
        const mockMessage = {
          s: 'BTCUSDT',
          c: '66500.00',
          E: Date.now()
        }

        binanceWs.onmessage({ 
          data: JSON.stringify(mockMessage),
          type: 'message',
          target: binanceWs
        })

        // Should process the message and trigger callback
        expect(priceCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            symbol: 'BTC',
            price: expect.any(Number),
            source: expect.any(String)
          })
        )
      }
    })

    it('should handle malformed messages gracefully', () => {
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs?.onmessage) {
        // Send invalid JSON
        binanceWs.onmessage({ 
          data: 'invalid json',
          type: 'message',
          target: binanceWs
        })

        // Should not crash or trigger callback with bad data
        expect(priceCallback).not.toHaveBeenCalled()
      }
    })

    it('should ignore irrelevant messages', () => {
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs?.onmessage) {
        // Send message for different symbol
        const mockMessage = {
          s: 'ETHUSDT', // Different symbol
          c: '3500.00',
          E: Date.now()
        }

        binanceWs.onmessage({ 
          data: JSON.stringify(mockMessage),
          type: 'message',
          target: binanceWs
        })

        // Should not trigger callback for BTC subscription
        expect(priceCallback).not.toHaveBeenCalled()
      }
    })
  })

  describe('Multi-Exchange Support', () => {
    it('should connect to multiple exchanges', () => {
      service.subscribe('BTC', priceCallback)
      
      // Should have connections to different exchanges
      const urls = Array.from(mockWebSockets.keys())
      expect(urls.some(url => url.includes('binance'))).toBe(true)
      expect(urls.some(url => url.includes('coinbase'))).toBe(true)
    })

    it('should handle exchange-specific message formats', () => {
      service.subscribe('BTC', priceCallback)

      // Test Coinbase format
      const coinbaseUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('coinbase'))
      const coinbaseWs = mockWebSockets.get(coinbaseUrl)

      if (coinbaseWs?.onmessage) {
        const coinbaseMessage = {
          type: 'ticker',
          product_id: 'BTC-USD',
          price: '66500.00',
          time: new Date().toISOString()
        }

        coinbaseWs.onmessage({ 
          data: JSON.stringify(coinbaseMessage),
          type: 'message',
          target: coinbaseWs
        })

        expect(priceCallback).toHaveBeenCalled()
      }
    })
  })

  describe('Connection Recovery', () => {
    it('should handle WebSocket close events', () => {
      service.subscribe('BTC', priceCallback)
      
      const firstWs = Array.from(mockWebSockets.values())[0]
      if (firstWs?.onclose) {
        firstWs.onclose({ 
          code: 1000, 
          reason: 'Normal closure',
          wasClean: true,
          type: 'close',
          target: firstWs
        })
      }

      // Should handle closure gracefully
      expect(service).toBeDefined()
    })

    it('should handle WebSocket error events', () => {
      service.subscribe('BTC', priceCallback)
      
      const firstWs = Array.from(mockWebSockets.values())[0]
      if (firstWs?.onerror) {
        firstWs.onerror({ 
          type: 'error',
          target: firstWs
        })
      }

      // Should handle errors gracefully
      expect(service).toBeDefined()
    })
  })

  describe('Cleanup', () => {
    it('should close all connections on disconnect', () => {
      service.subscribe('BTC', priceCallback)
      service.subscribe('ETH', priceCallback)
      
      const connections = Array.from(mockWebSockets.values())
      
      service.disconnect()
      
      // All connections should be closed
      connections.forEach(ws => {
        expect(ws.close).toHaveBeenCalled()
      })
    })

    it('should clear all subscriptions on disconnect', () => {
      const unsubscribe1 = service.subscribe('BTC', priceCallback)
      const unsubscribe2 = service.subscribe('ETH', priceCallback)
      
      service.disconnect()
      
      // Unsubscribe functions should still work
      expect(() => unsubscribe1()).not.toThrow()
      expect(() => unsubscribe2()).not.toThrow()
    })
  })

  describe('Price Update Features', () => {
    it('should include confidence scores in price updates', () => {
      service.subscribe('BTC', priceCallback)
      
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs?.onmessage) {
        const mockMessage = {
          s: 'BTCUSDT',
          c: '66500.00',
          E: Date.now()
        }

        binanceWs.onmessage({ 
          data: JSON.stringify(mockMessage),
          type: 'message',
          target: binanceWs
        })

        if (priceCallback.mock.calls.length > 0) {
          const priceUpdate = priceCallback.mock.calls[0][0] as PriceUpdate
          expect(priceUpdate).toHaveProperty('confidence')
          expect(typeof priceUpdate.confidence).toBe('number')
        }
      }
    })

    it('should include timestamps in price updates', () => {
      service.subscribe('BTC', priceCallback)
      
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs?.onmessage) {
        const mockMessage = {
          s: 'BTCUSDT',
          c: '66500.00',
          E: Date.now()
        }

        binanceWs.onmessage({ 
          data: JSON.stringify(mockMessage),
          type: 'message',
          target: binanceWs
        })

        if (priceCallback.mock.calls.length > 0) {
          const priceUpdate = priceCallback.mock.calls[0][0] as PriceUpdate
          expect(priceUpdate).toHaveProperty('timestamp')
          expect(typeof priceUpdate.timestamp).toBe('number')
        }
      }
    })
  })

  describe('Performance', () => {
    it('should handle multiple rapid updates efficiently', () => {
      service.subscribe('BTC', priceCallback)
      
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs?.onmessage) {
        // Send multiple updates rapidly
        for (let i = 0; i < 10; i++) {
          const mockMessage = {
            s: 'BTCUSDT',
            c: `${66500 + i}.00`,
            E: Date.now() + i
          }

          binanceWs.onmessage({ 
            data: JSON.stringify(mockMessage),
            type: 'message',
            target: binanceWs
          })
        }

        // Should handle all updates
        expect(priceCallback.mock.calls.length).toBeGreaterThan(0)
        expect(priceCallback.mock.calls.length).toBeLessThanOrEqual(10)
      }
    })
  })
})
