import { NextResponse } from "next/server";
import { formatUnits, isAddress } from "viem";
import { AgentRegistryAbi } from "@/abi";
import { buildUnsignedTxs, maybeApprovalStep, encodeCall, getPublicClient } from "@/lib/prepare";
import { CONTRACTS } from "@/lib/contracts";

export const runtime = "nodejs";

/**
 * POST /api/agents/invoke/prepare
 * { "from": "0x…", "agentId": "0x…" }
 *
 * Returns unsigned txs to pay and invoke the agent from the caller's own wallet.
 */
export async function POST(req: Request) {
  let body: { from?: string; agentId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { from, agentId } = body;
  if (!from || !isAddress(from)) return NextResponse.json({ error: "valid from address required" }, { status: 400 });
  if (!agentId?.startsWith("0x")) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const pub = getPublicClient();
  const agent = await pub.readContract({
    address: CONTRACTS.AgentRegistry,
    abi: AgentRegistryAbi,
    functionName: "getAgent",
    args: [agentId as `0x${string}`],
  }) as {
    name: string; endpointURL: string; paymentToken: string;
    pricePerCall: bigint; active: boolean;
  };

  if (!agent.active) return NextResponse.json({ error: "agent_inactive" }, { status: 400 });

  const steps: Array<{ to: `0x${string}`; data: `0x${string}`; description: string }> = [];

  const approval = await maybeApprovalStep(
    from as `0x${string}`,
    agent.paymentToken as `0x${string}`,
    CONTRACTS.AgentRegistry,
    agent.pricePerCall,
    "USDC",
    "AgentRegistry",
  );
  if (approval) steps.push(approval);

  steps.push({
    to: CONTRACTS.AgentRegistry,
    data: encodeCall(AgentRegistryAbi as never, "invokeAgent", [agentId as `0x${string}`]),
    description: `Invoke ${agent.name} — pay ${formatUnits(agent.pricePerCall, 6)} USDC`,
  });

  const txs = await buildUnsignedTxs(from as `0x${string}`, steps);

  return NextResponse.json({
    transactions: txs,
    agent: {
      agentId,
      name: agent.name,
      endpointURL: agent.endpointURL,
      pricePerCall: formatUnits(agent.pricePerCall, 6),
    },
    next: [
      "1. Sign each transaction in order",
      "2. POST signed txs to /api/broadcast",
      `3. POST to /api/agents/invoke with { endpoint, txHash, request } to call ${agent.endpointURL}`,
    ],
  });
}
