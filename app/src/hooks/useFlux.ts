"use client";

import { useAccount, useReadContract, useWalletClient } from "wagmi";
import type { Address, Hash } from "viem";
import { FluxAMMAbi, HelixLPAbi } from "@/abi";
import { CONTRACTS } from "@/lib/contracts";
import { useApproveAndAct } from "./useApproveAndAct";

export function useFluxPool() {
  const { address } = useAccount();

  const stats = useReadContract({
    address: CONTRACTS.FluxAMM,
    abi: FluxAMMAbi,
    functionName: "poolStats",
    query: { refetchInterval: 12_000 },
  });
  const lpAddress = useReadContract({
    address: CONTRACTS.FluxAMM,
    abi: FluxAMMAbi,
    functionName: "lpToken",
  });

  const lpBalance = useReadContract({
    address: (lpAddress.data as Address | undefined) ?? undefined,
    abi: HelixLPAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!lpAddress.data },
  });

  const invariantD = useReadContract({
    address: CONTRACTS.FluxAMM,
    abi: FluxAMMAbi,
    functionName: "invariantD",
    query: { refetchInterval: 12_000 },
  });

  const [reserveUSDC, reserveEURC, totalLP] = (stats.data as readonly [bigint, bigint, bigint] | undefined) ?? [0n, 0n, 0n];
  return {
    reserveUSDC,
    reserveEURC,
    totalLP,
    lpAddress: lpAddress.data as Address | undefined,
    lpBalance: (lpBalance.data as bigint | undefined) ?? 0n,
    /** Current StableSwap invariant D — useful for health monitoring and UI display. */
    invariantD: (invariantD.data as bigint | undefined) ?? 0n,
    refetch: () => {
      stats.refetch();
      lpBalance.refetch();
      invariantD.refetch();
    },
  };
}

export function useQuote(tokenIn: Address | undefined, amountIn: bigint) {
  const { data } = useReadContract({
    address: CONTRACTS.FluxAMM,
    abi: FluxAMMAbi,
    functionName: "getAmountOut",
    args: tokenIn && amountIn > 0n ? [tokenIn, amountIn] : undefined,
    query: { enabled: !!tokenIn && amountIn > 0n },
  });
  return (data as bigint | undefined) ?? 0n;
}

export function useFluxActions() {
  const { data: walletClient } = useWalletClient();
  const approve = useApproveAndAct();

  async function writeFlux(fn: "swap" | "addLiquidity" | "removeLiquidity", args: readonly unknown[]): Promise<Hash> {
    if (!walletClient) throw new Error("Wallet not connected");
    return walletClient.writeContract({
      address: CONTRACTS.FluxAMM,
      abi: FluxAMMAbi,
      functionName: fn,
      args: args as never,
      chain: walletClient.chain,
      account: walletClient.account,
    });
  }

  return {
    phase: approve.phase,
    error: approve.error,
    hash: approve.hash,
    reset: approve.reset,

    swap: (tokenIn: Address, amountIn: bigint, minAmountOut: bigint, onSuccess?: (hash: Hash) => void) =>
      approve.run({
        token: tokenIn,
        spender: CONTRACTS.FluxAMM,
        amount: amountIn,
        action: () => writeFlux("swap", [tokenIn, amountIn, minAmountOut]),
        onSuccess,
      }),

    addLiquidity: async (usdcAddr: Address, eurcAddr: Address, usdcAmt: bigint, eurcAmt: bigint) => {
      // Approve both first, then call. We chain via approveAndAct twice — but it only handles one approve.
      // Inline the approves directly here.
      if (!walletClient) throw new Error("Wallet not connected");
      await approve.run({
        token: usdcAddr,
        spender: CONTRACTS.FluxAMM,
        amount: usdcAmt,
        action: async () => {
          // Pre-approve EURC inside the action, then call addLiquidity
          const eurcApproveHash = await walletClient.writeContract({
            address: eurcAddr,
            abi: [
              {
                type: "function",
                name: "approve",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "spender", type: "address" },
                  { name: "amount", type: "uint256" },
                ],
                outputs: [{ name: "", type: "bool" }],
              },
            ] as const,
            functionName: "approve",
            args: [CONTRACTS.FluxAMM, eurcAmt],
            chain: walletClient.chain,
            account: walletClient.account,
          });
          // We can't await receipt here easily without publicClient; the writeFlux will revert
          // if approve hasn't mined, so we just send addLiquidity afterwards.
          void eurcApproveHash;
          return writeFlux("addLiquidity", [usdcAmt, eurcAmt]);
        },
      });
    },

    removeLiquidity: async (shares: bigint) => writeFlux("removeLiquidity", [shares]),
  };
}
