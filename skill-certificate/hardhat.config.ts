import { HardhatUserConfig } from "hardhat/config";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-verify";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  // ─── Default network ─────────────────────────────────────────────────────
  defaultNetwork: "zkSYSTestnet",

  // ─── Networks ────────────────────────────────────────────────────────────
  networks: {
    // zkSYS Testnet (ZK Rollup of Syscoin) — primary deployment target
    zkSYSTestnet: {
      url: "https://rpc-zk.tanenbaum.io/",
      ethNetwork: "https://rpc-gw.tanenbaum.io", // L1 gateway
      zksync: true,
      chainId: 57057,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      verifyURL: "https://explorer-zk.tanenbaum.io/contract_verification",
    },

    // Syscoin NEVM Testnet (standard EVM, no zksync)
    syscoinTestnet: {
      url: "https://rpc.tanenbaum.io",
      chainId: 5700,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },

    // Syscoin NEVM Mainnet
    syscoinMainnet: {
      url: "https://rpc.syscoin.org",
      chainId: 57,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },

    // Rollux Mainnet (Syscoin L2, non-ZK)
    rolluxMainnet: {
      url: "https://rpc.rollux.com",
      chainId: 570,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },

    // Local hardhat network for tests
    hardhat: {
      zksync: false,
    },
  },

  // ─── zkSolc compiler (used for zkSYS) ────────────────────────────────────
  zksolc: {
    version: "1.5.15",
    settings: {
      codegen: "evmla",
      optimizer: {
        enabled: true,
      },
    },
  },

  // ─── Solidity compiler (used for standard networks & tests) ─────────────
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  // ─── Paths ────────────────────────────────────────────────────────────────
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
