import { NextResponse } from "next/server";
import { parseUnits, formatUnits, isAddress } from "viem";
import { StreamlineAbi } from "@/abi";
import { buildUnsignedTxs, maybeApprovalStep, encodeCall } from "@/lib/prepare";
import { CONTRACTS } from "@/lib/contracts";

export const runtime = "nodejs";

const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
const EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`;

/**
 * POST /api/stream/prepare
 * { "from": "0x…", "recipient": "0x…", "token": "USDC",
 *   "amountPerPayment": "10", "intervalSeconds": 3600, "totalPayments": 10 }
 */
export async function POST(req: Request) {
  let body: {
    from?: string; recipient?: string; token?: string;
    amountPerPayment?: string; intervalSeconds?: number; totalPayments?: number;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { from, recipient, token = "USDC", amountPerPayment, intervalSeconds = 3600, totalPayments = 10 } = body;
  if (!from || !isAddress(from)) return NextResponse.json({ error: "valid from address required" }, { status: 400 });
  if (!recipient || !isAddress(recipient)) return NextResponse.json({ error: "valid recipient address required" }, { status: 400 });
  if (!amountPerPayment) return NextResponse.json({ error: "amountPerPayment required" }, { status: 400 });

  const tokenAddr    = token.toUpperCase() === "USDC" ? USDC : EURC;
  const amountUnits  = parseUnits(amountPerPayment, 6);
  const totalApproval = amountUnits * BigInt(totalPayments);

  const steps: Array<{ to: `0x${string}`; data: `0x${string}`; description: string }> = [];

  const approval = await maybeApprovalStep(
    from as `0x${string}`, tokenAddr, CONTRACTS.Streamline, totalApproval,
    token.toUpperCase(), "Streamline",
  );
  if (approval) steps.push(approval);

  steps.push({
    to: CONTRACTS.Streamline,
    data: encodeCall(StreamlineAbi as never, "createSchedule", [
      recipient as `0x${string}`, tokenAddr, amountUnits, BigInt(intervalSeconds), BigInt(totalPayments),
    ]),
    description: `Stream ${amountPerPayment} ${token.toUpperCase()} every ${intervalSeconds}s × ${totalPayments} payments`,
  });

  const txs = await buildUnsignedTxs(from as `0x${string}`, steps);

  return NextResponse.json({
    transactions: txs,
    summary: {
      recipient,
      token: token.toUpperCase(),
      amountPerPayment,
      intervalSeconds,
      totalPayments,
      totalLocked: formatUnits(totalApproval, 6),
    },
    next: "Sign each transaction in order, then POST signed txs to /api/broadcast",
  });
}
