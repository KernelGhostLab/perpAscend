import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StopLossManager } from '../components/StopLossManager'
import { mockStopLossOrder } from './utils'

// Mock props
const defaultProps = {
  orders: [],
  onCreateOrder: vi.fn(),
  onModifyOrder: vi.fn(),
  onCancelOrder: vi.fn(),
  onExecuteOrder: vi.fn()
}

describe('StopLossManager - Optimized', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Rendering', () => {
    it('should render empty state when no orders', () => {
      render(<StopLossManager {...defaultProps} />)
      
      expect(screen.getByText('Stop-Loss Orders')).toBeInTheDocument()
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText('Active Orders')).toBeInTheDocument()
    })

    it('should render active orders correctly', () => {
      const orders = [
        mockStopLossOrder({ status: 'active', market: 'BTC' }),
        mockStopLossOrder({ status: 'active', market: 'ETH' })
      ]

      render(<StopLossManager {...defaultProps} orders={orders} />)
      
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('Active Orders (2)')).toBeInTheDocument()
      expect(screen.getByText('BTC/USDC')).toBeInTheDocument()
      expect(screen.getByText('ETH/USDC')).toBeInTheDocument()
    })
  })

  describe('Order Management', () => {
    const activeOrder = mockStopLossOrder({ 
      status: 'active',
      triggerPrice: 64000,
      closePercentage: 50 
    })

    beforeEach(() => {
      render(<StopLossManager {...defaultProps} orders={[activeOrder]} />)
    })

    it('should show action buttons for active orders', () => {
      expect(screen.getByTitle('Edit Order')).toBeInTheDocument()
      expect(screen.getByTitle('Execute Order')).toBeInTheDocument()
      expect(screen.getByTitle('Cancel Order')).toBeInTheDocument()
    })

    it('should enable editing when edit button is clicked', async () => {
      const editButton = screen.getByTitle('Edit Order')
      fireEvent.click(editButton)

      // Should show input fields instead of display values
      expect(screen.getByDisplayValue('64000')).toBeInTheDocument()
      expect(screen.getByDisplayValue('50')).toBeInTheDocument()
      
      // Should show save/cancel buttons
      expect(screen.getByTitle('Save Changes')).toBeInTheDocument()
      expect(screen.getByTitle('Cancel Edit')).toBeInTheDocument()
    })

    it('should call onCancelOrder when cancel button is clicked', () => {
      const cancelButton = screen.getByTitle('Cancel Order')
      fireEvent.click(cancelButton)

      expect(defaultProps.onCancelOrder).toHaveBeenCalledWith(activeOrder.id)
    })
  })

  describe('Order Editing', () => {
    const editableOrder = mockStopLossOrder({ 
      status: 'active',
      triggerPrice: 64000,
      closePercentage: 50 
    })

    it('should update input values and save changes', async () => {
      const user = userEvent.setup()
      render(<StopLossManager {...defaultProps} orders={[editableOrder]} />)
      
      // Enter edit mode
      fireEvent.click(screen.getByTitle('Edit Order'))

      // Find and modify inputs
      const priceInput = screen.getByDisplayValue('64000')
      const percentageInput = screen.getByDisplayValue('50')

      await user.clear(priceInput)
      await user.type(priceInput, '65000')

      await user.clear(percentageInput)
      await user.type(percentageInput, '75')

      // Save changes
      fireEvent.click(screen.getByTitle('Save Changes'))

      expect(defaultProps.onModifyOrder).toHaveBeenCalledWith(
        editableOrder.id, 
        65000, 
        75
      )
    })
  })

  describe('Urgency Classification', () => {
    it('should show critical urgency for orders close to trigger', () => {
      const criticalOrder = mockStopLossOrder({ 
        distanceToTrigger: 0.5, 
        status: 'active' 
      })

      render(<StopLossManager {...defaultProps} orders={[criticalOrder]} />)

      expect(screen.getByText('CRITICAL')).toBeInTheDocument()
    })

    it('should show warning urgency for moderately distant orders', () => {
      const warningOrder = mockStopLossOrder({ 
        distanceToTrigger: 3, 
        status: 'active' 
      })

      render(<StopLossManager {...defaultProps} orders={[warningOrder]} />)

      expect(screen.getByText('WARNING')).toBeInTheDocument()
    })
  })

  describe('Order History', () => {
    it('should display order history when tab is clicked', () => {
      const historyOrders = [
        mockStopLossOrder({ status: 'cancelled', market: 'ETH' }),
        mockStopLossOrder({ status: 'triggered', market: 'BTC' })
      ]

      render(<StopLossManager {...defaultProps} orders={historyOrders} />)
      
      // Click order history tab
      fireEvent.click(screen.getByText(/Order History/))

      expect(screen.getByText('CANCELLED')).toBeInTheDocument()
      expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
    })

    it('should show trigger prices and amounts in history', () => {
      const historyOrders = [
        mockStopLossOrder({ 
          status: 'triggered', 
          triggerPrice: 64000,
          closePercentage: 100
        })
      ]

      render(<StopLossManager {...defaultProps} orders={historyOrders} />)
      
      fireEvent.click(screen.getByText(/Order History/))

      // Look for price without comma formatting to be more flexible
      expect(screen.getByText(/64000/)).toBeInTheDocument()
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })

  describe('Summary Statistics', () => {
    it('should calculate and display summary stats', () => {
      const orders = [
        mockStopLossOrder({ 
          status: 'active', 
          distanceToTrigger: 0.5, 
          estimatedLoss: 1000 
        }),
        mockStopLossOrder({ 
          status: 'active', 
          distanceToTrigger: 5, 
          estimatedLoss: 500 
        })
      ]

      render(<StopLossManager {...defaultProps} orders={orders} />)

      expect(screen.getByText('Total Protected Value:')).toBeInTheDocument()
      expect(screen.getByText('Critical Orders:')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument() // One critical order
    })
  })

  describe('Component State', () => {
    it('should handle empty orders gracefully', () => {
      render(<StopLossManager {...defaultProps} orders={[]} />)
      
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText('Active Orders (0)')).toBeInTheDocument()
    })

    it('should display multiple orders correctly', () => {
      const orders = Array.from({ length: 3 }, (_, i) => 
        mockStopLossOrder({ 
          status: 'active', 
          market: ['BTC', 'ETH', 'SOL'][i] 
        })
      )

      render(<StopLossManager {...defaultProps} orders={orders} />)
      
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Active Orders (3)')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const order = mockStopLossOrder({ status: 'active' })
      render(<StopLossManager {...defaultProps} orders={[order]} />)

      expect(screen.getByTitle('Edit Order')).toBeInTheDocument()
      expect(screen.getByTitle('Cancel Order')).toBeInTheDocument()
      expect(screen.getByTitle('Execute Order')).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      const order = mockStopLossOrder({ status: 'active' })
      render(<StopLossManager {...defaultProps} orders={[order]} />)

      const editButton = screen.getByTitle('Edit Order')
      editButton.focus()
      expect(document.activeElement).toBe(editButton)

      await user.keyboard('{Enter}')
      // Should enter edit mode
      expect(screen.getByTitle('Save Changes')).toBeInTheDocument()
    })
  })
})
