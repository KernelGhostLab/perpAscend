import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StopLossManager, StopLossOrder } from '../components/StopLossManager'
import { mockStopLossOrder } from './utils'

describe('StopLossManager', () => {
  const mockOnCreateOrder = vi.fn()
  const mockOnModifyOrder = vi.fn()
  const mockOnCancelOrder = vi.fn()
  const mockOnExecuteOrder = vi.fn()

  const defaultProps = {
    orders: [],
    onCreateOrder: mockOnCreateOrder,
    onModifyOrder: mockOnModifyOrder,
    onCancelOrder: mockOnCancelOrder,
    onExecuteOrder: mockOnExecuteOrder
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Empty State', () => {
    it('should show empty state when no active orders exist', () => {
      render(<StopLossManager {...defaultProps} />)

      expect(screen.getByText('No Active Stop-Loss Orders')).toBeInTheDocument()
      expect(screen.getByText('Create stop-loss orders through the Advanced Position Manager to protect your positions.')).toBeInTheDocument()
    })

    it('should show empty history when no historical orders exist', () => {
      render(<StopLossManager {...defaultProps} />)

      fireEvent.click(screen.getByText(/Order History/))
      
      expect(screen.getByText('No Order History')).toBeInTheDocument()
      expect(screen.getByText('Your triggered, cancelled, and expired stop-loss orders will appear here.')).toBeInTheDocument()
    })
  })

  describe('Header and Tabs', () => {
    const activeOrder = mockStopLossOrder({ status: 'active' })
    const triggeredOrder = mockStopLossOrder({ status: 'triggered' })
    
    it('should display correct active order count', () => {
      render(<StopLossManager {...defaultProps} orders={[activeOrder, triggeredOrder]} />)

      expect(screen.getByText('1')).toBeInTheDocument() // Active orders count
      expect(screen.getByText('Active Orders')).toBeInTheDocument()
    })

    it('should display correct tab counts', () => {
      render(<StopLossManager {...defaultProps} orders={[activeOrder, triggeredOrder]} />)

      expect(screen.getByText('Active Orders (1)')).toBeInTheDocument()
      expect(screen.getByText('Order History (1)')).toBeInTheDocument()
    })

    it('should switch tabs correctly', () => {
      render(<StopLossManager {...defaultProps} orders={[activeOrder, triggeredOrder]} />)

      // Initially on active tab
      expect(screen.getByText(/Current Price/)).toBeInTheDocument()

      // Switch to history tab
      fireEvent.click(screen.getByText('Order History (1)'))
      expect(screen.getByText(/Trigger:/)).toBeInTheDocument()
      expect(screen.queryByText(/Current Price/)).not.toBeInTheDocument()
    })
  })

  describe('Active Orders Display', () => {
    const orders: StopLossOrder[] = [
      mockStopLossOrder({
        id: 'order1',
        market: 'BTC',
        currentPrice: 66500,
        triggerPrice: 64000,
        closePercentage: 50,
        isLong: true,
        distanceToTrigger: -3.8,
        estimatedLoss: 1250,
        status: 'active'
      }),
      mockStopLossOrder({
        id: 'order2',
        market: 'ETH',
        currentPrice: 3500,
        triggerPrice: 3450,
        closePercentage: 100,
        isLong: false,
        distanceToTrigger: 1.4,
        estimatedLoss: 500,
        status: 'active'
      })
    ]

    beforeEach(() => {
      render(<StopLossManager {...defaultProps} orders={orders} />)
    })

    it('should display order information correctly', () => {
      expect(screen.getByText('BTC/USDC')).toBeInTheDocument()
      expect(screen.getByText('ETH/USDC')).toBeInTheDocument()
      expect(screen.getByText('$66,500.00')).toBeInTheDocument()
      expect(screen.getByText('$64,000.00')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
      expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('should show correct directional indicators', () => {
      // Check that both long and short positions are displayed
      expect(screen.getAllByText('ACTIVE')).toHaveLength(2)
    })

    it('should display distance to trigger with correct formatting', () => {
      expect(screen.getByText('3.80% below')).toBeInTheDocument()
      expect(screen.getByText('1.40% above')).toBeInTheDocument()
    })

    it('should display estimated losses', () => {
      expect(screen.getByText('$1,250.00')).toBeInTheDocument()
      expect(screen.getByText('$500.00')).toBeInTheDocument()
    })

    it('should show creation dates', () => {
      const today = new Date().toLocaleDateString()
      expect(screen.getAllByText(`Created ${today}`)).toHaveLength(2)
    })
  })

  describe('Order Urgency Classification', () => {
    it('should mark critical orders correctly', () => {
      const criticalOrder = mockStopLossOrder({
        distanceToTrigger: 0.5, // Within 1%
        status: 'active'
      })

      render(<StopLossManager {...defaultProps} orders={[criticalOrder]} />)

      expect(screen.getByText('CRITICAL')).toBeInTheDocument()
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    })

    it('should apply correct styling for urgency levels', () => {
      const criticalOrder = mockStopLossOrder({ distanceToTrigger: 0.5, status: 'active' })
      const warningOrder = mockStopLossOrder({ distanceToTrigger: 3, status: 'active' })
      const safeOrder = mockStopLossOrder({ distanceToTrigger: 10, status: 'active' })

      const { rerender } = render(<StopLossManager {...defaultProps} orders={[criticalOrder]} />)
      expect(document.querySelector('.border-red-500')).toBeInTheDocument()

      rerender(<StopLossManager {...defaultProps} orders={[warningOrder]} />)
      expect(document.querySelector('.border-yellow-500')).toBeInTheDocument()

      rerender(<StopLossManager {...defaultProps} orders={[safeOrder]} />)
      expect(document.querySelector('.border-gray-200')).toBeInTheDocument()
    })
  })

  describe('Order Actions', () => {
    const order = mockStopLossOrder({ status: 'active' })

    beforeEach(() => {
      render(<StopLossManager {...defaultProps} orders={[order]} />)
    })

    it('should have edit, execute, and cancel buttons', () => {
      expect(screen.getByTitle('Edit Order')).toBeInTheDocument()
      expect(screen.getByTitle('Execute Order (Testing)')).toBeInTheDocument()
      expect(screen.getByTitle('Cancel Order')).toBeInTheDocument()
    })

    it('should call cancel function when cancel button is clicked', async () => {
      const cancelButton = screen.getByTitle('Cancel Order')
      fireEvent.click(cancelButton)

      expect(mockOnCancelOrder).toHaveBeenCalledWith(order.id)
    })

    it('should call execute function when execute button is clicked', async () => {
      const executeButton = screen.getByTitle('Execute Order (Testing)')
      fireEvent.click(executeButton)

      expect(mockOnExecuteOrder).toHaveBeenCalledWith(order.id)
    })
  })

  describe('Order Editing', () => {
    const order = mockStopLossOrder({
      triggerPrice: 64000,
      closePercentage: 50,
      status: 'active'
    })

    beforeEach(() => {
      render(<StopLossManager {...defaultProps} orders={[order]} />)
    })

    it('should enter edit mode when edit button is clicked', async () => {
      const editButton = screen.getByTitle('Edit Order')
      fireEvent.click(editButton)

      expect(screen.getByDisplayValue('64000')).toBeInTheDocument()
      expect(screen.getByDisplayValue('50')).toBeInTheDocument()
      expect(screen.getByTitle('Save Changes')).toBeInTheDocument()
      expect(screen.getByTitle('Cancel Edit')).toBeInTheDocument()
    })

    it('should update input values correctly', async () => {
      const user = userEvent.setup()
      
      fireEvent.click(screen.getByTitle('Edit Order'))

      const priceInput = screen.getByDisplayValue('64000')
      const percentageInput = screen.getByDisplayValue('50')

      await user.clear(priceInput)
      await user.type(priceInput, '65000')

      await user.clear(percentageInput)
      await user.type(percentageInput, '75')

      expect(screen.getByDisplayValue('65000')).toBeInTheDocument()
      expect(screen.getByDisplayValue('75')).toBeInTheDocument()
    })

    it('should save changes when save button is clicked', async () => {
      const user = userEvent.setup()
      
      fireEvent.click(screen.getByTitle('Edit Order'))

      const priceInput = screen.getByDisplayValue('64000')
      await user.clear(priceInput)
      await user.type(priceInput, '65000')

      const percentageInput = screen.getByDisplayValue('50')
      await user.clear(percentageInput)
      await user.type(percentageInput, '75')

      fireEvent.click(screen.getByTitle('Save Changes'))

      expect(mockOnModifyOrder).toHaveBeenCalledWith(order.id, 65000, 75)
    })

    it('should cancel edit mode when cancel button is clicked', async () => {
      fireEvent.click(screen.getByTitle('Edit Order'))
      expect(screen.getByDisplayValue('64000')).toBeInTheDocument()

      fireEvent.click(screen.getByTitle('Cancel Edit'))
      expect(screen.queryByDisplayValue('64000')).not.toBeInTheDocument()
      expect(screen.getByTitle('Edit Order')).toBeInTheDocument()
    })

    it('should handle save errors gracefully', async () => {
      mockOnModifyOrder.mockRejectedValueOnce(new Error('Network error'))
      
      // Mock alert
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      fireEvent.click(screen.getByTitle('Edit Order'))
      fireEvent.click(screen.getByTitle('Save Changes'))

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Error modifying order: Network error')
      })

      alertSpy.mockRestore()
    })
  })

  describe('Order History', () => {
    const historyOrders = [
      mockStopLossOrder({
        status: 'triggered',
        triggeredAt: Date.now() - 3600000,
        market: 'BTC',
        triggerPrice: 64000,
        closePercentage: 100
      }),
      mockStopLossOrder({
        status: 'cancelled',
        market: 'ETH',
        triggerPrice: 3400,
        closePercentage: 50
      })
    ]

    beforeEach(() => {
      render(<StopLossManager {...defaultProps} orders={historyOrders} />)
      fireEvent.click(screen.getByText('Order History (2)'))
    })

    it('should display historical orders correctly', () => {
      expect(screen.getByText('BTC/USDC')).toBeInTheDocument()
      expect(screen.getByText('ETH/USDC')).toBeInTheDocument()
      expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
      expect(screen.getByText('CANCELLED')).toBeInTheDocument()
    })

    it('should show trigger prices and amounts', () => {
      expect(screen.getByText('$64,000.00')).toBeInTheDocument()
      expect(screen.getByText('$3,400.00')).toBeInTheDocument()
      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('should sort orders by triggered/created date', () => {
      const orderElements = screen.getAllByText(/Created|Triggered/)
      // Most recent should be first (triggered order)
      expect(orderElements[0]).toHaveTextContent('Triggered')
    })
  })

  describe('Summary Stats', () => {
    const ordersWithStats = [
      mockStopLossOrder({ estimatedLoss: 1000, distanceToTrigger: 0.5, status: 'active' }),
      mockStopLossOrder({ estimatedLoss: 500, distanceToTrigger: 3, status: 'active' }),
      mockStopLossOrder({ estimatedLoss: 750, distanceToTrigger: 10, status: 'active' })
    ]

    it('should display summary stats for active orders', () => {
      render(<StopLossManager {...defaultProps} orders={ordersWithStats} />)

      expect(screen.getByText('Total Protected Value:')).toBeInTheDocument()
      expect(screen.getByText('$2,250.00')).toBeInTheDocument() // Sum of estimated losses
      expect(screen.getByText('Critical Orders:')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument() // One critical order
    })

    it('should not show summary stats when no active orders', () => {
      render(<StopLossManager {...defaultProps} orders={[]} />)

      expect(screen.queryByText('Total Protected Value:')).not.toBeInTheDocument()
    })

    it('should not show summary stats on history tab', () => {
      const historyOrder = mockStopLossOrder({ status: 'triggered' })
      render(<StopLossManager {...defaultProps} orders={[historyOrder]} />)

      fireEvent.click(screen.getByText('Order History (1)'))
      expect(screen.queryByText('Total Protected Value:')).not.toBeInTheDocument()
    })
  })

  describe('Order Sorting', () => {
    const unsortedOrders = [
      mockStopLossOrder({ id: '1', distanceToTrigger: 10, status: 'active' }),
      mockStopLossOrder({ id: '2', distanceToTrigger: -2, status: 'active' }),
      mockStopLossOrder({ id: '3', distanceToTrigger: 5, status: 'active' }),
      mockStopLossOrder({ id: '4', distanceToTrigger: -0.5, status: 'active' })
    ]

    it('should sort active orders by urgency (closest to trigger first)', () => {
      render(<StopLossManager {...defaultProps} orders={unsortedOrders} />)

      // The order with -0.5 distance should be first (most critical)
      // Then -2, then 5, then 10
      const orderCards = document.querySelectorAll('.border-2')
      
      // First order should be critical (border-red-500)
      expect(orderCards[0]).toHaveClass('border-red-500')
    })
  })

  describe('Accessibility', () => {
    const order = mockStopLossOrder({ status: 'active' })

    it('should have proper button titles for screen readers', () => {
      render(<StopLossManager {...defaultProps} orders={[order]} />)

      expect(screen.getByTitle('Edit Order')).toBeInTheDocument()
      expect(screen.getByTitle('Execute Order (Testing)')).toBeInTheDocument()
      expect(screen.getByTitle('Cancel Order')).toBeInTheDocument()
    })

    it('should have proper form labels in edit mode', async () => {
      render(<StopLossManager {...defaultProps} orders={[order]} />)

      fireEvent.click(screen.getByTitle('Edit Order'))

      const priceInput = screen.getByDisplayValue(order.triggerPrice.toString())
      const percentageInput = screen.getByDisplayValue(order.closePercentage.toString())

      expect(priceInput).toHaveAttribute('type', 'number')
      expect(percentageInput).toHaveAttribute('type', 'number')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing onExecuteOrder prop gracefully', () => {
      const propsWithoutExecute = {
        orders: [mockStopLossOrder({ status: 'active' })],
        onCreateOrder: mockOnCreateOrder,
        onModifyOrder: mockOnModifyOrder,
        onCancelOrder: mockOnCancelOrder
        // onExecuteOrder is omitted
      }

      render(<StopLossManager {...propsWithoutExecute} />)

      expect(screen.queryByTitle('Execute Order (Testing)')).not.toBeInTheDocument()
    })
  })
})
