import React, { useState, useCallback } from 'react';
import { ChevronDownIcon, ExclamationTriangleIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';

// Import from mock protocol for now - will be replaced with real types later
export interface Position {
  id: string;
  user: string;
  market: string;
  isLong: boolean;
  baseSize: number;
  entryPrice: number;
  margin: number;
  openTime: number;
  pnl: number;
  equity: number;
  liquidationPrice: number;
}

export interface Market {
  symbol: string;
  baseDecimals: number;
  oraclePrice: number;
  markPrice: number;
  skewK: number;
  maxPositionBase: number;
  maintenanceMarginBps: number;
  leverageCap: number;
  baseReserve: number;
  quoteReserve: number;
  fundingRate: number;
  totalLongSize: number;
  totalShortSize: number;
}

interface AdvancedPositionManagerProps {
  position: Position;
  market: Market;
  onPartialClose: (positionId: string, closePercentage: number) => Promise<void>;
  onModifyMargin: (positionId: string, marginChange: number, isDeposit: boolean) => Promise<void>;
  onSetStopLoss: (positionId: string, triggerPrice: number, closePercentage: number) => Promise<void>;
}

export const AdvancedPositionManager: React.FC<AdvancedPositionManagerProps> = ({
  position,
  market,
  onPartialClose,
  onModifyMargin,
  onSetStopLoss,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'close' | 'margin' | 'stoploss'>('close');
  
  // Partial Close State
  const [closePercentage, setClosePercentage] = useState(25);
  const [isClosing, setIsClosing] = useState(false);
  
  // Margin Modification State
  const [marginAmount, setMarginAmount] = useState('');
  const [isMarginDeposit, setIsMarginDeposit] = useState(true);
  const [isModifyingMargin, setIsModifyingMargin] = useState(false);
  
  // Stop Loss State
  const [stopLossPrice, setStopLossPrice] = useState('');
  const [stopLossClosePercentage, setStopLossClosePercentage] = useState(100);
  const [isSettingStopLoss, setIsSettingStopLoss] = useState(false);

  // Calculations
  const currentPrice = market.markPrice / 1_000_000;
  const entryPrice = position.entryPrice / 1_000_000;
  const marginAmount_USD = position.margin / 1_000_000;
  const positionSize = Math.abs(position.baseSize);
  const notionalValue = positionSize * currentPrice;
  const leverage = notionalValue / marginAmount_USD;
  
  // Partial close calculations
  const closeSizeAmount = (positionSize * closePercentage) / 100;
  const remainingSize = positionSize - closeSizeAmount;
  const estimatedCloseValue = closeSizeAmount * currentPrice;
  
  // Margin modification calculations
  const marginChangeAmount = parseFloat(marginAmount) || 0;
  const newMarginAmount = isMarginDeposit 
    ? marginAmount_USD + marginChangeAmount 
    : marginAmount_USD - marginChangeAmount;
  const newLeverage = newMarginAmount > 0 ? notionalValue / newMarginAmount : 0;
  
  // Stop loss calculations
  const stopPrice = parseFloat(stopLossPrice) || 0;
  const stopLossDistance = position.isLong 
    ? ((currentPrice - stopPrice) / currentPrice) * 100
    : ((stopPrice - currentPrice) / currentPrice) * 100;

  // Health checks
  const isLiquidationRisk = leverage > (market.leverageCap * 0.8);
  const isMarginTooLow = newLeverage > market.leverageCap;
  const isStopLossValid = position.isLong ? stopPrice < currentPrice : stopPrice > currentPrice;

  const handlePartialClose = useCallback(async () => {
    if (closePercentage < 1 || closePercentage > 99) return;
    
    setIsClosing(true);
    try {
      await onPartialClose(position.id, closePercentage);
    } catch (error) {
      console.error('Failed to partially close position:', error);
    } finally {
      setIsClosing(false);
    }
  }, [position.id, closePercentage, onPartialClose]);

  const handleModifyMargin = useCallback(async () => {
    if (!marginChangeAmount || marginChangeAmount <= 0) return;
    if (!isMarginDeposit && marginChangeAmount >= marginAmount_USD) return;
    
    setIsModifyingMargin(true);
    try {
      await onModifyMargin(position.id, marginChangeAmount, isMarginDeposit);
    } catch (error) {
      console.error('Failed to modify margin:', error);
    } finally {
      setIsModifyingMargin(false);
      setMarginAmount('');
    }
  }, [position.id, marginChangeAmount, isMarginDeposit, marginAmount_USD, onModifyMargin]);

  const handleSetStopLoss = useCallback(async () => {
    if (!stopPrice || !isStopLossValid) return;
    
    setIsSettingStopLoss(true);
    try {
      await onSetStopLoss(position.id, stopPrice, stopLossClosePercentage);
    } catch (error) {
      console.error('Failed to set stop loss:', error);
    } finally {
      setIsSettingStopLoss(false);
    }
  }, [position.id, stopPrice, stopLossClosePercentage, isStopLossValid, onSetStopLoss]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Position Summary Header */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              position.isLong ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {position.isLong ? 'Long' : 'Short'}
            </span>
            <span className="font-mono text-sm font-medium">
              {position.market}/USDC
            </span>
          </div>
          
          <div className="text-sm text-gray-600">
            Size: <span className="font-mono font-medium">{positionSize.toFixed(4)}</span>
          </div>
          
          <div className="text-sm text-gray-600">
            PnL: <span className={`font-mono font-medium ${
              position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              ${(position.pnl / 1_000_000).toFixed(2)}
            </span>
          </div>
          
          {isLiquidationRisk && (
            <div className="flex items-center text-amber-600">
              <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
              <span className="text-xs font-medium">High Risk</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <AdjustmentsHorizontalIcon className="w-4 h-4 text-gray-400" />
          <ChevronDownIcon 
            className={`w-4 h-4 text-gray-400 transform transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`} 
          />
        </div>
      </div>

      {/* Advanced Controls */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('close')}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activeTab === 'close'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Partial Close
            </button>
            <button
              onClick={() => setActiveTab('margin')}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activeTab === 'margin'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Adjust Margin
            </button>
            <button
              onClick={() => setActiveTab('stoploss')}
              className={`flex-1 py-3 px-4 text-sm font-medium ${
                activeTab === 'stoploss'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Stop Loss
            </button>
          </div>

          <div className="p-4">
            {/* Partial Close Tab */}
            {activeTab === 'close' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Close Percentage (1-99%)
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      min="1"
                      max="99"
                      value={closePercentage}
                      onChange={(e) => setClosePercentage(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={closePercentage}
                        onChange={(e) => setClosePercentage(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Closing Size:</span>
                    <span className="font-mono">{closeSizeAmount.toFixed(4)} {position.market}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Remaining Size:</span>
                    <span className="font-mono">{remainingSize.toFixed(4)} {position.market}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Est. Close Value:</span>
                    <span className="font-mono">${estimatedCloseValue.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handlePartialClose}
                  disabled={isClosing || closePercentage < 1 || closePercentage > 99}
                  className="w-full py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isClosing ? 'Closing...' : `Close ${closePercentage}% of Position`}
                </button>
              </div>
            )}

            {/* Adjust Margin Tab */}
            {activeTab === 'margin' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Margin Operation
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setIsMarginDeposit(true)}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                        isMarginDeposit
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Add Margin
                    </button>
                    <button
                      onClick={() => setIsMarginDeposit(false)}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                        !isMarginDeposit
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Remove Margin
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (USDC)
                  </label>
                  <input
                    type="number"
                    value={marginAmount}
                    onChange={(e) => setMarginAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    max={!isMarginDeposit ? marginAmount_USD * 0.9 : undefined}
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Current Margin:</span>
                    <span className="font-mono">${marginAmount_USD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Current Leverage:</span>
                    <span className="font-mono">{leverage.toFixed(2)}x</span>
                  </div>
                  {marginChangeAmount > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">New Margin:</span>
                        <span className="font-mono">${newMarginAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">New Leverage:</span>
                        <span className={`font-mono ${isMarginTooLow ? 'text-red-600' : ''}`}>
                          {newLeverage.toFixed(2)}x
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {isMarginTooLow && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center">
                      <ExclamationTriangleIcon className="w-4 h-4 text-red-600 mr-2" />
                      <span className="text-sm text-red-800">
                        New leverage ({newLeverage.toFixed(2)}x) exceeds maximum ({market.leverageCap}x)
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleModifyMargin}
                  disabled={
                    isModifyingMargin || 
                    !marginChangeAmount || 
                    marginChangeAmount <= 0 ||
                    isMarginTooLow ||
                    (!isMarginDeposit && marginChangeAmount >= marginAmount_USD)
                  }
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isModifyingMargin ? 'Processing...' : 
                   `${isMarginDeposit ? 'Add' : 'Remove'} $${marginChangeAmount.toFixed(2)} Margin`}
                </button>
              </div>
            )}

            {/* Stop Loss Tab */}
            {activeTab === 'stoploss' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stop Loss Trigger Price (USD)
                  </label>
                  <input
                    type="number"
                    value={stopLossPrice}
                    onChange={(e) => setStopLossPrice(e.target.value)}
                    placeholder={`e.g., ${position.isLong ? (currentPrice * 0.9).toFixed(2) : (currentPrice * 1.1).toFixed(2)}`}
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position to Close (%)
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={stopLossClosePercentage}
                      onChange={(e) => setStopLossClosePercentage(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={stopLossClosePercentage}
                        onChange={(e) => setStopLossClosePercentage(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Current Price:</span>
                    <span className="font-mono">${currentPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Entry Price:</span>
                    <span className="font-mono">${entryPrice.toFixed(2)}</span>
                  </div>
                  {stopPrice > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Stop Distance:</span>
                        <span className={`font-mono ${stopLossDistance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {stopLossDistance.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Trigger Direction:</span>
                        <span className="font-mono">
                          {position.isLong ? 'Below' : 'Above'} ${stopPrice.toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {stopPrice > 0 && !isStopLossValid && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center">
                      <ExclamationTriangleIcon className="w-4 h-4 text-red-600 mr-2" />
                      <span className="text-sm text-red-800">
                        Stop loss price must be {position.isLong ? 'below' : 'above'} current market price
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSetStopLoss}
                  disabled={isSettingStopLoss || !stopPrice || !isStopLossValid}
                  className="w-full py-2 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSettingStopLoss ? 'Setting...' : 
                   `Set Stop Loss at $${stopPrice || '0.00'}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
