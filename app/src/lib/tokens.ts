import type { Address } from "viem";

/**
 * Arc Testnet stablecoin addresses (from developers.circle.com).
 *
 * NOTE: USDC at 0x3600...0000 is the ERC-20 interface for Arc's native gas token.
 * The native gas token uses 18 decimals internally, but this ERC-20 interface
 * (which all our contracts use) reads/writes amounts in 6 decimals.
 */
export const USDC_ADDRESS = (
  process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000"
) as Address;

export const EURC_ADDRESS = (
  process.env.NEXT_PUBLIC_EURC_ADDRESS ?? "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"
) as Address;

export const USDC_DECIMALS = 6;
export const EURC_DECIMALS = 6;

export type StableSymbol = "USDC" | "EURC";

export const TOKENS = {
  USDC: {
    symbol: "USDC" as const,
    address: USDC_ADDRESS,
    decimals: USDC_DECIMALS,
    name: "USD Coin",
  },
  EURC: {
    symbol: "EURC" as const,
    address: EURC_ADDRESS,
    decimals: EURC_DECIMALS,
    name: "Euro Coin",
  },
} as const;

export function tokenByAddress(address: Address): typeof TOKENS.USDC | typeof TOKENS.EURC | null {
  const a = address.toLowerCase();
  if (a === USDC_ADDRESS.toLowerCase()) return TOKENS.USDC;
  if (a === EURC_ADDRESS.toLowerCase()) return TOKENS.EURC;
  return null;
}

/** Minimal ERC-20 ABI for balance, approve, allowance, transfer reads. */
export const erc20MinimalAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
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
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;
