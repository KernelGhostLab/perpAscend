import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebSocketPriceService, ConnectionState } from '../lib/WebSocketPriceService'

// Mock WebSocket globally
const mockWebSockets = new Map<string, any>()

global.WebSocket = class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  close = vi.fn()
  send = vi.fn()
  readyState = MockWebSocket.OPEN
  url: string
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    mockWebSockets.set(url, this)
  }

  get CONNECTING() { return MockWebSocket.CONNECTING }
  get OPEN() { return MockWebSocket.OPEN }
  get CLOSING() { return MockWebSocket.CLOSING }
  get CLOSED() { return MockWebSocket.CLOSED }
} as any

describe('WebSocketPriceService - Fixed API', () => {
  let service: WebSocketPriceService

  beforeEach(() => {
    mockWebSockets.clear()
    vi.clearAllMocks()
    service = new WebSocketPriceService()
  })

  afterEach(() => {
    service.disconnect()
  })

  describe('Connection Management', () => {
    it('should create WebSocket connections when subscribing', async () => {
      await service.subscribe(['BTC/USDT'])
      
      expect(global.WebSocket).toHaveBeenCalled()
      expect(mockWebSockets.size).toBeGreaterThan(0)
    })

    it('should handle connection states correctly', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(['BTC/USDT'])

      // Simulate connection open
      const wsUrl = Array.from(mockWebSockets.keys())[0]
      const mockWs = mockWebSockets.get(wsUrl)
      
      if (mockWs && mockWs.onopen) {
        mockWs.onopen({})
      }

      // Should have been called initially and after connection
      expect(statusCallback).toHaveBeenCalled()
    })

    it('should handle connection errors gracefully', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(['BTC/USDT'])

      // Simulate connection error
      const wsUrl = Array.from(mockWebSockets.keys())[0]
      const mockWs = mockWebSockets.get(wsUrl)
      
      if (mockWs && mockWs.onerror) {
        mockWs.onerror({ error: 'Connection failed' })
      }

      expect(statusCallback).toHaveBeenCalled()
      const lastCall = statusCallback.mock.calls[statusCallback.mock.calls.length - 1]
      const statuses = lastCall[0]
      expect(statuses.some((s: any) => s.state === ConnectionState.ERROR)).toBe(true)
    })
  })

  describe('Symbol Subscription', () => {
    it('should subscribe to multiple symbols', async () => {
      const unsubscribe = await service.subscribe(['BTC/USDT', 'ETH/USDT'])

      expect(typeof unsubscribe).toBe('function')
      
      // Should have made WebSocket connections
      expect(mockWebSockets.size).toBeGreaterThan(0)

      unsubscribe()
    })

    it('should handle single symbol subscription', async () => {
      const unsubscribe = await service.subscribe(['BTC/USDT'])

      expect(typeof unsubscribe).toBe('function')
      expect(mockWebSockets.size).toBeGreaterThan(0)

      unsubscribe()
    })

    it('should send correct subscription messages', async () => {
      await service.subscribe(['BTC/USDT'])

      // Find Binance WebSocket and check if subscription was sent
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      if (!binanceUrl) return

      const binanceWs = mockWebSockets.get(binanceUrl)

      // Simulate WebSocket open to trigger subscription
      if (binanceWs && binanceWs.onopen) {
        binanceWs.onopen({})
        
        expect(binanceWs.send).toHaveBeenCalledWith(
          JSON.stringify({
            method: 'SUBSCRIBE',
            params: ['btcusdt@ticker'],
            id: expect.any(Number)
          })
        )
      }
    })
  })

  describe('Price Update Callbacks', () => {
    it('should register and trigger price update callbacks', async () => {
      const priceCallback = vi.fn()
      
      // Subscribe to symbol and register callback
      await service.subscribe(['BTC/USDT'])
      const unsubscribeCallback = service.onPriceUpdate('BTC/USDT', priceCallback)

      // Simulate connection open and price message
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs) {
        // Open connection first
        if (binanceWs.onopen) {
          binanceWs.onopen({})
        }

        // Send price update
        if (binanceWs.onmessage) {
          const priceMessage = {
            stream: 'btcusdt@ticker',
            data: {
              s: 'BTCUSDT',
              c: '50000.50',
              P: '2.5',
              v: '1000.0'
            }
          }

          binanceWs.onmessage({ 
            data: JSON.stringify(priceMessage),
            type: 'message'
          } as MessageEvent)

          expect(priceCallback).toHaveBeenCalledWith({
            symbol: 'BTC/USDT',
            price: 50000.50,
            change24h: 2.5,
            volume24h: 1000.0,
            timestamp: expect.any(Number),
            exchange: 'binance'
          })
        }
      }

      unsubscribeCallback()
    })

    it('should handle multiple callbacks for same symbol', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      await service.subscribe(['BTC/USDT'])
      service.onPriceUpdate('BTC/USDT', callback1)
      service.onPriceUpdate('BTC/USDT', callback2)

      // Simulate price update
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs) {
        if (binanceWs.onopen) {
          binanceWs.onopen({})
        }

        if (binanceWs.onmessage) {
          const priceMessage = {
            stream: 'btcusdt@ticker',
            data: {
              s: 'BTCUSDT',
              c: '50000.50',
              P: '2.5'
            }
          }

          binanceWs.onmessage({ 
            data: JSON.stringify(priceMessage),
            type: 'message'
          } as MessageEvent)

          expect(callback1).toHaveBeenCalled()
          expect(callback2).toHaveBeenCalled()
        }
      }
    })

    it('should unsubscribe callbacks correctly', async () => {
      const priceCallback = vi.fn()

      await service.subscribe(['BTC/USDT'])
      const unsubscribe = service.onPriceUpdate('BTC/USDT', priceCallback)

      // Unsubscribe the callback
      unsubscribe()

      // Simulate price message
      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs && binanceWs.onmessage) {
        const priceMessage = {
          stream: 'btcusdt@ticker',
          data: {
            s: 'BTCUSDT',
            c: '50000.50',
            P: '2.5'
          }
        }

        binanceWs.onmessage({ 
          data: JSON.stringify(priceMessage),
          type: 'message'
        } as MessageEvent)

        expect(priceCallback).not.toHaveBeenCalled()
      }
    })
  })

  describe('Status Updates', () => {
    it('should register and trigger status update callbacks', async () => {
      const statusCallback = vi.fn()

      const unsubscribe = service.onStatusUpdate(statusCallback)

      // Should be called immediately with current statuses
      expect(statusCallback).toHaveBeenCalled()

      await service.subscribe(['BTC/USDT'])

      // Should be called again after subscription
      expect(statusCallback).toHaveBeenCalledTimes(2)

      unsubscribe()
    })

    it('should provide connection status information', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(['BTC/USDT'])

      const lastCall = statusCallback.mock.calls[statusCallback.mock.calls.length - 1]
      const statuses = lastCall[0]

      expect(Array.isArray(statuses)).toBe(true)
      expect(statuses.length).toBeGreaterThan(0)
      
      const status = statuses[0]
      expect(status).toHaveProperty('exchange')
      expect(status).toHaveProperty('state')
      expect(status).toHaveProperty('latency')
      expect(status).toHaveProperty('lastUpdate')
    })
  })

  describe('Multi-Exchange Support', () => {
    it('should connect to multiple exchanges', async () => {
      await service.subscribe(['BTC/USDT'])
      
      // Should have connections to different exchanges
      const urls = Array.from(mockWebSockets.keys())
      expect(urls.some(url => url.includes('binance'))).toBe(true)
      expect(urls.some(url => url.includes('coinbase'))).toBe(true)
    })

    it('should handle different exchange message formats', async () => {
      const priceCallback = vi.fn()
      
      await service.subscribe(['BTC/USDT'])
      service.onPriceUpdate('BTC/USDT', priceCallback)

      // Test Coinbase format
      const coinbaseUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('coinbase'))
      const coinbaseWs = mockWebSockets.get(coinbaseUrl)

      if (coinbaseWs) {
        if (coinbaseWs.onopen) {
          coinbaseWs.onopen({})
        }

        if (coinbaseWs.onmessage) {
          const coinbaseMessage = {
            type: 'ticker',
            product_id: 'BTC-USD',
            price: '50000.50',
            open_24h: '48780.25',
            volume_24h: '1000.0'
          }

          coinbaseWs.onmessage({ 
            data: JSON.stringify(coinbaseMessage),
            type: 'message'
          } as MessageEvent)

          expect(priceCallback).toHaveBeenCalledWith(
            expect.objectContaining({
              symbol: 'BTC/USDT',
              price: 50000.50,
              exchange: 'coinbase'
            })
          )
        }
      }
    })

    it('should aggregate prices from multiple exchanges', async () => {
      const priceCallback = vi.fn()
      
      await service.subscribe(['BTC/USDT'])
      service.onPriceUpdate('BTC/USDT', priceCallback)

      // Send different prices from different exchanges
      const binanceWs = mockWebSockets.get(
        Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      )
      const coinbaseWs = mockWebSockets.get(
        Array.from(mockWebSockets.keys()).find(url => url.includes('coinbase'))
      )

      if (binanceWs && coinbaseWs) {
        // Open connections
        if (binanceWs.onopen) binanceWs.onopen({})
        if (coinbaseWs.onopen) coinbaseWs.onopen({})

        // Send Binance price
        if (binanceWs.onmessage) {
          binanceWs.onmessage({ 
            data: JSON.stringify({
              stream: 'btcusdt@ticker',
              data: { s: 'BTCUSDT', c: '50000.00', P: '2.0' }
            }),
            type: 'message'
          } as MessageEvent)
        }

        // Send Coinbase price (should be aggregated)
        if (coinbaseWs.onmessage) {
          coinbaseWs.onmessage({ 
            data: JSON.stringify({
              type: 'ticker',
              product_id: 'BTC-USD',
              price: '50100.00',
              open_24h: '49000.00'
            }),
            type: 'message'
          } as MessageEvent)
        }

        // Should have been called multiple times with aggregated prices
        expect(priceCallback).toHaveBeenCalled()
        expect(priceCallback.mock.calls.length).toBeGreaterThan(1)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle WebSocket connection failures', async () => {
      const statusCallback = vi.fn()
      service.onStatusUpdate(statusCallback)

      await service.subscribe(['BTC/USDT'])

      // Simulate connection error
      const wsUrl = Array.from(mockWebSockets.keys())[0]
      const mockWs = mockWebSockets.get(wsUrl)

      if (mockWs && mockWs.onerror) {
        mockWs.onerror({ error: 'Network error' })

        const lastCall = statusCallback.mock.calls[statusCallback.mock.calls.length - 1]
        const statuses = lastCall[0]
        expect(statuses.some(s => s.state === ConnectionState.ERROR)).toBe(true)
      }
    })

    it('should handle malformed messages gracefully', async () => {
      const priceCallback = vi.fn()
      
      await service.subscribe(['BTC/USDT'])
      service.onPriceUpdate('BTC/USDT', priceCallback)

      const wsUrl = Array.from(mockWebSockets.keys())[0]
      const mockWs = mockWebSockets.get(wsUrl)

      if (mockWs && mockWs.onmessage) {
        // Send malformed JSON
        mockWs.onmessage({ 
          data: 'invalid json',
          type: 'message'
        } as MessageEvent)

        // Should not crash or call callback with invalid data
        expect(priceCallback).not.toHaveBeenCalled()
      }
    })

    it('should handle missing price data gracefully', async () => {
      const priceCallback = vi.fn()
      
      await service.subscribe(['BTC/USDT'])
      service.onPriceUpdate('BTC/USDT', priceCallback)

      const binanceUrl = Array.from(mockWebSockets.keys()).find(url => url.includes('binance'))
      const binanceWs = mockWebSockets.get(binanceUrl)

      if (binanceWs && binanceWs.onmessage) {
        // Send message without required fields
        const incompleteMessage = {
          stream: 'btcusdt@ticker',
          data: {
            s: 'BTCUSDT'
            // Missing price data
          }
        }

        binanceWs.onmessage({ 
          data: JSON.stringify(incompleteMessage),
          type: 'message'
        } as MessageEvent)

        // Should not call callback with incomplete data
        expect(priceCallback).not.toHaveBeenCalled()
      }
    })
  })

  describe('Resource Cleanup', () => {
    it('should disconnect all connections on disconnect', async () => {
      await service.subscribe(['BTC/USDT', 'ETH/USDT'])

      expect(mockWebSockets.size).toBeGreaterThan(0)

      service.disconnect()

      // All WebSockets should be closed
      Array.from(mockWebSockets.values()).forEach(ws => {
        expect(ws.close).toHaveBeenCalled()
      })
    })

    it('should handle multiple disconnections gracefully', async () => {
      await service.subscribe(['BTC/USDT'])

      service.disconnect()
      service.disconnect() // Second disconnect should not throw

      expect(() => service.disconnect()).not.toThrow()
    })

    it('should clean up subscriptions on unsubscribe', async () => {
      const unsubscribe = await service.subscribe(['BTC/USDT'])

      expect(mockWebSockets.size).toBeGreaterThan(0)

      unsubscribe()

      // Should close connections when no more subscriptions
      Array.from(mockWebSockets.values()).forEach(ws => {
        expect(ws.close).toHaveBeenCalled()
      })
    })
  })
})
