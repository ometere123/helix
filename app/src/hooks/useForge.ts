"use client";

import { useCallback } from "react";
import { useReadContract, useWalletClient, usePublicClient } from "wagmi";
import type { Address, Hash } from "viem";
import { ForgeAbi } from "@/abi";
import { CONTRACTS } from "@/lib/contracts";
import { useApproveAndAct } from "./useApproveAndAct";

export interface BountyStruct {
  poster:          Address;
  token:           Address;
  amount:          bigint;
  metadataURI:     string;
  released:        boolean;
  cancelled:       boolean;
  worker:          Address;
  deliverableHash: `0x${string}`;
  submissionURI:   string;
  submittedAt:     bigint;
}

export function useBounty(bountyId: `0x${string}` | undefined) {
  const { data, refetch } = useReadContract({
    address: CONTRACTS.Forge,
    abi: ForgeAbi,
    functionName: "bounties",
    args: bountyId ? [bountyId] : undefined,
    query: { enabled: !!bountyId },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const bounty: BountyStruct | undefined = d
    ? {
        poster:          d.poster          ?? d[0],
        token:           d.token           ?? d[1],
        amount:          d.amount          ?? d[2],
        metadataURI:     d.metadataURI     ?? d[3],
        released:        d.released        ?? d[4],
        cancelled:       d.cancelled       ?? d[5],
        worker:          d.worker          ?? d[6],
        deliverableHash: d.deliverableHash ?? d[7],
        submissionURI:   d.submissionURI   ?? d[8],
        submittedAt:     d.submittedAt     ?? d[9],
      }
    : undefined;

  return { bounty, refetch };
}

export function useBountyList(offset = 0n, limit = 50n) {
  const { data, refetch } = useReadContract({
    address: CONTRACTS.Forge,
    abi: ForgeAbi,
    functionName: "listBounties",
    args: [offset, limit],
    query: { refetchInterval: 15_000 },
  });
  return { ids: (data as readonly `0x${string}`[] | undefined) ?? [], refetch };
}

export function useForgeActions() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const approve = useApproveAndAct();

  const post = useCallback(
    async (
      token: Address,
      amount: bigint,
      metadataURI: string,
    ): Promise<{ hash: Hash; bountyId: `0x${string}` } | undefined> => {
      if (!walletClient || !publicClient) throw new Error("Wallet not connected");

      let postHash: Hash | undefined;
      await approve.run({
        token,
        spender: CONTRACTS.Forge,
        amount,
        action: async () => {
          const h = await walletClient.writeContract({
            address: CONTRACTS.Forge,
            abi: ForgeAbi,
            functionName: "postBounty",
            args: [token, amount, metadataURI],
            chain: walletClient.chain,
            account: walletClient.account,
          });
          postHash = h;
          return h;
        },
      });
      if (!postHash) return undefined;
      const receipt = await publicClient.waitForTransactionReceipt({ hash: postHash });
      const log = receipt.logs.find((l) => l.address.toLowerCase() === CONTRACTS.Forge.toLowerCase());
      const bountyId = (log?.topics[1] ?? "0x") as `0x${string}`;
      return { hash: postHash, bountyId };
    },
    [walletClient, publicClient, approve],
  );

  // Poster: approve submission and pay the registered worker
  const release = useCallback(
    async (bountyId: `0x${string}`): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Forge,
        abi: ForgeAbi,
        functionName: "releaseBounty",
        args: [bountyId],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  // Poster: reject submission — clears worker slot, bounty reopens
  const dispute = useCallback(
    async (bountyId: `0x${string}`): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Forge,
        abi: ForgeAbi,
        functionName: "disputeWork",
        args: [bountyId],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  // Poster: cancel a bounty with no pending submission
  const cancel = useCallback(
    async (bountyId: `0x${string}`): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Forge,
        abi: ForgeAbi,
        functionName: "cancelBounty",
        args: [bountyId],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  // Worker: submit proof of completion
  const submitWork = useCallback(
    async (
      bountyId: `0x${string}`,
      deliverableHash: `0x${string}`,
      submissionURI: string,
    ): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Forge,
        abi: ForgeAbi,
        functionName: "submitWork",
        args: [bountyId, deliverableHash, submissionURI],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  // Worker: self-collect after DISPUTE_WINDOW (3 days) with no poster response
  const finalizeWork = useCallback(
    async (bountyId: `0x${string}`): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.Forge,
        abi: ForgeAbi,
        functionName: "finalizeWork",
        args: [bountyId],
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
    post,
    release,
    dispute,
    cancel,
    submitWork,
    finalizeWork,
  };
}
