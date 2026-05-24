/**
 * Claude uses Helix.
 *
 * This script runs from the deployer wallet — the same wallet that built and
 * deployed these contracts. It does two things:
 *
 *   1. Registers Claude (Anthropic) as an agent in the AgentRegistry.
 *      Price: 0.10 USDC per call. Capabilities: the actual things I can do.
 *
 *   2. Swaps 1 USDC → EURC on FluxAMM to demonstrate the protocol working.
 */

import { network } from "hardhat";
import { erc20Abi, formatUnits, parseUnits } from "viem";

const USDC    = "0x3600000000000000000000000000000000000000" as const;
const EURC    = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

// Deployed addresses from .env (loaded via hardhat config)
const AGENT_REGISTRY = process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS as `0x${string}`;
const FLUX_AMM       = process.env.NEXT_PUBLIC_FLUX_ADDRESS as `0x${string}`;

const agentRegistryAbi = [
  {
    type: "function", name: "registerAgent", stateMutability: "nonpayable",
    inputs: [
      { name: "name",          type: "string"   },
      { name: "endpointURL",   type: "string"   },
      { name: "metadataURI",   type: "string"   },
      { name: "capabilities",  type: "string[]" },
      { name: "paymentToken",  type: "address"  },
      { name: "pricePerCall",  type: "uint256"  },
    ],
    outputs: [{ name: "agentId", type: "bytes32" }],
  },
] as const;

const fluxAbi = [
  {
    type: "function", name: "getAmountOut", stateMutability: "view",
    inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "swap", stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn",    type: "address" },
      { name: "amountIn",   type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

async function main() {
  const { viem } = await network.connect();
  const pub  = await viem.getPublicClient();
  const [me] = await viem.getWalletClients();

  const myAddress = me.account.address;
  console.log("\n Claude is on Helix");
  console.log("  Wallet:", myAddress);

  const usdcBalance = await pub.readContract({
    address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [myAddress],
  }) as bigint;
  const eurcBalance = await pub.readContract({
    address: EURC, abi: erc20Abi, functionName: "balanceOf", args: [myAddress],
  }) as bigint;
  console.log(`  USDC balance: ${formatUnits(usdcBalance, 6)}`);
  console.log(`  EURC balance: ${formatUnits(eurcBalance, 6)}`);

  // ── Step 1: Register Claude as an agent ────────────────────────────────────
  console.log("\n── Step 1: Registering Claude in AgentRegistry…");

  const pricePerCall = parseUnits("0.10", 6); // 0.10 USDC

  const regHash = await me.writeContract({
    address: AGENT_REGISTRY,
    abi: agentRegistryAbi,
    functionName: "registerAgent",
    args: [
      "Claude (Anthropic)",
      "https://api.anthropic.com/v1/messages",
      "https://docs.anthropic.com/x402.json",
      ["text-gen", "code-gen", "reasoning", "analysis", "summarization"],
      USDC,
      pricePerCall,
    ],
    chain: me.chain,
    account: me.account,
  });

  const regReceipt = await pub.waitForTransactionReceipt({ hash: regHash });
  const agentId = regReceipt.logs[0]?.topics[1] ?? "unknown";

  console.log("  ✓ Registered");
  console.log("  tx:      ", regHash);
  console.log("  agentId: ", agentId);
  console.log("  price:    0.10 USDC / call");
  console.log("  caps:     text-gen, code-gen, reasoning, analysis, summarization");

  // ── Step 2: Swap 1 USDC → EURC on FluxAMM ─────────────────────────────────
  console.log("\n── Step 2: Swapping 1 USDC → EURC on FluxAMM…");

  const swapAmount = parseUnits("1", 6); // 1 USDC

  // Get quote
  const expectedOut = await pub.readContract({
    address: FLUX_AMM, abi: fluxAbi, functionName: "getAmountOut",
    args: [USDC, swapAmount],
  }) as bigint;
  const minOut = (expectedOut * 99n) / 100n; // 1% slippage

  console.log(`  Quote: 1 USDC → ${formatUnits(expectedOut, 6)} EURC`);

  // Approve
  const approveHash = await me.writeContract({
    address: USDC, abi: erc20Abi, functionName: "approve",
    args: [FLUX_AMM, swapAmount],
    chain: me.chain, account: me.account,
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  console.log("  ✓ Approved USDC");

  // Swap
  const swapHash = await me.writeContract({
    address: FLUX_AMM, abi: fluxAbi, functionName: "swap",
    args: [USDC, swapAmount, minOut],
    chain: me.chain, account: me.account,
  });
  await pub.waitForTransactionReceipt({ hash: swapHash });
  console.log("  ✓ Swapped");
  console.log("  tx:    ", swapHash);

  // Final balances
  const usdcAfter = await pub.readContract({
    address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [myAddress],
  }) as bigint;
  const eurcAfter = await pub.readContract({
    address: EURC, abi: erc20Abi, functionName: "balanceOf", args: [myAddress],
  }) as bigint;

  console.log("\n── Balances after");
  console.log(`  USDC: ${formatUnits(usdcAfter, 6)}  (was ${formatUnits(usdcBalance, 6)})`);
  console.log(`  EURC: ${formatUnits(eurcAfter, 6)}  (was ${formatUnits(eurcBalance, 6)})`);
  console.log("\n Claude is now a registered agent on Helix. ✓\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
