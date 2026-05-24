"use client";

import { useAccount, usePublicClient, useReadContracts, useWalletClient } from "wagmi";
import type { Address, Hash } from "viem";
import { VaultAbi } from "@/abi";
import { CONTRACTS } from "@/lib/contracts";
import { useApproveAndAct } from "./useApproveAndAct";

// Max approve for collateral — the contract pulls exactly what it needs.
const MAX_UINT256 = 2n ** 256n - 1n;

/** Supply-side data for a single token (deposit / withdraw). */
export function useSupplyData(token: Address) {
  const { address } = useAccount();

  const { data, refetch, isLoading } = useReadContracts({
    contracts: address
      ? [
          { address: CONTRACTS.Vault, abi: VaultAbi, functionName: "suppliedBalance", args: [address, token] },
          { address: CONTRACTS.Vault, abi: VaultAbi, functionName: "totalSupplied",   args: [token] },
          { address: CONTRACTS.Vault, abi: VaultAbi, functionName: "totalBorrowed",   args: [token] },
          { address: CONTRACTS.Vault, abi: VaultAbi, functionName: "utilization",     args: [token] },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  return {
    supplied:     (data?.[0]?.result as bigint | undefined) ?? 0n,
    totalSupplied:(data?.[1]?.result as bigint | undefined) ?? 0n,
    totalBorrowed:(data?.[2]?.result as bigint | undefined) ?? 0n,
    utilization:  (data?.[3]?.result as bigint | undefined) ?? 0n,
    refetch,
    isLoading,
  };
}

/** Position data for a specific (debtToken, collateralToken) pair. */
export function usePositionData(debtToken: Address, collateralToken: Address) {
  const { address } = useAccount();

  const { data, refetch, isLoading } = useReadContracts({
    contracts: address
      ? [
          {
            address: CONTRACTS.Vault, abi: VaultAbi,
            functionName: "borrowedBalance",
            args: [address, debtToken, collateralToken],
          },
          {
            address: CONTRACTS.Vault, abi: VaultAbi,
            functionName: "collateralOf",
            args: [address, debtToken, collateralToken],
          },
          {
            address: CONTRACTS.Vault, abi: VaultAbi,
            functionName: "healthFactorOf",
            args: [address, debtToken, collateralToken],
          },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  return {
    borrowed:     (data?.[0]?.result as bigint | undefined) ?? 0n,
    collateral:   (data?.[1]?.result as bigint | undefined) ?? 0n,
    healthFactor:  data?.[2]?.result as bigint | undefined,
    refetch,
    isLoading,
  };
}

/** Combined hook kept for pages that show both supply + a single position. */
export function useVaultData(token: Address, collateralToken: Address) {
  const supply   = useSupplyData(token);
  const position = usePositionData(token, collateralToken);

  function refetch() {
    supply.refetch();
    position.refetch();
  }

  return {
    supplied:     supply.supplied,
    totalSupplied:supply.totalSupplied,
    totalBorrowed:supply.totalBorrowed,
    utilization:  supply.utilization,
    borrowed:     position.borrowed,
    collateral:   position.collateral,
    healthFactor: position.healthFactor,
    refetch,
    isLoading: supply.isLoading || position.isLoading,
  };
}

export function useVaultActions() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const approveAndAct = useApproveAndAct();

  async function writeVault(
    fn: "deposit" | "withdraw" | "borrow" | "repay" | "liquidate",
    args: readonly unknown[],
  ): Promise<Hash> {
    if (!walletClient) throw new Error("Wallet not connected");
    return walletClient.writeContract({
      address: CONTRACTS.Vault,
      abi: VaultAbi,
      functionName: fn,
      args: args as never,
      chain: walletClient.chain,
      account: walletClient.account,
    });
  }

  return {
    phase: approveAndAct.phase,
    error: approveAndAct.error,
    hash:  approveAndAct.hash,
    reset: approveAndAct.reset,

    /** Deposit `amount` of `token` into the supply pool. */
    deposit: (token: Address, amount: bigint) =>
      approveAndAct.run({
        token,
        spender: CONTRACTS.Vault,
        amount,
        action: () => writeVault("deposit", [token, amount]),
      }),

    /** Withdraw `amount` of `token` from the supply pool. */
    withdraw: async (token: Address, amount: bigint) => {
      if (!walletClient || !publicClient) throw new Error("Wallet not connected");
      const hash = await writeVault("withdraw", [token, amount]);
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    /**
     * Borrow `amount` of `debtToken`, posting `collateralToken` as collateral.
     * The contract determines the exact collateral to pull; we approve max to avoid
     * a second allowance estimation call on the frontend.
     */
    borrow: (debtToken: Address, collateralToken: Address, amount: bigint) =>
      approveAndAct.run({
        token:   collateralToken,
        spender: CONTRACTS.Vault,
        amount:  MAX_UINT256,
        action:  () => writeVault("borrow", [debtToken, collateralToken, amount]),
      }),

    /** Repay `amount` of `debtToken` for the position backed by `collateralToken`. */
    repay: (debtToken: Address, collateralToken: Address, amount: bigint) =>
      approveAndAct.run({
        token:   debtToken,
        spender: CONTRACTS.Vault,
        amount,
        action:  () => writeVault("repay", [debtToken, collateralToken, amount]),
      }),

    /** Liquidate a borrower's under-collateralised position. */
    liquidate: (borrower: Address, debtToken: Address, collateralToken: Address, debtAmount: bigint) =>
      approveAndAct.run({
        token:   debtToken,
        spender: CONTRACTS.Vault,
        amount:  debtAmount,
        action:  () => writeVault("liquidate", [borrower, debtToken, collateralToken]),
      }),
  };
}
