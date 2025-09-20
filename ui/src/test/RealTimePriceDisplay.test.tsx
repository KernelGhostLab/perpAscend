import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RealTimePriceDisplay, RealTimeStatsGrid } from '../components/RealTimePriceDisplay'
import { mockPriceData } from './utils'

// Mock the hooks
vi.mock('../hooks/useEnhancedRealTimePrices', () => ({
  default: vi.fn()
}))

vi.mock('../lib/realTimeDataService', () => ({
  useRealTimePrices: vi.fn()
}))

import useEnhancedRealTimePrices from '../hooks/useEnhancedRealTimePrices'
import { useRealTimePrices } from '../lib/realTimeDataService'

const mockUseEnhancedRealTimePrices = useEnhancedRealTimePrices as any
const mockUseRealTimePrices = useRealTimePrices as any

describe('RealTimePriceDisplay', () => {
  const mockSymbols = ['BTC', 'ETH', 'SOL']
  
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('should display loading shimmer when data is loading', () => {
      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: true,
        error: null,
        isWebSocketActive: false
      })

      mockUseRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: true,
        error: null
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} />)

      // Should show loading shimmer for each symbol
      const shimmerElements = document.querySelectorAll('.shimmer')
      expect(shimmerElements).toHaveLength(mockSymbols.length)
    })
  })

  describe('Error State', () => {
    it('should display error message when data fetch fails', () => {
      const errorMessage = 'Failed to fetch price data'
      
      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: false,
        error: errorMessage,
        isWebSocketActive: false
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} />)

      expect(screen.getByText('Price Feed Error')).toBeInTheDocument()
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument()
    })

    it('should reload page when retry button is clicked', () => {
      const mockReload = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true
      })

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: false,
        error: 'Connection failed',
        isWebSocketActive: false
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} />)

      const retryButton = screen.getByRole('button', { name: /retry connection/i })
      fireEvent.click(retryButton)

      expect(mockReload).toHaveBeenCalled()
    })
  })

  describe('Successful Data Display', () => {
    const mockPrices = {
      BTC: mockPriceData('BTC', 65000),
      ETH: mockPriceData('ETH', 3500),
      SOL: mockPriceData('SOL', 150)
    }

    beforeEach(() => {
      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: mockPrices,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })
    })

    it('should display price cards for each symbol', () => {
      render(<RealTimePriceDisplay symbols={mockSymbols} />)

      mockSymbols.forEach((symbol) => {
        expect(screen.getByText(symbol)).toBeInTheDocument()
      })
    })

    it('should display formatted prices correctly', () => {
      render(<RealTimePriceDisplay symbols={mockSymbols} />)

      expect(screen.getByText('$65,000.00')).toBeInTheDocument()
      expect(screen.getByText('$3,500.00')).toBeInTheDocument()
      expect(screen.getByText('$150.00')).toBeInTheDocument()
    })

    it('should show positive changes in green and negative in red', () => {
      const pricesWithMixedChanges = {
        BTC: { ...mockPriceData('BTC', 65000), change24h: 5.2 },
        ETH: { ...mockPriceData('ETH', 3500), change24h: -2.1 }
      }

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: pricesWithMixedChanges,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['BTC', 'ETH']} />)

      const positiveChange = screen.getByText('+5.20%')
      const negativeChange = screen.getByText('-2.10%')

      expect(positiveChange).toHaveClass('price-positive')
      expect(negativeChange).toHaveClass('price-negative')
    })

    it('should display volume when available', () => {
      const pricesWithVolume = {
        BTC: { ...mockPriceData('BTC', 65000), volume24h: 1500000000 }
      }

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: pricesWithVolume,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['BTC']} />)

      expect(screen.getByText(/Vol: 1500M/)).toBeInTheDocument()
    })

    it('should display formatted timestamps', () => {
      const fixedTime = 1634567890000 // Fixed timestamp for testing
      const pricesWithTimestamp = {
        BTC: { ...mockPriceData('BTC', 65000), timestamp: fixedTime }
      }

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: pricesWithTimestamp,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['BTC']} />)

      const timeString = new Date(fixedTime).toLocaleTimeString()
      expect(screen.getByText(timeString)).toBeInTheDocument()
    })
  })

  describe('WebSocket Status Indicator', () => {
    it('should show live data stream indicator when WebSocket is active', () => {
      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} method="hybrid" />)

      expect(screen.getByText('Live Data Stream')).toBeInTheDocument()
      expect(document.querySelector('.status-connected')).toBeInTheDocument()
    })

    it('should show fallback mode indicator when WebSocket is inactive', () => {
      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: false,
        error: null,
        isWebSocketActive: false
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} method="hybrid" />)

      expect(screen.getByText('Fallback Mode')).toBeInTheDocument()
      expect(document.querySelector('.status-warning')).toBeInTheDocument()
    })

    it('should not show status indicator for coingecko-only method', () => {
      mockUseRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: false,
        error: null
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} method="coingecko" />)

      expect(screen.queryByText('Live Data Stream')).not.toBeInTheDocument()
      expect(screen.queryByText('Fallback Mode')).not.toBeInTheDocument()
    })
  })

  describe('Method Switching', () => {
    it('should use enhanced hook for websocket method', () => {
      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} method="websocket" />)

      expect(mockUseEnhancedRealTimePrices).toHaveBeenCalledWith(
        mockSymbols,
        expect.objectContaining({
          method: 'websocket',
          fallbackEnabled: true,
          updateInterval: 30000
        })
      )
    })

    it('should use legacy hook for coingecko method', () => {
      mockUseRealTimePrices.mockReturnValue({
        prices: {},
        isLoading: false,
        error: null
      })

      render(<RealTimePriceDisplay symbols={mockSymbols} method="coingecko" />)

      expect(mockUseRealTimePrices).toHaveBeenCalledWith(mockSymbols, 'coingecko')
    })
  })

  describe('Missing Data Handling', () => {
    it('should show loading state for symbols without price data', () => {
      const partialPrices = {
        BTC: mockPriceData('BTC', 65000)
        // Missing ETH and SOL
      }

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: partialPrices,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['BTC', 'ETH', 'SOL']} />)

      expect(screen.getByText('$65,000.00')).toBeInTheDocument()
      expect(screen.getAllByText('Loading...')).toHaveLength(2) // ETH and SOL
    })

    it('should handle alternative symbol formats', () => {
      const pricesWithSlashFormat = {
        'BTC/USD': mockPriceData('BTC', 65000)
      }

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: pricesWithSlashFormat,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['BTC']} />)

      expect(screen.getByText('$65,000.00')).toBeInTheDocument()
    })
  })

  describe('Responsive Design', () => {
    it('should apply appropriate grid classes for responsive layout', () => {
      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices: { BTC: mockPriceData('BTC', 65000) },
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['BTC']} />)

      const grid = document.querySelector('.grid')
      expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3')
    })
  })

  describe('Price Formatting', () => {
    it('should format high-value prices with 2 decimal places', () => {
      const prices = {
        BTC: mockPriceData('BTC', 65000.123)
      }

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['BTC']} />)

      expect(screen.getByText('$65,000.12')).toBeInTheDocument()
    })

    it('should format low-value prices with up to 4 decimal places', () => {
      const prices = {
        LOWCAP: mockPriceData('LOWCAP', 0.12345)
      }

      mockUseEnhancedRealTimePrices.mockReturnValue({
        prices,
        isLoading: false,
        error: null,
        isWebSocketActive: true
      })

      render(<RealTimePriceDisplay symbols={['LOWCAP']} />)

      expect(screen.getByText('$0.1235')).toBeInTheDocument()
    })
  })
})

