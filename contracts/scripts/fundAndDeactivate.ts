/**
 * Step 1 of re-registration:
 * - Deactivate the deployer-owned Claude entry
 * - Send 1 USDC to Claude's Circle wallet so it can pay gas for its own registration
 */

import { network } from "hardhat";
import { erc20Abi, parseUnits } from "viem";

const AGENT_REGISTRY = process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS as `0x${string}`;
const USDC           = "0x3600000000000000000000000000000000000000" as `0x${string}`;
const OLD_AGENT_ID   = "0xef6778427f7eb8e5691b36649e727869bfee826bba495558bfc8e08b36f06d89" as `0x${string}`;
const CLAUDE_WALLET  = "0x43682c72bcec37d0c87255494c7ea053eb2b568e" as `0x${string}`;

const registryAbi = [
  {
    type: "function", name: "setActive", stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "bytes32" }, { name: "active", type: "bool" }],
    outputs: [],
  },
] as const;

async function main() {
  const { viem } = await network.connect();
  const pub  = await viem.getPublicClient();
  const [me] = await viem.getWalletClients();

  console.log("\n── Deactivate old entry + fund Claude's Circle wallet");
  console.log("  Deployer:     ", me.account.address);
  console.log("  Claude wallet:", CLAUDE_WALLET);

  // Step 1: Deactivate old entry
  console.log("\n── Deactivating old deployer-owned entry…");
  const deactivateHash = await me.writeContract({
    address: AGENT_REGISTRY, abi: registryAbi,
    functionName: "setActive",
    args: [OLD_AGENT_ID, false],
    chain: me.chain, account: me.account,
  });
  await pub.waitForTransactionReceipt({ hash: deactivateHash });
  console.log("  ✓ Deactivated");
  console.log("  tx:", deactivateHash);

  // Step 2: Send 1 USDC to Claude's wallet for gas
  console.log("\n── Sending 1 USDC to Claude's wallet for gas…");
  const transferHash = await me.writeContract({
    address: USDC, abi: erc20Abi,
    functionName: "transfer",
    args: [CLAUDE_WALLET, parseUnits("1", 6)],
    chain: me.chain, account: me.account,
  });
  await pub.waitForTransactionReceipt({ hash: transferHash });
  console.log("  ✓ Funded");
  console.log("  tx:", transferHash);
  console.log("\n  Claude's wallet now has 1 USDC for gas.");
  console.log("  Next: run registerClaudeViaCircle.mjs to complete self-registration.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
