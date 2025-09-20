import { vi } from 'vitest'
import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'

// Mock data generators
export const mockPriceData = (symbol: string, price?: number) => ({
  symbol,
  price: price || Math.random() * 50000 + 10000,
  change24h: (Math.random() - 0.5) * 10,
  volume: Math.random() * 1000000,
  timestamp: Date.now()
})

export const mockStopLossOrder = (overrides = {}) => ({
  id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  positionId: 'pos_1',
  user: 'test_user',
  market: 'BTC',
  triggerPrice: 64000,
  currentPrice: 66500,
  closePercentage: 50,
  isLong: true,
  status: 'active' as const,
  createdAt: Date.now(),
  distanceToTrigger: 0,
  estimatedLoss: 0,
  ...overrides
})

export const mockPosition = (overrides = {}) => ({
  id: 'pos_1',
  user: 'test_user',
  market: 'BTC',
  size: 1.5,
  entryPrice: 65000,
  currentPrice: 66500,
  unrealizedPnl: 2250,
  margin: 10000,
  leverage: 10,
  isLong: true,
  liquidationPrice: 58500,
  timestamp: Date.now(),
  ...overrides
})

// WebSocket mock utilities
export const createMockWebSocket = () => {
  const mockWs = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    send: vi.fn(),
    readyState: 1, // OPEN
    url: '',
    onopen: null,
    onclose: null,
    onmessage: null,
    onerror: null
  }

  // Helper to simulate WebSocket events
  const simulateEvent = (type: string, data?: any) => {
    const listeners = mockWs.addEventListener.mock.calls
      .filter(([eventType]) => eventType === type)
      .map(([, handler]) => handler)

    listeners.forEach((handler) => {
      if (type === 'message') {
        handler({ data: JSON.stringify(data) })
      } else {
        handler(data || {})
      }
    })
  }

  return { mockWs, simulateEvent }
}

// Fetch mock utilities
export const mockFetchResponse = (data: any, ok = true, status = 200) => {
  const mockResponse = {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data))
  }

  ;(global.fetch as any).mockResolvedValueOnce(mockResponse)
  return mockResponse
}

// Custom render with providers if needed
export const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, options)

// Time utilities for testing
export const advanceTime = async (ms: number) => {
  vi.advanceTimersByTime(ms)
  await vi.runAllTimersAsync()
}

// Wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0))
