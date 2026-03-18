import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useAccount } from 'wagmi';

// Bypass mode - set via environment variable
const WALLET_BYPASS = import.meta.env.VITE_WALLET_BYPASS === 'true';

export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const { isConnected } = useAccount();

  // Bypass authentication if enabled
  if (WALLET_BYPASS) {
    console.log('🔓 Wallet bypass enabled - allowing access without authentication');
    return <Outlet />;
  }

  if (!isAuthenticated || !isConnected) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
