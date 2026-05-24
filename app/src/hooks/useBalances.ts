"use client";

import { useAccount, useReadContracts } from "wagmi";
import { USDC_ADDRESS, EURC_ADDRESS, erc20MinimalAbi } from "@/lib/tokens";

export function useBalances() {
  const { address } = useAccount();

  const { data, isLoading, refetch } = useReadContracts({
    contracts: address
      ? [
          { address: USDC_ADDRESS, abi: erc20MinimalAbi, functionName: "balanceOf", args: [address] },
          { address: EURC_ADDRESS, abi: erc20MinimalAbi, functionName: "balanceOf", args: [address] },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const usdc = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const eurc = (data?.[1]?.result as bigint | undefined) ?? 0n;

  return { usdc, eurc, isLoading, refetch };
}
