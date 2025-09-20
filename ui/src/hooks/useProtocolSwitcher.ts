import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { mockProtocol } from '../lib/mockProtocol';
import { useRealSolanaProtocol } from '../lib/realSolanaProtocol';

export const useProtocolSwitcher = () => {
  const { connected } = useWallet();
  const { protocol: realProtocol } = useRealSolanaProtocol();
  const [useRealProtocol, setUseRealProtocol] = useState(false);

  // Automatically switch to real protocol when wallet is connected
  useEffect(() => {
    if (connected && !useRealProtocol) {
      // Optional: auto-switch to real protocol when wallet connects
      // setUseRealProtocol(true);
    }
    if (!connected && useRealProtocol) {
      // Auto-switch back to mock when wallet disconnects
      setUseRealProtocol(false);
    }
  }, [connected, useRealProtocol]);

  const protocol = useRealProtocol ? realProtocol : mockProtocol;

  return {
    protocol,
    useRealProtocol,
    setUseRealProtocol,
    connected,
    canUseRealProtocol: connected
  };
};
