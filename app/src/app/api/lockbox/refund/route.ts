import { NextResponse } from "next/server";
import { LockboxAbi } from "@/abi";
import { getClients, checkAuth, CONTRACTS, arcTestnet } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { lockId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { lockId } = body;
  if (!lockId?.startsWith("0x")) {
    return NextResponse.json({ error: "lockId required (0x-prefixed)" }, { status: 400 });
  }

  try {
    const { pub, wallet } = getClients();
    const hash = await wallet.writeContract({
      address: CONTRACTS.Lockbox,
      abi: LockboxAbi,
      functionName: "refund",
      args: [lockId as `0x${string}`],
      chain: arcTestnet,
    });
    await pub.waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, txHash: hash });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
