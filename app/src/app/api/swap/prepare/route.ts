import { NextResponse } from "next/server";
import { parseUnits, formatUnits, isAddress } from "viem";
import { FluxAMMAbi } from "@/abi";
import { buildUnsignedTxs, maybeApprovalStep, encodeCall, getPublicClient } from "@/lib/prepare";
import { CONTRACTS } from "@/lib/contracts";

export const runtime = "nodejs";

const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
const EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`;

/**
 * POST /api/swap/prepare
 * { "from": "0x…", "tokenIn": "USDC", "amount": "10", "slippagePct": 1 }
 *
 * Returns unsigned transactions to sign and send to /api/broadcast.
 * May return 1 tx (swap only) or 2 txs (approve + swap) depending on allowance.
 */
export async function POST(req: Request) {
  let body: { from?: string; tokenIn?: string; amount?: string; slippagePct?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { from, tokenIn, amount, slippagePct = 1 } = body;
  if (!from || !isAddress(from)) return NextResponse.json({ error: "valid from address required" }, { status: 400 });
  if (!tokenIn || !amount) return NextResponse.json({ error: "tokenIn and amount required" }, { status: 400 });

  const tokenInAddr  = tokenIn.toUpperCase() === "USDC" ? USDC : EURC;
  const tokenOutSym  = tokenIn.toUpperCase() === "USDC" ? "EURC" : "USDC";
  const amountIn     = parseUnits(amount, 6);

  const pub = getPublicClient();
  const amountOut = await pub.readContract({
    address: CONTRACTS.FluxAMM,
    abi: FluxAMMAbi,
    functionName: "getAmountOut",
    args: [tokenInAddr, amountIn],
  }) as bigint;

  const minAmountOut = amountOut * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n;

  const steps: Array<{ to: `0x${string}`; data: `0x${string}`; description: string }> = [];

  const approval = await maybeApprovalStep(
    from as `0x${string}`, tokenInAddr, CONTRACTS.FluxAMM, amountIn,
    tokenIn.toUpperCase(), "FluxAMM",
  );
  if (approval) steps.push(approval);

  steps.push({
    to: CONTRACTS.FluxAMM,
    data: encodeCall(FluxAMMAbi as never, "swap", [tokenInAddr, amountIn, minAmountOut]),
    description: `Swap ${amount} ${tokenIn.toUpperCase()} → ~${formatUnits(amountOut, 6)} ${tokenOutSym}`,
  });

  const txs = await buildUnsignedTxs(from as `0x${string}`, steps);

  return NextResponse.json({
    transactions: txs,
    quote: {
      tokenIn: tokenIn.toUpperCase(),
      tokenOut: tokenOutSym,
      amountIn: amount,
      amountOut: formatUnits(amountOut, 6),
      minAmountOut: formatUnits(minAmountOut, 6),
      slippagePct,
    },
    next: "Sign each transaction in order, then POST all signed txs to /api/broadcast",
  });
}
