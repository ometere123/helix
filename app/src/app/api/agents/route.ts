import { NextResponse } from "next/server";
import { parseUnits, formatUnits, isAddress } from "viem";
import { AgentRegistryAbi } from "@/abi";
import { getClients, checkAuth, CONTRACTS, arcTestnet } from "@/lib/server";

export const runtime = "nodejs";

const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
const EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`;

// GET /api/agents — list all registered agents
export async function GET() {
  const { pub } = getClients();

  const total = await pub.readContract({
    address: CONTRACTS.AgentRegistry,
    abi: AgentRegistryAbi,
    functionName: "totalAgents",
  }) as bigint;

  const ids = await pub.readContract({
    address: CONTRACTS.AgentRegistry,
    abi: AgentRegistryAbi,
    functionName: "listAgents",
    args: [0n, total],
  }) as readonly `0x${string}`[];

  const agents = await Promise.all(
    ids.map(async (id) => {
      const a = await pub.readContract({
        address: CONTRACTS.AgentRegistry,
        abi: AgentRegistryAbi,
        functionName: "getAgent",
        args: [id],
      }) as {
        owner: string; name: string; endpointURL: string; metadataURI: string;
        capabilities: readonly string[]; paymentToken: string;
        pricePerCall: bigint; active: boolean; totalEarned: bigint; totalCalls: bigint;
      };
      const sym = a.paymentToken.toLowerCase() === USDC.toLowerCase() ? "USDC" : "EURC";
      return {
        agentId: id,
        name: a.name,
        owner: a.owner,
        endpointURL: a.endpointURL,
        metadataURI: a.metadataURI,
        capabilities: [...a.capabilities],
        paymentToken: sym,
        pricePerCall: formatUnits(a.pricePerCall, 6),
        active: a.active,
        totalCalls: Number(a.totalCalls),
        totalEarned: formatUnits(a.totalEarned, 6),
      };
    })
  );

  return NextResponse.json({ agents, total: Number(total) });
}

// POST /api/agents — register a new agent
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    name?: string; endpointURL?: string; metadataURI?: string;
    capabilities?: string[]; paymentToken?: string; pricePerCall?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { name, endpointURL, metadataURI = "", capabilities = [], paymentToken = "USDC", pricePerCall = "0.10" } = body;

  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!endpointURL?.startsWith("http")) return NextResponse.json({ error: "valid endpointURL required" }, { status: 400 });
  if (capabilities.length === 0) return NextResponse.json({ error: "at least one capability required" }, { status: 400 });

  const tokenAddr = isAddress(paymentToken)
    ? paymentToken as `0x${string}`
    : paymentToken.toUpperCase() === "EURC" ? EURC : USDC;

  const price = parseUnits(pricePerCall, 6);

  try {
    const { pub, wallet } = getClients();
    const hash = await wallet.writeContract({
      address: CONTRACTS.AgentRegistry,
      abi: AgentRegistryAbi,
      functionName: "registerAgent",
      args: [name, endpointURL, metadataURI, capabilities, tokenAddr, price],
      chain: arcTestnet,
    });

    const receipt = await pub.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find(l => l.address.toLowerCase() === CONTRACTS.AgentRegistry.toLowerCase());
    const agentId = (log?.topics[1] ?? "0x") as `0x${string}`;

    return NextResponse.json({ ok: true, txHash: hash, agentId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
