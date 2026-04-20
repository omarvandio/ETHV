import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { useState, useCallback } from 'react';
import apiClient from '../services/apiClient';

export function useWallet() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const login = useCallback(async () => {
    if (!address) return;

    try {
      setIsAuthenticating(true);
      const message = `Login to LikeTalent: ${new Date().toISOString()}`;
      const signature = await signMessageAsync({ message, account: address });

      const response = await apiClient.post('/auth/wallet-login', {
        address,
        signature,
        message,
      });

      const { token } = response.data;
      localStorage.setItem('auth_token', token);
      return token;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, signMessageAsync]);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    disconnect();
  }, [disconnect]);

  return {
    address,
    isConnected,
    isAuthenticating,
    login,
    logout,
  };
}
