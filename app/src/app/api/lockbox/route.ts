import { NextResponse } from "next/server";
import { parseUnits, keccak256, encodePacked, formatUnits } from "viem";
import { LockboxAbi } from "@/abi";
import { getClients, checkAuth, approveIfNeeded, CONTRACTS, arcTestnet } from "@/lib/server";

export const runtime = "nodejs";

const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as `0x${string}`;
const EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as `0x${string}`;

// GET /api/lockbox?lockId=0x… — inspect a lock
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lockId = searchParams.get("lockId") as `0x${string}` | null;
  if (!lockId?.startsWith("0x")) return NextResponse.json({ error: "lockId required" }, { status: 400 });

  const { pub } = getClients();
  const d = await pub.readContract({
    address: CONTRACTS.Lockbox,
    abi: LockboxAbi,
    functionName: "locks",
    args: [lockId],
  }) as readonly [string, string, bigint, bigint, string, boolean, boolean];

  const [depositor, token, amount, expiry, nonceHash, claimed, refunded] = d;
  if (depositor === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json({ error: "lock_not_found" }, { status: 404 });
  }

  const sym = token.toLowerCase() === USDC.toLowerCase() ? "USDC" : "EURC";
  return NextResponse.json({
    lockId,
    depositor,
    token: sym,
    amount: formatUnits(amount, 6),
    expiry: Number(expiry),
    expiresAt: new Date(Number(expiry) * 1000).toISOString(),
    expired: Date.now() >= Number(expiry) * 1000,
    nonceHash,
    claimed,
    refunded,
  });
}

// POST /api/lockbox — create a lock
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { token?: string; amount?: string; expiryHours?: number; nonce?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { token = "USDC", amount, expiryHours = 24, nonce } = body;
  if (!amount) return NextResponse.json({ error: "amount required" }, { status: 400 });

  const tokenAddr   = token.toUpperCase() === "USDC" ? USDC : EURC;
  const amountUnits = parseUnits(amount, 6);
  const expirySec   = BigInt(Math.floor(Date.now() / 1000) + expiryHours * 3600);

  // Generate or accept a nonce
  const nonceBytes  = nonce ?? `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("")}`;
  const nonceHash   = keccak256(encodePacked(["bytes32"], [nonceBytes as `0x${string}`]));

  try {
    const { pub, wallet } = getClients();
    await approveIfNeeded(tokenAddr, CONTRACTS.Lockbox, amountUnits);

    const hash = await wallet.writeContract({
      address: CONTRACTS.Lockbox,
      abi: LockboxAbi,
      functionName: "deposit",
      args: [tokenAddr, amountUnits, nonceHash, expirySec],
      chain: arcTestnet,
    });

    const receipt = await pub.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find(l => l.address.toLowerCase() === CONTRACTS.Lockbox.toLowerCase());
    const lockId = (log?.topics[1] ?? "0x") as `0x${string}`;

    return NextResponse.json({
      ok: true,
      txHash: hash,
      lockId,
      nonce: nonceBytes,
      claimUrl: `${process.env.NEXT_PUBLIC_RPC_URL ? "" : "https://your-helix-app.com"}/lockbox?lockId=${lockId}&claim=${nonceBytes}`,
      expiresAt: new Date(Number(expirySec) * 1000).toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
