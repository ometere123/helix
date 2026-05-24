import { NextResponse } from "next/server";
import { parseUnits, keccak256, encodePacked, isAddress } from "viem";
import { LockboxAbi } from "@/abi";
import { buildUnsignedTxs, maybeApprovalStep, encodeCall } from "@/lib/prepare";
import { CONTRACTS } from "@/lib/contracts";

export const runtime = "nodejs";

const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
const EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`;

/**
 * POST /api/lockbox/prepare
 * { "from": "0x…", "token": "USDC", "amount": "50", "expiryHours": 24 }
 *
 * Returns unsigned txs + the nonce (secret). Keep the nonce — it's needed to claim.
 */
export async function POST(req: Request) {
  let body: { from?: string; token?: string; amount?: string; expiryHours?: number; nonce?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { from, token = "USDC", amount, expiryHours = 24, nonce: providedNonce } = body;
  if (!from || !isAddress(from)) return NextResponse.json({ error: "valid from address required" }, { status: 400 });
  if (!amount) return NextResponse.json({ error: "amount required" }, { status: 400 });

  const tokenAddr   = token.toUpperCase() === "USDC" ? USDC : EURC;
  const amountUnits = parseUnits(amount, 6);
  const expirySec   = BigInt(Math.floor(Date.now() / 1000) + (expiryHours ?? 24) * 3600);

  const nonce = providedNonce ?? `0x${Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    b => b.toString(16).padStart(2, "0")
  ).join("")}`;
  const nonceHash = keccak256(encodePacked(["bytes32"], [nonce as `0x${string}`]));

  const steps: Array<{ to: `0x${string}`; data: `0x${string}`; description: string }> = [];

  const approval = await maybeApprovalStep(
    from as `0x${string}`, tokenAddr, CONTRACTS.Lockbox, amountUnits,
    token.toUpperCase(), "Lockbox",
  );
  if (approval) steps.push(approval);

  steps.push({
    to: CONTRACTS.Lockbox,
    data: encodeCall(LockboxAbi as never, "deposit", [tokenAddr, amountUnits, nonceHash, expirySec]),
    description: `Lock ${amount} ${token.toUpperCase()} for ${expiryHours}h`,
  });

  const txs = await buildUnsignedTxs(from as `0x${string}`, steps);

  return NextResponse.json({
    transactions: txs,
    nonce,
    expiresAt: new Date(Number(expirySec) * 1000).toISOString(),
    warning: "Save the nonce — it is the secret key to claim these funds. It will not be shown again.",
    next: "Sign each transaction in order, then POST signed txs to /api/broadcast",
  });
}
