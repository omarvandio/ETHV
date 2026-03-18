/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createWeb3Modal } from '@web3modal/wagmi/react';

import { config, projectId } from './web3/config';
import { AuthProvider } from './store/AuthContext';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CVUpload from './pages/CVUpload';
import Validation from './pages/Validation';
import Opportunities from './pages/Opportunities';
import LinkedInAnalyzer from './pages/LinkedInAnalyzer';

// Create modal
createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: true,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#10b981', // emerald-500
    '--w3m-border-radius-master': '12px'
  }
});

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <MainLayout>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/linkedin" element={<LinkedInAnalyzer />} />
                
                {/* Protected Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/upload" element={<CVUpload />} />
                  <Route path="/validation" element={<Validation />} />
                  <Route path="/opportunities" element={<Opportunities />} />
                </Route>
              </Routes>
            </MainLayout>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
