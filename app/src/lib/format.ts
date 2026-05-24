import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "./tokens";

/** Format a 6-decimal stablecoin amount with grouping. */
export function fmtStable(amount: bigint | undefined | null, decimals = USDC_DECIMALS, maxFractionDigits = 2): string {
  if (amount === undefined || amount === null) return "—";
  const s = formatUnits(amount, decimals);
  const [intPart, fracPart = ""] = s.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = fracPart.slice(0, maxFractionDigits).replace(/0+$/, "");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Parse a user-typed amount string to bigint at the given decimals. Returns 0n on empty/invalid. */
export function parseStable(input: string, decimals = USDC_DECIMALS): bigint {
  if (!input || input.trim() === "") return 0n;
  try {
    return parseUnits(input.trim(), decimals);
  } catch {
    return 0n;
  }
}

/** Truncate an address for display: 0xABCD…1234. */
export function shortAddr(addr: string | undefined | null): string {
  if (!addr) return "";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Format a percentage from a 1e18-scaled bigint. */
export function fmtPct1e18(value: bigint | undefined | null, fractionDigits = 2): string {
  if (value === undefined || value === null) return "—";
  const num = Number(value) / 1e18;
  return `${(num * 100).toFixed(fractionDigits)}%`;
}

/** Health factor formatting. Returns "∞" for max value. */
export function fmtHealthFactor(hf: bigint | undefined): string {
  if (hf === undefined) return "—";
  if (hf > 10n ** 24n) return "∞";
  const num = Number(hf) / 1e18;
  return num.toFixed(2);
}

/** Format a unix-second timestamp as a relative time ("in 30s", "5m ago"). */
export function fmtRelativeSec(targetSec: bigint, nowSec: number): string {
  const diff = Number(targetSec) - nowSec;
  const abs = Math.abs(diff);
  let label: string;
  if (abs < 60) label = `${abs}s`;
  else if (abs < 3600) label = `${Math.floor(abs / 60)}m`;
  else if (abs < 86400) label = `${Math.floor(abs / 3600)}h`;
  else label = `${Math.floor(abs / 86400)}d`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}
