"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hash } from "viem";
import { erc20MinimalAbi } from "@/lib/tokens";

export type ApproveAndActPhase = "idle" | "approving" | "acting" | "success" | "error";

export interface ApproveAndActOptions {
  token: Address;
  spender: Address;
  amount: bigint;
  /** Action to run after approval is sufficient. Should return the action tx hash. */
  action: () => Promise<Hash>;
  /** Called with the confirmed action hash on success — use to record activity. */
  onSuccess?: (hash: Hash) => void;
}

/**
 * Run a 2-step approve → action flow with minimal allowance checks.
 * Skips the approve tx when current allowance already covers the amount.
 */
export function useApproveAndAct() {
  const [phase, setPhase] = useState<ApproveAndActPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hash | null>(null);

  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const run = useCallback(
    async ({ token, spender, amount, action, onSuccess }: ApproveAndActOptions) => {
      setError(null);
      setHash(null);
      if (!address || !walletClient || !publicClient) {
        setError("Wallet not connected");
        setPhase("error");
        return;
      }
      try {
        const allowance = (await publicClient.readContract({
          address: token,
          abi: erc20MinimalAbi,
          functionName: "allowance",
          args: [address, spender],
        })) as bigint;

        if (allowance < amount) {
          setPhase("approving");
          const approveHash = await walletClient.writeContract({
            address: token,
            abi: erc20MinimalAbi,
            functionName: "approve",
            args: [spender, amount],
            chain: walletClient.chain,
            account: walletClient.account,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }

        setPhase("acting");
        const actHash = await action();
        await publicClient.waitForTransactionReceipt({ hash: actHash });
        setHash(actHash);
        setPhase("success");
        onSuccess?.(actHash);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
      }
    },
    [address, walletClient, publicClient],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setHash(null);
  }, []);

  return { phase, error, hash, run, reset, chainId };
}
