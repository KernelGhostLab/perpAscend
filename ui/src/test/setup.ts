import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  
  readyState = MockWebSocket.OPEN
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  close = vi.fn()
  send = vi.fn()
  
  constructor(public url: string) {}
}

global.WebSocket = MockWebSocket as any

// Mock Solana Web3.js
vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({
    getBalance: vi.fn().mockResolvedValue(1000000000),
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: 'mocked-blockhash',
      lastValidBlockHeight: 12345
    })
  })),
  PublicKey: vi.fn((key) => ({ toBase58: () => key })),
  LAMPORTS_PER_SOL: 1000000000
}))

// Mock Solana Wallet Adapter
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: vi.fn(() => ({
    connected: false,
    connecting: false,
    disconnecting: false,
    publicKey: null,
    wallet: null,
    wallets: [],
    select: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendTransaction: vi.fn(),
    signTransaction: vi.fn(),
    signAllTransactions: vi.fn(),
    signMessage: vi.fn()
  })),
  useConnection: vi.fn(() => ({
    connection: {
      getBalance: vi.fn().mockResolvedValue(1000000000),
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'mocked-blockhash',
        lastValidBlockHeight: 12345
      })
    }
  }))
}))

// Mock Wallet UI
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletMultiButton: vi.fn(({ children, ...props }) => 
    React.createElement('button', props, children || 'Connect Wallet')
  )
}))

// Mock fetch globally
global.fetch = vi.fn()

// Setup fetch mock helper
export const mockFetch = (response: any, ok = true, status = 200) => {
  (global.fetch as any).mockResolvedValueOnce({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response)
  })
}

// Cleanup after each test
import { afterEach } from 'vitest'
afterEach(() => {
  vi.clearAllMocks()
})
