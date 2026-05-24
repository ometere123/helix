import type { Address } from "viem";

/** Deployed Helix contract addresses on Arc Testnet (filled in via .env.local after deploy). */
export const CONTRACTS = {
  Vault: (process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  FluxAMM: (process.env.NEXT_PUBLIC_FLUX_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  Streamline: (process.env.NEXT_PUBLIC_STREAMLINE_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  Lockbox: (process.env.NEXT_PUBLIC_LOCKBOX_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  Forge: (process.env.NEXT_PUBLIC_FORGE_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address,
  AgentRegistry: (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as Address,
} as const;

/** CCTP V2 contracts on Arc Testnet (domain 26). */
export const CCTP = {
  domain: 26,
  TokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as Address,
  MessageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as Address,
} as const;

/** Circle's USDC faucet for Arc Testnet. */
export const CIRCLE_FAUCET_URL =
  process.env.NEXT_PUBLIC_CIRCLE_FAUCET_URL ?? "https://faucet.circle.com";

/** Block explorer options for the explorer picker. */
export const EXPLORERS = [
  { id: "arcscan", name: "Arcscan", baseUrl: "https://testnet.arcscan.app" },
] as const;

export type ExplorerId = (typeof EXPLORERS)[number]["id"];

export function explorerTxUrl(baseUrl: string, txHash: string): string {
  return `${baseUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(baseUrl: string, address: string): string {
  return `${baseUrl}/address/${address}`;
}
