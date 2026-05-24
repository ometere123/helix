import { NextResponse } from "next/server";
import { getPublicClient } from "@/lib/prepare";

export const runtime = "nodejs";

/**
 * POST /api/broadcast
 * { "signedTxs": ["0x...", "0x..."] }
 *
 * Broadcasts signed raw transactions in order, waiting for each to confirm
 * before sending the next. Required for approval → action sequences.
 */
export async function POST(req: Request) {
  let body: { signedTxs?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { signedTxs } = body;
  if (!Array.isArray(signedTxs) || signedTxs.length === 0) {
    return NextResponse.json({ error: "signedTxs array required" }, { status: 400 });
  }
  if (signedTxs.length > 5) {
    return NextResponse.json({ error: "max 5 transactions per broadcast" }, { status: 400 });
  }

  const pub = getPublicClient();
  const results: Array<{ txHash: string; confirmed: boolean }> = [];

  for (const raw of signedTxs) {
    if (!raw.startsWith("0x")) {
      return NextResponse.json({ error: `invalid signed tx: ${raw.slice(0, 20)}…` }, { status: 400 });
    }
    try {
      const hash = await pub.sendRawTransaction({ serializedTransaction: raw as `0x${string}` });
      await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
      results.push({ txHash: hash, confirmed: true });
    } catch (e) {
      return NextResponse.json({
        error: e instanceof Error ? e.message : String(e),
        broadcastSoFar: results,
      }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, transactions: results });
}
