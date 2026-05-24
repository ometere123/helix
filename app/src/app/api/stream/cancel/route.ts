import { NextResponse } from "next/server";
import { StreamlineAbi } from "@/abi";
import { getClients, checkAuth, CONTRACTS, arcTestnet } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { scheduleId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { scheduleId } = body;
  if (!scheduleId?.startsWith("0x")) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });

  try {
    const { pub, wallet } = getClients();
    const hash = await wallet.writeContract({
      address: CONTRACTS.Streamline,
      abi: StreamlineAbi,
      functionName: "cancelSchedule",
      args: [scheduleId as `0x${string}`],
      chain: arcTestnet,
    });
    await pub.waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, txHash: hash });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
