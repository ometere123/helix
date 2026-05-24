import { NextResponse } from "next/server";
import { parseUnits, formatUnits, isAddress } from "viem";
import { StreamlineAbi } from "@/abi";
import { getClients, checkAuth, approveIfNeeded, CONTRACTS, arcTestnet } from "@/lib/server";

export const runtime = "nodejs";

const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
const EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`;

// GET /api/stream?scheduleId=0x… — inspect a stream
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("scheduleId") as `0x${string}` | null;
  if (!scheduleId?.startsWith("0x")) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });

  const { pub } = getClients();
  const s = await pub.readContract({
    address: CONTRACTS.Streamline,
    abi: StreamlineAbi,
    functionName: "getSchedule",
    args: [scheduleId],
  }) as { payer: string; recipient: string; token: string; amount: bigint; interval: bigint; remaining: bigint; lastExecutedAt: bigint; cancelled: boolean };

  if (s.payer === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ error: "schedule_not_found" }, { status: 404 });
  }

  const sym = s.token.toLowerCase() === USDC.toLowerCase() ? "USDC" : "EURC";
  return NextResponse.json({
    scheduleId,
    payer: s.payer,
    recipient: s.recipient,
    token: sym,
    amountPerPayment: formatUnits(s.amount, 6),
    intervalSeconds: Number(s.interval),
    remaining: Number(s.remaining),
    lastExecutedAt: Number(s.lastExecutedAt),
    cancelled: s.cancelled,
  });
}

// POST /api/stream — create a payment stream
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { recipient?: string; token?: string; amountPerPayment?: string; intervalSeconds?: number; totalPayments?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { recipient, token = "USDC", amountPerPayment, intervalSeconds = 3600, totalPayments = 10 } = body;

  if (!recipient || !isAddress(recipient)) return NextResponse.json({ error: "valid recipient address required" }, { status: 400 });
  if (!amountPerPayment) return NextResponse.json({ error: "amountPerPayment required" }, { status: 400 });

  const tokenAddr    = token.toUpperCase() === "USDC" ? USDC : EURC;
  const amountUnits  = parseUnits(amountPerPayment, 6);
  const totalApproval = amountUnits * BigInt(totalPayments);

  try {
    const { pub, wallet } = getClients();
    await approveIfNeeded(tokenAddr, CONTRACTS.Streamline, totalApproval);

    const hash = await wallet.writeContract({
      address: CONTRACTS.Streamline,
      abi: StreamlineAbi,
      functionName: "createSchedule",
      args: [recipient as `0x${string}`, tokenAddr, amountUnits, BigInt(intervalSeconds), BigInt(totalPayments)],
      chain: arcTestnet,
    });

    const receipt = await pub.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find(l => l.address.toLowerCase() === CONTRACTS.Streamline.toLowerCase());
    const scheduleId = (log?.topics[1] ?? "0x") as `0x${string}`;

    return NextResponse.json({
      ok: true,
      txHash: hash,
      scheduleId,
      recipient,
      token: token.toUpperCase(),
      amountPerPayment,
      intervalSeconds,
      totalPayments,
      totalLocked: formatUnits(totalApproval, 6),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
