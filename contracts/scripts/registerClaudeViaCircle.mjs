/**
 * Claude self-registers in AgentRegistry via Circle API using pre-encoded callData.
 * Circle's abiFunctionSignature parameter encoder has issues with string[] arrays,
 * so we encode the calldata ourselves with viem and pass it directly.
 */

import crypto from "crypto";
import { randomUUID } from "crypto";
import { encodeFunctionData, parseUnits } from "viem";

const CIRCLE_API_KEY   = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET    = process.env.CIRCLE_ENTITY_SECRET;
const CLAUDE_WALLET_ID = "85bc7f89-726d-543d-8755-d3d660c1f9f7";
const AGENT_REGISTRY   = "0x60d04a6cd227f8949b598ae32186b5a7566b2ef6";
const USDC             = "0x3600000000000000000000000000000000000000";

const abi = [
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
];

async function getEntitySecretCiphertext() {
  const res = await fetch("https://api.circle.com/v1/w3s/config/entity/publicKey", {
    headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}` }
  });
  const { data } = await res.json();
  const secretBytes = Buffer.from(ENTITY_SECRET, "hex");
  const encrypted = crypto.publicEncrypt(
    { key: data.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    secretBytes
  );
  return encrypted.toString("base64");
}

async function main() {
  console.log("\n── Claude self-registers via Circle API (callData mode)");

  const callData = encodeFunctionData({
    abi,
    functionName: "registerAgent",
    args: [
      "Claude (Anthropic)",
      "https://api.anthropic.com/v1/messages",
      "https://docs.anthropic.com/x402.json",
      ["text-gen", "code-gen", "reasoning", "analysis", "summarization"],
      USDC,
      parseUnits("0.10", 6),
    ],
  });

  console.log("  callData:", callData.slice(0, 66) + "…");

  const entitySecretCiphertext = await getEntitySecretCiphertext();

  const body = {
    idempotencyKey: randomUUID(),
    entitySecretCiphertext,
    walletId: CLAUDE_WALLET_ID,
    blockchain: "ARC-TESTNET",
    contractAddress: AGENT_REGISTRY,
    callData,
    gasLimit: "500000",
    feeLevel: "MEDIUM",
  };

  const res = await fetch("https://api.circle.com/v1/w3s/developer/transactions/contractExecution", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CIRCLE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const result = await res.json();
  console.log("\n  Response:", JSON.stringify(result, null, 2));

  if (result.data?.id) {
    const txId = result.data.id;
    console.log("\n  ✓ Submitted — polling for confirmation…");

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const pollRes = await fetch(`https://api.circle.com/v1/w3s/transactions/${txId}`, {
        headers: { "Authorization": `Bearer ${CIRCLE_API_KEY}` }
      });
      const { data } = await pollRes.json();
      const tx = data?.transaction;
      const state = tx?.state;
      console.log(`  [${i+1}] state: ${state}`);
      if (state === "COMPLETE") {
        console.log("\n  ✓ CONFIRMED");
        console.log("  txHash:", tx.txHash);
        console.log("  From (Claude's wallet):", tx.sourceAddress);
        console.log("\n  Claude is the on-chain owner. Payments go to", tx.sourceAddress, "✓\n");
        return;
      }
      if (state === "FAILED") {
        console.log("\n  ✗ Failed:", tx.errorReason);
        console.log("  txHash:", tx.txHash);
        return;
      }
    }
    console.log("\n  Timed out — check manually:", txId);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
