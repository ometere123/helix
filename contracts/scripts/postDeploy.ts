/**
 * postDeploy.ts
 *
 * Run AFTER `hardhat ignition deploy ignition/modules/Deploy.ts --network arcTestnet`.
 *
 * Reads deployed addresses from Ignition's artifacts, prints them in a friendly box,
 * and optionally seeds the FluxAMM pool with USDC + EURC if SEED_USDC_AMOUNT and
 * SEED_EURC_AMOUNT env vars are set.
 *
 * Usage:
 *   npx hardhat run scripts/postDeploy.ts --network arcTestnet
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { network } from "hardhat";
import { erc20Abi, formatUnits } from "viem";
import "dotenv/config";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
const FAUCET_URL = "https://faucet.circle.com";

type Addresses = Record<string, `0x${string}`>;

function loadAddresses(chainId: number): Addresses {
  // Try deployment-id from env, then chain-<id>, then any single folder under deployments/
  const candidates: string[] = [];
  if (process.env.DEPLOYMENT_ID) {
    candidates.push(resolve(process.cwd(), `ignition/deployments/${process.env.DEPLOYMENT_ID}/deployed_addresses.json`));
  }
  candidates.push(resolve(process.cwd(), `ignition/deployments/chain-${chainId}/deployed_addresses.json`));
  candidates.push(resolve(process.cwd(), `ignition/deployments/helix-arc-testnet-v1/deployed_addresses.json`));

  for (const p of candidates) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8")) as Addresses;
  }

  // Fallback: scan for any deployed_addresses.json
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const dir = resolve(process.cwd(), "ignition/deployments");
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry, "deployed_addresses.json");
      if (existsSync(full)) return JSON.parse(readFileSync(full, "utf-8")) as Addresses;
    }
  }

  throw new Error(`No deployed_addresses.json found. Tried:\n  ${candidates.join("\n  ")}`);
}

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();

  const addresses = loadAddresses(chainId);

  // Ignition keys look like "Helix#Vault", "Helix#FluxAMM", etc.
  const get = (name: string) => addresses[`Helix#${name}`];
  const vault = get("Vault");
  const flux = get("FluxAMM");
  const streamline = get("Streamline");
  const lockbox = get("Lockbox");
  const forge = get("Forge");
  const agentRegistry = get("AgentRegistry");

  // Optional AMM seed — best-effort, errors here do NOT abort the summary
  let seedStatus = "(skipped — set SEED_USDC_AMOUNT and SEED_EURC_AMOUNT to seed)";
  const seedUsdcEnv = process.env.SEED_USDC_AMOUNT;
  const seedEurcEnv = process.env.SEED_EURC_AMOUNT;
  if (seedUsdcEnv && seedEurcEnv && flux && seedUsdcEnv !== "0" && seedEurcEnv !== "0") {
    const seedUsdc = BigInt(seedUsdcEnv);
    const seedEurc = BigInt(seedEurcEnv);
    try {
      console.log("");
      console.log(`Seeding FluxAMM pool with ${formatUnits(seedUsdc, 6)} USDC + ${formatUnits(seedEurc, 6)} EURC...`);

      // Balance check before attempting transfers
      const [usdcBal, eurcBal] = await Promise.all([
        publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [walletClient.account.address] }) as Promise<bigint>,
        publicClient.readContract({ address: EURC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [walletClient.account.address] }) as Promise<bigint>,
      ]);
      if (usdcBal < seedUsdc || eurcBal < seedEurc) {
        seedStatus = `(skipped — deployer has ${formatUnits(usdcBal, 6)} USDC and ${formatUnits(eurcBal, 6)} EURC, needs ${formatUnits(seedUsdc, 6)} + ${formatUnits(seedEurc, 6)})`;
        console.log("  " + seedStatus);
      } else {
        const approveUsdcHash = await walletClient.writeContract({
          address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [flux, seedUsdc],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveUsdcHash });
        console.log(`  USDC approve: ${approveUsdcHash}`);

        const approveEurcHash = await walletClient.writeContract({
          address: EURC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [flux, seedEurc],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveEurcHash });
        console.log(`  EURC approve: ${approveEurcHash}`);

        const fluxAbi = [{
          type: "function", name: "addLiquidity", stateMutability: "nonpayable",
          inputs: [{ name: "usdcAmount", type: "uint256" }, { name: "eurcAmount", type: "uint256" }],
          outputs: [{ name: "shares", type: "uint256" }],
        }] as const;
        const addLiqHash = await walletClient.writeContract({
          address: flux, abi: fluxAbi, functionName: "addLiquidity", args: [seedUsdc, seedEurc],
        });
        await publicClient.waitForTransactionReceipt({ hash: addLiqHash });
        console.log(`  addLiquidity: ${addLiqHash}`);
        seedStatus = `seeded ${formatUnits(seedUsdc, 6)} USDC + ${formatUnits(seedEurc, 6)} EURC ✓`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      seedStatus = `(seed failed: ${msg.slice(0, 100)})`;
      console.log("  " + seedStatus);
    }
  }

  // Pretty summary
  const line = "═".repeat(63);
  console.log("");
  console.log(line);
  console.log("  HELIX DEPLOYED — Arc Testnet (chain " + chainId + ")");
  console.log(line);
  console.log("  Vault:          " + vault);
  console.log("  FluxAMM:        " + flux);
  console.log("  Streamline:     " + streamline);
  console.log("  Lockbox:        " + lockbox);
  console.log("  Forge:          " + forge);
  console.log("  AgentRegistry:  " + agentRegistry);
  console.log("");
  console.log("  USDC (Arc):     " + USDC_ADDRESS);
  console.log("  EURC (Arc):     " + EURC_ADDRESS);
  console.log("");
  console.log("  AMM seed:       " + seedStatus);
  console.log("");
  console.log("  DEPLOYER WALLET (also serves as crank by default):");
  console.log("    " + walletClient.account.address);
  console.log("    Get test USDC at " + FAUCET_URL);
  console.log("    (~5 USDC covers thousands of crank executions)");
  console.log(line);
  console.log("");
  console.log("  Paste these into app/.env.local:");
  console.log("    NEXT_PUBLIC_VAULT_ADDRESS=" + vault);
  console.log("    NEXT_PUBLIC_FLUX_ADDRESS=" + flux);
  console.log("    NEXT_PUBLIC_STREAMLINE_ADDRESS=" + streamline);
  console.log("    NEXT_PUBLIC_LOCKBOX_ADDRESS=" + lockbox);
  console.log("    NEXT_PUBLIC_FORGE_ADDRESS=" + forge);
  console.log("    NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=" + agentRegistry);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
