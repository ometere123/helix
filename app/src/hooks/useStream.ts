"use client";

import { useCallback } from "react";
import { useReadContract, useWalletClient, usePublicClient } from "wagmi";
import type { Address, Hash } from "viem";
import { StreamlineAbi } from "@/abi";
import { CONTRACTS } from "@/lib/contracts";
import { useApproveAndAct } from "./useApproveAndAct";

export function useSchedule(scheduleId: `0x${string}` | undefined) {
  const { data, refetch } = useReadContract({
    address: CONTRACTS.Streamline,
    abi: StreamlineAbi,
    functionName: "getSchedule",
    args: scheduleId ? [scheduleId] : undefined,
    query: { enabled: !!scheduleId, refetchInterval: 3_000 },
  });
  return { schedule: data as ScheduleStruct | undefined, refetch };
}

export interface ScheduleStruct {
  payer: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  interval: bigint;
  remaining: bigint;
  lastExecutedAt: bigint;
  cancelled: boolean;
}

export function useStreamActions() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const approve = useApproveAndAct();

  const createSchedule = useCallback(
    async (
      recipient: Address,
      token: Address,
      amount: bigint,
      interval: bigint,
      totalPayments: bigint,
    ): Promise<{ hash: Hash; scheduleId: `0x${string}` } | undefined> => {
      if (!walletClient || !publicClient) throw new Error("Wallet not connected");
      const totalApproval = amount * totalPayments;

      let resultHash: Hash | undefined;
      await approve.run({
        token,
        spender: CONTRACTS.Streamline,
        amount: totalApproval,
        action: async () => {
          const hash = await walletClient.writeContract({
            address: CONTRACTS.Streamline,
            abi: StreamlineAbi,
            functionName: "createSchedule",
            args: [recipient, token, amount, interval, totalPayments],
            chain: walletClient.chain,
            account: walletClient.account,
          });
          resultHash = hash;
          return hash;
        },
      });

      if (!resultHash) return undefined;
      const receipt = await publicClient.waitForTransactionReceipt({ hash: resultHash });
      const log = receipt.logs.find((l) => l.address.toLowerCase() === CONTRACTS.Streamline.toLowerCase());
      const scheduleId = (log?.topics[1] ?? "0x") as `0x${string}`;
      return { hash: resultHash, scheduleId };
    },
    [walletClient, publicClient, approve],
  );

  const cancelSchedule = useCallback(
    async (scheduleId: `0x${string}`): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Streamline,
        abi: StreamlineAbi,
        functionName: "cancelSchedule",
        args: [scheduleId],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  return {
    phase: approve.phase,
    error: approve.error,
    hash: approve.hash,
    reset: approve.reset,
    createSchedule,
    cancelSchedule,
  };
}

/** Calls /api/crank to trigger one server-side payment execution. */
export async function crank(scheduleId: `0x${string}`): Promise<unknown> {
  const res = await fetch("/api/crank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduleId }),
  });
  return res.json();
}
