import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { mainnet, sepolia } from 'wagmi/chains';

// Get projectId at https://cloud.walletconnect.com
export const projectId = (import.meta as any).env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const metadata = {
  name: 'LikeTalent Talent Validation',
  description: 'Web3 Talent Validation Agent',
  url: 'https://ethv.io', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const chains = [mainnet, sepolia] as const;
export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
});
