import { describe, it, expect, beforeEach } from 'vitest'
import { mockProtocol } from '../lib/mockProtocol'

describe('MockProtocol', () => {
  beforeEach(() => {
    // Reset protocol state before each test
    // Clear all positions
    mockProtocol.getPositions().forEach(position => {
      mockProtocol.closePosition(position.id)
    })
    
    // Clear stop loss orders
    mockProtocol.getStopLossOrders().forEach(order => {
      if (order.status === 'active') {
        mockProtocol.cancelStopLossOrder(order.id)
      }
    })
    
    // Reset market prices to default
    mockProtocol.updateOraclePrice('BTC', 60000)
    mockProtocol.updateOraclePrice('ETH', 3000)
    mockProtocol.updateOraclePrice('SOL', 100)
  })

  describe('Market Management', () => {
    it('should have default markets', () => {
      const markets = mockProtocol.getMarkets()
      expect(markets).toHaveLength(3)
      
      const symbols = markets.map((market: any) => market.symbol)
      expect(symbols).toContain('BTC')
      expect(symbols).toContain('ETH')
      expect(symbols).toContain('SOL')
    })

    it('should get specific market by symbol', () => {
      const btcMarket = mockProtocol.getMarket('BTC')
      expect(btcMarket).toBeDefined()
      expect(btcMarket?.symbol).toBe('BTC')
      
      const invalidMarket = mockProtocol.getMarket('INVALID')
      expect(invalidMarket).toBeUndefined()
    })

    it('should update oracle prices', () => {
      const initialBtcMarket = mockProtocol.getMarket('BTC')
      const initialPrice = initialBtcMarket?.oraclePrice

      mockProtocol.updateOraclePrice('BTC', 65000)
      
      const updatedBtcMarket = mockProtocol.getMarket('BTC')
      expect(updatedBtcMarket?.oraclePrice).not.toBe(initialPrice)
    })
  })

  describe('Position Management', () => {
    const validPositionParams = {
      user: 'test_user',
      symbol: 'BTC',
      isLong: true,
      quoteAmount: 10000,
      leverage: 2
    }

    it('should open a position successfully', () => {
      const position = mockProtocol.openPosition(validPositionParams)
      
      expect(position).toBeDefined()
      expect(position.id).toBeDefined()
      expect(position.user).toBe('test_user')
      expect(position.market).toBe('BTC')
      expect(position.isLong).toBe(true)
    })

    it('should throw error for invalid market', () => {
      expect(() => {
        mockProtocol.openPosition({
          ...validPositionParams,
          symbol: 'INVALID'
        })
      }).toThrow('Market not found')
    })

    it('should throw error for excessive leverage', () => {
      expect(() => {
        mockProtocol.openPosition({
          ...validPositionParams,
          leverage: 1000
        })
      }).toThrow('Leverage too high')
    })

    it('should get all positions', () => {
      mockProtocol.openPosition(validPositionParams)
      mockProtocol.openPosition({
        ...validPositionParams,
        user: 'another_user'
      })
      
      const allPositions = mockProtocol.getPositions()
      expect(allPositions).toHaveLength(2)
    })

    it('should get positions filtered by user', () => {
      mockProtocol.openPosition(validPositionParams)
      mockProtocol.openPosition({
        ...validPositionParams,
        user: 'another_user'
      })
      
      const userPositions = mockProtocol.getPositions('test_user')
      expect(userPositions).toHaveLength(1)
      expect(userPositions[0].user).toBe('test_user')
    })

    it('should close position successfully', () => {
      const position = mockProtocol.openPosition(validPositionParams)
      
      const result = mockProtocol.closePosition(position.id)
      
      expect(result).toHaveProperty('pnl')
      expect(result).toHaveProperty('fee')
      expect(result).toHaveProperty('settlement')
      
      // Position should be removed after closing
      const remainingPositions = mockProtocol.getPositions()
      expect(remainingPositions.find((p: any) => p.id === position.id)).toBeUndefined()
    })

    it('should throw error when closing non-existent position', () => {
      expect(() => {
        mockProtocol.closePosition('invalid_position_id')
      }).toThrow('Position not found')
    })

    it('should partially close position', () => {
      const position = mockProtocol.openPosition(validPositionParams)
      const originalSize = Math.abs(position.baseSize)
      
      const result = mockProtocol.partialClosePosition(position.id, 50) // Close 50%
      
      expect(result).toHaveProperty('pnl')
      expect(result).toHaveProperty('settlement')
      expect(result).toHaveProperty('remainingSize')
      expect(Math.abs(result.remainingSize)).toBeCloseTo(originalSize * 0.5, 6)
    })

    it('should throw error for invalid close percentage', () => {
      const position = mockProtocol.openPosition(validPositionParams)
      
      expect(() => {
        mockProtocol.partialClosePosition(position.id, 0)
      }).toThrow('Close percentage must be between 1-99%')
      
      expect(() => {
        mockProtocol.partialClosePosition(position.id, 150)
      }).toThrow('Close percentage must be between 1-99%')
    })
  })

  describe('Stop Loss Orders', () => {
    let positionId: string

    beforeEach(() => {
      const position = mockProtocol.openPosition({
        user: 'test_user',
        symbol: 'BTC',
        isLong: true,
        quoteAmount: 10000,
        leverage: 2
      })
      positionId = position.id
    })

    it('should create stop loss order successfully', () => {
      const btcMarket = mockProtocol.getMarket('BTC')
      const currentPrice = btcMarket?.markPrice || 0
      const triggerPrice = (currentPrice * 0.9) / 1e8 // Convert from fixed point and set 10% below
      
      const orderId = mockProtocol.createStopLossOrder({
        positionId,
        triggerPrice,
        closePercentage: 50
      })
      
      expect(orderId).toBeDefined()
      expect(typeof orderId).toBe('string')
      
      const orders = mockProtocol.getStopLossOrders()
      const order = orders.find((o: any) => o.id === orderId)
      expect(order).toBeDefined()
      expect(order?.status).toBe('active')
    })

    it('should modify stop loss order', () => {
      const btcMarket = mockProtocol.getMarket('BTC')
      const currentPrice = btcMarket?.markPrice || 0
      const originalTriggerPrice = (currentPrice * 0.9) / 1e8
      
      const orderId = mockProtocol.createStopLossOrder({
        positionId,
        triggerPrice: originalTriggerPrice,
        closePercentage: 50
      })
      
      const newTriggerPrice = (currentPrice * 0.85) / 1e8
      mockProtocol.modifyStopLossOrder(orderId, newTriggerPrice, 75)
      
      const orders = mockProtocol.getStopLossOrders()
      const order = orders.find((o: any) => o.id === orderId)
      expect(order?.triggerPrice).toBe(newTriggerPrice)
      expect(order?.closePercentage).toBe(75)
    })

    it('should cancel stop loss order', () => {
      const btcMarket = mockProtocol.getMarket('BTC')
      const currentPrice = btcMarket?.markPrice || 0
      const triggerPrice = (currentPrice * 0.9) / 1e8
      
      const orderId = mockProtocol.createStopLossOrder({
        positionId,
        triggerPrice,
        closePercentage: 50
      })
      
      mockProtocol.cancelStopLossOrder(orderId)
      
      const orders = mockProtocol.getStopLossOrders()
      const order = orders.find((o: any) => o.id === orderId)
      expect(order?.status).toBe('cancelled')
    })

    it('should throw error for non-existent position', () => {
      expect(() => {
        mockProtocol.createStopLossOrder({
          positionId: 'invalid_position_id',
          triggerPrice: 50000,
          closePercentage: 50
        })
      }).toThrow('Position not found')
    })

    it('should throw error when modifying non-existent order', () => {
      expect(() => {
        mockProtocol.modifyStopLossOrder('invalid_order_id', 50000, 50)
      }).toThrow('Stop loss order not found')
    })

    it('should throw error when cancelling non-existent order', () => {
      expect(() => {
        mockProtocol.cancelStopLossOrder('invalid_order_id')
      }).toThrow('Stop loss order not found')
    })
  })

  describe('Trading History', () => {
    it('should record trades when positions are opened and closed', () => {
      const initialTradeCount = mockProtocol.getTrades().length
      
      const position = mockProtocol.openPosition({
        user: 'test_user',
        symbol: 'BTC',
        isLong: true,
        quoteAmount: 10000,
        leverage: 2
      })
      
      // Should have recorded an open trade
      let trades = mockProtocol.getTrades()
      expect(trades.length).toBeGreaterThan(initialTradeCount)
      
      const openTrade = trades.find((trade: any) => trade.type === 'open' && trade.user === 'test_user')
      expect(openTrade).toBeDefined()
      
      // Close position
      mockProtocol.closePosition(position.id)
      
      // Should have recorded a close trade
      trades = mockProtocol.getTrades()
      const closeTrade = trades.find((trade: any) => trade.type === 'close' && trade.user === 'test_user')
      expect(closeTrade).toBeDefined()
    })

    it('should limit trades by specified amount', () => {
      // Create multiple trades
      for (let i = 0; i < 5; i++) {
        const position = mockProtocol.openPosition({
          user: `user_${i}`,
          symbol: 'BTC',
          isLong: true,
          quoteAmount: 5000,
          leverage: 2
        })
        mockProtocol.closePosition(position.id)
      }
      
      const limitedTrades = mockProtocol.getTrades(3)
      expect(limitedTrades).toHaveLength(3)
    })
  })

  describe('Protocol Statistics', () => {
    it('should calculate protocol stats correctly', () => {
      mockProtocol.openPosition({
        user: 'test_user',
        symbol: 'BTC',
        isLong: true,
        quoteAmount: 10000,
        leverage: 2
      })
      
      const stats = mockProtocol.getProtocolStats()
      
      expect(stats).toHaveProperty('totalTVL')
      expect(stats).toHaveProperty('totalVolume')
      expect(stats).toHaveProperty('openPositions')
      expect(stats).toHaveProperty('totalTrades')
      expect(stats).toHaveProperty('markets')
      
      expect(typeof stats.totalTVL).toBe('number')
      expect(typeof stats.openPositions).toBe('number')
      expect(stats.openPositions).toBeGreaterThan(0)
    })
  })

  describe('PnL Calculations', () => {
    it('should calculate positive PnL for profitable long position', () => {
      const position = mockProtocol.openPosition({
        user: 'test_user',
        symbol: 'BTC',
        isLong: true,
        quoteAmount: 10000,
        leverage: 2
      })
      
      // Increase price to make position profitable
      mockProtocol.updateOraclePrice('BTC', 70000)
      
      const updatedPositions = mockProtocol.getPositions('test_user')
      const updatedPosition = updatedPositions.find((p: any) => p.id === position.id)
      
      expect(updatedPosition?.pnl).toBeGreaterThan(0)
    })

    it('should calculate negative PnL for unprofitable long position', () => {
      const position = mockProtocol.openPosition({
        user: 'test_user',
        symbol: 'BTC',
        isLong: true,
        quoteAmount: 10000,
        leverage: 2
      })
      
      // Decrease price to make position unprofitable
      mockProtocol.updateOraclePrice('BTC', 50000)
      
      const updatedPositions = mockProtocol.getPositions('test_user')
      const updatedPosition = updatedPositions.find((p: any) => p.id === position.id)
      
      expect(updatedPosition?.pnl).toBeLessThan(0)
    })
  })
})
