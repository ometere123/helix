"use client";

import { useBalances } from "@/hooks/useBalances";
import { fmtStable } from "@/lib/format";
import { useAccount } from "wagmi";

export function BalancePill() {
  const { isConnected } = useAccount();
  const { usdc, eurc, isLoading } = useBalances();

  if (!isConnected) return null;

  return (
    <div className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-md border border-line bg-bg text-xs font-mono whitespace-nowrap">
      <span className="text-usdc font-semibold">
        {isLoading ? "…" : `${fmtStable(usdc)}`}
        <span className="text-ink-muted font-medium ml-0.5">USDC</span>
      </span>
      <span className="text-line">·</span>
      <span className="text-eurc font-semibold">
        {isLoading ? "…" : `${fmtStable(eurc)}`}
        <span className="text-ink-muted font-medium ml-0.5">EURC</span>
      </span>
    </div>
  );
}
