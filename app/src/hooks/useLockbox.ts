"use client";

import { useCallback } from "react";
import { useReadContract, useWalletClient, usePublicClient } from "wagmi";
import { keccak256, encodePacked, type Address, type Hash } from "viem";
import { LockboxAbi } from "@/abi";
import { CONTRACTS } from "@/lib/contracts";
import { useApproveAndAct } from "./useApproveAndAct";

export interface LockStruct {
  depositor: Address;
  token: Address;
  amount: bigint;
  expiry: bigint;
  nonceHash: `0x${string}`;
  claimed: boolean;
  refunded: boolean;
}

export function useLock(lockId: `0x${string}` | undefined) {
  const { data, refetch } = useReadContract({
    address: CONTRACTS.Lockbox,
    abi: LockboxAbi,
    functionName: "locks",
    args: lockId ? [lockId] : undefined,
    query: { enabled: !!lockId, refetchInterval: 8_000 },
  });

  // viem returns the public mapping tuple as a positional array.
  // Named properties are not guaranteed — map explicitly by index.
  let lock: LockStruct | undefined;
  if (data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    lock = {
      depositor:  d.depositor  ?? d[0],
      token:      d.token      ?? d[1],
      amount:     d.amount     ?? d[2],
      expiry:     d.expiry     ?? d[3],
      nonceHash:  d.nonceHash  ?? d[4],
      claimed:    d.claimed    ?? d[5],
      refunded:   d.refunded   ?? d[6],
    };
  }

  return { lock, refetch };
}

export function useLockboxActions() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const approve = useApproveAndAct();

  const deposit = useCallback(
    async (
      token: Address,
      amount: bigint,
      nonce: `0x${string}`,
      expirySeconds: bigint,
    ): Promise<{ hash: Hash; lockId: `0x${string}`; nonce: `0x${string}` } | undefined> => {
      if (!walletClient || !publicClient) throw new Error("Wallet not connected");
      const nonceHash = keccak256(encodePacked(["bytes32"], [nonce]));

      let depositHash: Hash | undefined;
      await approve.run({
        token,
        spender: CONTRACTS.Lockbox,
        amount,
        action: async () => {
          const h = await walletClient.writeContract({
            address: CONTRACTS.Lockbox,
            abi: LockboxAbi,
            functionName: "deposit",
            args: [token, amount, nonceHash, expirySeconds],
            chain: walletClient.chain,
            account: walletClient.account,
          });
          depositHash = h;
          return h;
        },
      });

      if (!depositHash) return undefined;
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
      const log = receipt.logs.find((l) => l.address.toLowerCase() === CONTRACTS.Lockbox.toLowerCase());
      const lockId = (log?.topics[1] ?? "0x") as `0x${string}`;
      return { hash: depositHash, lockId, nonce };
    },
    [walletClient, publicClient, approve],
  );

  const claim = useCallback(
    async (lockId: `0x${string}`, nonce: `0x${string}`): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Lockbox,
        abi: LockboxAbi,
        functionName: "claim",
        args: [lockId, nonce],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  const refund = useCallback(
    async (lockId: `0x${string}`): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Lockbox,
        abi: LockboxAbi,
        functionName: "refund",
        args: [lockId],
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
    deposit,
    claim,
    refund,
  };
}

/** Generate a fresh 32-byte random nonce. */
export function generateNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}` as `0x${string}`;
}
