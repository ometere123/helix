import type { Address, Hash } from "viem";
import { sepolia } from "viem/chains";
import { arcTestnet } from "./chain";

/**
 * CCTP V2 — USDC bridging between Ethereum Sepolia and Arc Testnet.
 *
 * Flow:
 *   1. Source: approve(TokenMessengerV2, amount) on USDC
 *   2. Source: depositForBurn(amount, destinationDomain, mintRecipient, USDC, destinationCaller, maxFee, minFinalityThreshold)
 *   3. Wait for Circle attestation from iris-api-sandbox.circle.com
 *   4. Destination: receiveMessage(message, attestation) on MessageTransmitterV2
 *
 * Source addresses verified from Circle docs (CCTP V2 uses the same address across EVM chains).
 */

export const IRIS_API_BASE = "https://iris-api-sandbox.circle.com";

// CCTP V2 deterministic addresses (same on Sepolia, Arc, etc.)
export const CCTP_TOKEN_MESSENGER: Address = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
export const CCTP_MESSAGE_TRANSMITTER: Address = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

export const CCTP_CHAINS = {
  sepolia: {
    chain: sepolia,
    chainId: sepolia.id,
    label: "Ethereum Sepolia",
    domain: 0,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
  },
  arc: {
    chain: arcTestnet,
    chainId: arcTestnet.id,
    label: "Arc Testnet",
    domain: 26,
    usdc: "0x3600000000000000000000000000000000000000" as Address,
  },
} as const;

export type CCTPChainKey = keyof typeof CCTP_CHAINS;

/** Minimal TokenMessengerV2 ABI: depositForBurn. */
export const tokenMessengerV2Abi = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

/** Minimal MessageTransmitterV2 ABI: receiveMessage. */
export const messageTransmitterV2Abi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Encode an EVM address as bytes32 (left-padded with zeros) for CCTP mintRecipient field. */
export function addressToBytes32(addr: Address): `0x${string}` {
  return `0x${"0".repeat(24)}${addr.slice(2).toLowerCase()}` as `0x${string}`;
}

export type AttestationStatus =
  | { status: "pending" }
  | { status: "complete"; message: `0x${string}`; attestation: `0x${string}` }
  | { status: "not_found" };

/** Polls Circle's Iris attestation API for a given source-chain burn tx. */
export async function fetchAttestation(
  sourceDomain: number,
  txHash: Hash,
): Promise<AttestationStatus> {
  const url = `${IRIS_API_BASE}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const res = await fetch(url);
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) throw new Error(`Iris API ${res.status}`);
  const data = (await res.json()) as {
    messages?: Array<{ status: string; message?: string; attestation?: string }>;
  };
  const msg = data.messages?.[0];
  if (!msg || msg.status !== "complete" || !msg.message || !msg.attestation) {
    return { status: "pending" };
  }
  return {
    status: "complete",
    message: msg.message as `0x${string}`,
    attestation: msg.attestation as `0x${string}`,
  };
}