describe('RealTimeStatsGrid', () => {
  beforeEach(() => {
    mockUseRealTimePrices.mockReturnValue({
      prices: {
        'SOL/USD': mockPriceData('SOL', 50),
        'BTC/USD': mockPriceData('BTC', 45000),
        'ETH/USD': mockPriceData('ETH', 3000)
      },
      isLoading: false,
      error: null
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render all stat cards', () => {
    render(<RealTimeStatsGrid />)

    expect(screen.getByText('Portfolio Value')).toBeInTheDocument()
    expect(screen.getByText('24h P&L')).toBeInTheDocument()
    expect(screen.getByText('Active Positions')).toBeInTheDocument()
    expect(screen.getByText('Stop Loss Orders')).toBeInTheDocument()
  })

  it('should show live indicator when using real data', () => {
    render(<RealTimeStatsGrid useRealData={true} />)

    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('should calculate portfolio values correctly', () => {
    render(<RealTimeStatsGrid useRealData={true} />)

    // With SOL at $50 * 1000 + BTC at $45000 * 0.5 = $72500
    expect(screen.getByText('$72,500')).toBeInTheDocument()
  })

  it('should display positive P&L in green', () => {
    render(<RealTimeStatsGrid useRealData={true} />)

    const pnlElement = screen.getByText(/\+5,000/) // (50-45) * 1000
    expect(pnlElement.closest('p')).toHaveClass('text-green-600')
  })

  it('should display negative P&L in red', () => {
    mockUseRealTimePrices.mockReturnValue({
      prices: {
        'SOL/USD': mockPriceData('SOL', 40), // Lower than mock entry of 45
        'BTC/USD': mockPriceData('BTC', 45000)
      },
      isLoading: false,
      error: null
    })

    render(<RealTimeStatsGrid useRealData={true} />)

    const pnlElement = screen.getByText(/-5,000/) // (40-45) * 1000
    expect(pnlElement.closest('p')).toHaveClass('text-red-600')
  })

  it('should show static values when not using real data', () => {
    render(<RealTimeStatsGrid useRealData={false} />)

    expect(screen.getByText('$125,000')).toBeInTheDocument()
    expect(screen.getByText(/\+12,450/)).toBeInTheDocument()
  })

  it('should display correct number of positions and orders', () => {
    render(<RealTimeStatsGrid />)

    // Check static values
    expect(screen.getByText('7')).toBeInTheDocument() // Active Positions
    expect(screen.getByText('3')).toBeInTheDocument() // Stop Loss Orders
  })
})
