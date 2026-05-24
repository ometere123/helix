"use client";

import { useCallback } from "react";
import { useReadContract, useWalletClient, usePublicClient } from "wagmi";
import type { Address, Hash } from "viem";
import { AgentRegistryAbi } from "@/abi";
import { CONTRACTS } from "@/lib/contracts";
import { useApproveAndAct } from "./useApproveAndAct";

export interface AgentStruct {
  owner: Address;
  name: string;
  endpointURL: string;
  metadataURI: string; // x402 v2 payment manifest URI
  capabilities: readonly string[];
  paymentToken: Address;
  pricePerCall: bigint;
  active: boolean;
  totalEarned: bigint;
  totalCalls: bigint;
}

export function useAgent(agentId: `0x${string}` | undefined) {
  const { data, refetch } = useReadContract({
    address: CONTRACTS.AgentRegistry,
    abi: AgentRegistryAbi,
    functionName: "getAgent",
    args: agentId ? [agentId] : undefined,
    query: { enabled: !!agentId, refetchInterval: 10_000 },
  });
  return { agent: data as AgentStruct | undefined, refetch };
}

export function useAgentList(offset = 0n, limit = 50n) {
  const { data, refetch } = useReadContract({
    address: CONTRACTS.AgentRegistry,
    abi: AgentRegistryAbi,
    functionName: "listAgents",
    args: [offset, limit],
    query: { refetchInterval: 15_000 },
  });
  return { ids: (data as readonly `0x${string}`[] | undefined) ?? [], refetch };
}

export function useAgentRegistryActions() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const approve = useApproveAndAct();

  const register = useCallback(
    async (
      name: string,
      endpointURL: string,
      metadataURI: string,
      capabilities: string[],
      paymentToken: Address,
      pricePerCall: bigint,
    ): Promise<{ hash: Hash; agentId: `0x${string}` } | undefined> => {
      if (!walletClient || !publicClient) throw new Error("Wallet not connected");
      const hash = await walletClient.writeContract({
        address: CONTRACTS.AgentRegistry,
        abi: AgentRegistryAbi,
        functionName: "registerAgent",
        args: [name, endpointURL, metadataURI, capabilities, paymentToken, pricePerCall],
        chain: walletClient.chain,
        account: walletClient.account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const log = receipt.logs.find((l) => l.address.toLowerCase() === CONTRACTS.AgentRegistry.toLowerCase());
      const agentId = (log?.topics[1] ?? "0x") as `0x${string}`;
      return { hash, agentId };
    },
    [walletClient, publicClient],
  );

  const invoke = useCallback(
    async (agentId: `0x${string}`, paymentToken: Address, price: bigint): Promise<Hash | undefined> => {
      if (!walletClient) throw new Error("Wallet not connected");
      let invokeHash: Hash | undefined;
      await approve.run({
        token: paymentToken,
        spender: CONTRACTS.AgentRegistry,
        amount: price,
        action: async () => {
          const h = await walletClient.writeContract({
            address: CONTRACTS.AgentRegistry,
            abi: AgentRegistryAbi,
            functionName: "invokeAgent",
            args: [agentId],
            chain: walletClient.chain,
            account: walletClient.account,
          });
          invokeHash = h;
          return h;
        },
      });
      return invokeHash;
    },
    [walletClient, approve],
  );

  const update = useCallback(
    async (agentId: `0x${string}`, endpointURL: string, metadataURI: string, pricePerCall: bigint): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.AgentRegistry,
        abi: AgentRegistryAbi,
        functionName: "updateAgent",
        args: [agentId, endpointURL, metadataURI, pricePerCall],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  const setActive = useCallback(
    async (agentId: `0x${string}`, active: boolean): Promise<Hash> => {
      if (!walletClient) throw new Error("Wallet not connected");
      return walletClient.writeContract({
        address: CONTRACTS.AgentRegistry,
        abi: AgentRegistryAbi,
        functionName: "setActive",
        args: [agentId, active],
        chain: walletClient.chain,
        account: walletClient.account,
      });
    },
    [walletClient],
  );

  return {
    phase: approve.phase,
    error: approve.error,
    reset: approve.reset,
    register,
    invoke,
    update,
    setActive,
  };
}
