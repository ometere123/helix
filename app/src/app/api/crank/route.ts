import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/chain";
import { CONTRACTS } from "@/lib/contracts";
import { StreamlineAbi } from "@/abi";

export const runtime = "nodejs";

interface Body {
  scheduleId?: `0x${string}`;
}

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.arc.network";

function getCrankClients() {
  const pk = process.env.CRANK_PRIVATE_KEY;
  if (!pk) throw new Error("CRANK_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(pk as `0x${string}`);
  const transport = http(RPC_URL);
  return {
    publicClient: createPublicClient({ chain: arcTestnet, transport }),
    walletClient: createWalletClient({ account, chain: arcTestnet, transport }),
    account,
  };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { scheduleId } = body;
  if (!scheduleId || !scheduleId.startsWith("0x") || scheduleId.length !== 66) {
    return NextResponse.json({ error: "invalid_schedule_id" }, { status: 400 });
  }

  let clients;
  try {
    clients = getCrankClients();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const { publicClient, walletClient } = clients;

  // Pre-flight: read schedule, decide whether to skip
  try {
    const schedule = (await publicClient.readContract({
      address: CONTRACTS.Streamline,
      abi: StreamlineAbi,
      functionName: "getSchedule",
      args: [scheduleId],
    })) as {
      payer: string;
      remaining: bigint;
      lastExecutedAt: bigint;
      interval: bigint;
      cancelled: boolean;
    };

    if (schedule.payer === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ skipped: true, reason: "ScheduleNotFound" });
    }
    if (schedule.cancelled) {
      return NextResponse.json({ skipped: true, reason: "ScheduleCancelled" });
    }
    if (schedule.remaining === 0n) {
      return NextResponse.json({ skipped: true, reason: "ScheduleComplete" });
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < schedule.lastExecutedAt + schedule.interval) {
      const waitFor = Number(schedule.lastExecutedAt + schedule.interval - now);
      return NextResponse.json({ skipped: true, reason: "IntervalNotElapsed", waitForSeconds: waitFor });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "preflight_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  // Execute
  let hash: Hash;
  try {
    hash = await walletClient.writeContract({
      address: CONTRACTS.Streamline,
      abi: StreamlineAbi,
      functionName: "executePayment",
      args: [scheduleId],
      chain: arcTestnet,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "execute_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  try {
    await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  } catch {
    // Tx was sent but didn't confirm in time — still return success-ish so the UI can keep polling
    return NextResponse.json({ ok: true, txHash: hash, pending: true });
  }

  return NextResponse.json({ ok: true, txHash: hash });
}
