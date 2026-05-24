import { NextResponse } from "next/server";
import { parseUnits, formatUnits } from "viem";
import { FluxAMMAbi } from "@/abi";
import { getClients, checkAuth, approveIfNeeded, CONTRACTS, arcTestnet } from "@/lib/server";

export const runtime = "nodejs";

const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
const EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tokenIn = searchParams.get("tokenIn")?.toUpperCase();
  const amount  = searchParams.get("amount");

  if (!tokenIn || !amount) {
    return NextResponse.json({ error: "tokenIn and amount required" }, { status: 400 });
  }

  const tokenInAddr  = tokenIn === "USDC" ? USDC : EURC;
  const amountIn     = parseUnits(amount, 6);

  try {
    const { pub } = getClients();
    const amountOut = await pub.readContract({
      address: CONTRACTS.FluxAMM,
      abi: FluxAMMAbi,
      functionName: "getAmountOut",
      args: [tokenInAddr, amountIn],
    }) as bigint;

    const tokenOut = tokenIn === "USDC" ? "EURC" : "USDC";
    return NextResponse.json({
      tokenIn,
      tokenOut,
      amountIn: amount,
      amountOut: formatUnits(amountOut, 6),
      rate: (Number(amountOut) / Number(amountIn)).toFixed(6),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { tokenIn?: string; amount?: string; slippagePct?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { tokenIn, amount, slippagePct = 1 } = body;
  if (!tokenIn || !amount) return NextResponse.json({ error: "tokenIn and amount required" }, { status: 400 });

  const tokenInAddr = tokenIn.toUpperCase() === "USDC" ? USDC : EURC;
  const amountIn    = parseUnits(amount, 6);

  try {
    const { pub, wallet } = getClients();

    const amountOut = await pub.readContract({
      address: CONTRACTS.FluxAMM,
      abi: FluxAMMAbi,
      functionName: "getAmountOut",
      args: [tokenInAddr, amountIn],
    }) as bigint;

    const minAmountOut = amountOut * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n;

    await approveIfNeeded(tokenInAddr, CONTRACTS.FluxAMM, amountIn);

    const hash = await wallet.writeContract({
      address: CONTRACTS.FluxAMM,
      abi: FluxAMMAbi,
      functionName: "swap",
      args: [tokenInAddr, amountIn, minAmountOut],
      chain: arcTestnet,
    });

    await pub.waitForTransactionReceipt({ hash });

    const tokenOut = tokenIn.toUpperCase() === "USDC" ? "EURC" : "USDC";
    return NextResponse.json({
      ok: true,
      txHash: hash,
      tokenIn: tokenIn.toUpperCase(),
      tokenOut,
      amountIn: amount,
      amountOut: formatUnits(amountOut, 6),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
