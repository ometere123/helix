import { NextResponse } from "next/server";
import { erc20Abi, parseUnits } from "viem";
import { AgentRegistryAbi } from "@/abi";
import { getClients, checkAuth, approveIfNeeded, CONTRACTS, arcTestnet } from "@/lib/server";

export const runtime = "nodejs";

/**
 * POST /api/agents/invoke
 *
 * Two modes:
 *   1. { agentId, request } — pay on-chain then call the agent's endpoint
 *   2. { endpoint, txHash, request } — call an endpoint with an existing payment proof
 */
export async function POST(req: Request) {
  let body: {
    // Mode 1: full invoke
    agentId?: string;
    request?: unknown;
    // Mode 2: proof-only forward
    endpoint?: string;
    txHash?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  // Mode 2: browser already paid, just forward the request
  if (body.endpoint && body.txHash) {
    return forwardRequest(body.endpoint, body.txHash, body.request);
  }

  // Mode 1: pay on-chain then call endpoint
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { agentId, request } = body;
  if (!agentId?.startsWith("0x")) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  try {
    const { pub, wallet } = getClients();

    const agent = await pub.readContract({
      address: CONTRACTS.AgentRegistry,
      abi: AgentRegistryAbi,
      functionName: "getAgent",
      args: [agentId as `0x${string}`],
    }) as { owner: string; name: string; endpointURL: string; paymentToken: string; pricePerCall: bigint; active: boolean };

    if (!agent.active) return NextResponse.json({ error: "agent_inactive" }, { status: 400 });

    // Check balance
    const balance = await pub.readContract({
      address: agent.paymentToken as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.account.address],
    }) as bigint;

    if (balance < agent.pricePerCall) {
      return NextResponse.json({
        error: "insufficient_balance",
        required: agent.pricePerCall.toString(),
        available: balance.toString(),
      }, { status: 400 });
    }

    await approveIfNeeded(agent.paymentToken as `0x${string}`, CONTRACTS.AgentRegistry, agent.pricePerCall);

    const hash = await wallet.writeContract({
      address: CONTRACTS.AgentRegistry,
      abi: AgentRegistryAbi,
      functionName: "invokeAgent",
      args: [agentId as `0x${string}`],
      chain: arcTestnet,
    });
    await pub.waitForTransactionReceipt({ hash });

    const endpointRes = await forwardRequest(agent.endpointURL, hash, request);
    const endpointData = await endpointRes.json();

    return NextResponse.json({
      ok: true,
      txHash: hash,
      agentId,
      agentName: agent.name,
      endpoint: agent.endpointURL,
      pricePaid: parseUnits("0", 6) === 0n ? agent.pricePerCall.toString() : agent.pricePerCall.toString(),
      response: endpointData,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

async function forwardRequest(endpoint: string, txHash: string, request: unknown): Promise<Response> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment-TxHash": txHash,
        "X-Payment-Chain": process.env.NEXT_PUBLIC_CHAIN_ID ?? "5042002",
        "X-Payment-Token": process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "",
      },
      body: JSON.stringify(request ?? {}),
      signal: AbortSignal.timeout(30_000),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json") ? await res.json() : await res.text();

    return NextResponse.json({ status: res.status, ok: res.ok, body: responseBody });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fetch failed" }, { status: 502 });
  }
}
