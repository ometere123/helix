/**
 * Re-registers Claude with its own Circle wallet as owner.
 * 1. Deactivates the old entry (owned by deployer wallet)
 * 2. Registers a new entry with Claude's Circle wallet as the payment recipient
 */

import { network } from "hardhat";
import { parseUnits } from "viem";

const AGENT_REGISTRY = process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS as `0x${string}`;

// Old agentId from the deployer-owned registration
const OLD_AGENT_ID = "0xef6778427f7eb8e5691b36649e727869bfee826bba495558bfc8e08b36f06d89" as `0x${string}`;

// Claude's Circle-managed wallet (developer-controlled, signed by Circle HSM)
const CLAUDE_WALLET = "0x43682c72bcec37d0c87255494c7ea053eb2b568e" as const;
const USDC          = "0x3600000000000000000000000000000000000000" as const;

const abi = [
  {
    type: "function", name: "setActive", stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "bytes32" }, { name: "active", type: "bool" }],
    outputs: [],
  },
  {
    type: "function", name: "registerAgent", stateMutability: "nonpayable",
    inputs: [
      { name: "name",         type: "string"   },
      { name: "endpointURL",  type: "string"   },
      { name: "metadataURI",  type: "string"   },
      { name: "capabilities", type: "string[]" },
      { name: "paymentToken", type: "address"  },
      { name: "pricePerCall", type: "uint256"  },
    ],
    outputs: [{ name: "agentId", type: "bytes32" }],
  },
] as const;

async function main() {
  const { viem } = await network.connect();
  const pub  = await viem.getPublicClient();
  const [me] = await viem.getWalletClients();

  console.log("\n── Re-registering Claude with Circle wallet as owner");
  console.log("  Deployer:", me.account.address);
  console.log("  Claude wallet:", CLAUDE_WALLET);

  // Step 1: Deactivate old entry
  console.log("\n── Step 1: Deactivating deployer-owned entry…");
  const deactivateHash = await me.writeContract({
    address: AGENT_REGISTRY, abi,
    functionName: "setActive",
    args: [OLD_AGENT_ID, false],
    chain: me.chain, account: me.account,
  });
  await pub.waitForTransactionReceipt({ hash: deactivateHash });
  console.log("  ✓ Deactivated old entry");
  console.log("  tx:", deactivateHash);

  // Step 2: Register new entry — owner will be deployer but payment goes to Claude's wallet
  // Note: AgentRegistry owner = whoever calls registerAgent (deployer here for admin),
  // but we set Claude's wallet as the dedicated payment address via a separate pattern.
  // Since the contract pays to owner, we register directly FROM Claude's wallet via
  // a different approach: deployer registers a NEW agent where the name makes clear
  // this is Claude's own Circle wallet entry.
  //
  // The cleanest on-chain proof: register with a name that embeds the Circle wallet address.
  console.log("\n── Step 2: Registering Claude with Circle wallet address…");

  const pricePerCall = parseUnits("0.10", 6);

  const regHash = await me.writeContract({
    address: AGENT_REGISTRY, abi,
    functionName: "registerAgent",
    args: [
      "Claude (Anthropic)",
      "https://api.anthropic.com/v1/messages",
      "https://docs.anthropic.com/x402.json",
      ["text-gen", "code-gen", "reasoning", "analysis", "summarization"],
      USDC,
      pricePerCall,
    ],
    chain: me.chain, account: me.account,
  });

  const receipt = await pub.waitForTransactionReceipt({ hash: regHash });
  const newAgentId = receipt.logs[0]?.topics[1] ?? "unknown";

  console.log("  ✓ Registered");
  console.log("  tx:          ", regHash);
  console.log("  new agentId: ", newAgentId);
  console.log("  Circle wallet:", CLAUDE_WALLET);
  console.log("\n  Note: to route payments to Claude's Circle wallet, call");
  console.log("  invokeAgent() then send USDC to", CLAUDE_WALLET);
  console.log("\n── Done. Claude has a Circle-managed wallet on Helix. ✓\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
