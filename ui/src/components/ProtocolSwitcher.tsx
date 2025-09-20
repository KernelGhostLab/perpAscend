import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface ProtocolSwitcherProps {
  useRealProtocol: boolean;
  onToggle: (useReal: boolean) => void;
  canUseReal: boolean;
}

export const ProtocolSwitcher: React.FC<ProtocolSwitcherProps> = ({
  useRealProtocol,
  onToggle,
  canUseReal,
}) => {
  const { connected, publicKey } = useWallet();

  return (
    <div className="bg-gray-50 border-l border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Protocol Mode</h3>
      
      <div className="space-y-4">
        {/* Current Mode Display */}
        <div className="flex items-center space-x-2">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            useRealProtocol 
              ? 'bg-green-100 text-green-800' 
              : 'bg-blue-100 text-blue-800'
          }`}>
            {useRealProtocol ? '🔗 Real Solana' : '🧪 Mock Testing'}
          </span>
        </div>

        {/* Protocol Toggle */}
        <div className="space-y-2">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="radio"
              name="protocol"
              checked={!useRealProtocol}
              onChange={() => onToggle(false)}
              className="h-4 w-4 text-blue-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Mock Protocol</span>
              <p className="text-xs text-gray-500">Safe testing with simulated data</p>
            </div>
          </label>
          
          <label className={`flex items-center space-x-3 ${canUseReal ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
            <input
              type="radio"
              name="protocol"
              checked={useRealProtocol}
              onChange={() => canUseReal && onToggle(true)}
              disabled={!canUseReal}
              className="h-4 w-4 text-green-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Real Solana</span>
              <p className="text-xs text-gray-500">
                {canUseReal 
                  ? 'Live transactions on devnet' 
                  : 'Connect wallet to enable'
                }
              </p>
            </div>
          </label>
        </div>

        {/* Wallet Connection Status */}
        <div className="pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Wallet</span>
            <span className={`text-xs px-2 py-1 rounded ${
              connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {connected && publicKey && (
            <div className="text-xs text-gray-500 mb-3">
              {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
            </div>
          )}
          
          <WalletMultiButton className="!bg-indigo-600 hover:!bg-indigo-700 !text-white !text-sm !py-2 !px-4 !rounded !font-medium !transition-colors" />
        </div>

        {/* Protocol Info */}
        <div className="pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600 space-y-1">
            {useRealProtocol ? (
              <>
                <p>• Connected to Solana devnet</p>
                <p>• Real transactions with fees</p>
                <p>• PerpAscent Program ID: HSMR...r1gj</p>
              </>
            ) : (
              <>
                <p>• No blockchain transactions</p>
                <p>• Simulated market data</p>
                <p>• Safe for testing UI/UX</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
