import { Wallet } from "zksync-ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deploy SkillCertificate to zkSYS Testnet.
 *
 * Run with:
 *   npx hardhat deploy-zksync --script deploy.ts --network zkSYSTestnet
 */
export default async function (hre: HardhatRuntimeEnvironment) {
  console.log("─────────────────────────────────────────");
  console.log("  SkillCertificate — zkSYS Deploy Script");
  console.log("─────────────────────────────────────────");

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is not set in .env");
  }

  // Create a wallet using the zksync-ethers provider
  const wallet = new Wallet(privateKey);
  const deployer = new Deployer(hre, wallet);

  console.log(`\nDeployer address : ${wallet.address}`);

  // Load artifact compiled by zksolc
  const artifact = await deployer.loadArtifact("SkillCertificate");

  // Estimate deploy fee
  const deploymentFee = await deployer.estimateDeployFee(artifact, []);
  console.log(`Estimated fee    : ${hre.ethers.formatEther(deploymentFee)} TSYS`);

  // Deploy (no constructor args)
  console.log("\nDeploying SkillCertificate...");
  const contract = await deployer.deploy(artifact, []);

  const address = await contract.getAddress();
  console.log(`\n✅ Contract deployed at : ${address}`);
  console.log(
    `🔍 Explorer            : https://explorer-zk.tanenbaum.io/address/${address}`
  );
  console.log("\nSave this address — you will need it for verification and frontend config.");
}
