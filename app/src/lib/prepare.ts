/**
 * Shared utilities for building unsigned transaction objects agents sign locally.
 * No private keys, no wallet — just calldata + gas + nonce ready to sign.
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  type Abi,
  type Address,
} from "viem";
import { arcTestnet } from "@/lib/chain";

const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

export interface UnsignedTx {
  from: Address;
  to: Address;
  data: `0x${string}`;
  value: `0x${string}`;
  gas: `0x${string}`;
  gasPrice: `0x${string}`;
  nonce: `0x${string}`;
  chainId: `0x${string}`;
  description: string;
}

export function getPublicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http(RPC) });
}

export async function buildUnsignedTxs(
  from: Address,
  steps: Array<{ to: Address; data: `0x${string}`; description: string }>,
): Promise<UnsignedTx[]> {
  const pub = getPublicClient();
  const [gasPrice, baseNonce] = await Promise.all([
    pub.getGasPrice(),
    pub.getTransactionCount({ address: from }),
  ]);

  return steps.map((step, i) => ({
    from,
    to: step.to,
    data: step.data,
    value: "0x0" as `0x${string}`,
    gas: `0x${(300000n).toString(16)}` as `0x${string}`,
    gasPrice: `0x${gasPrice.toString(16)}` as `0x${string}`,
    nonce: `0x${(baseNonce + i).toString(16)}` as `0x${string}`,
    chainId: `0x${CHAIN_ID.toString(16)}` as `0x${string}`,
    description: step.description,
  }));
}

/** Returns approval tx only if current allowance < amount. */
export async function maybeApprovalStep(
  from: Address,
  token: Address,
  spender: Address,
  amount: bigint,
  tokenSymbol: string,
  spenderName: string,
): Promise<{ to: Address; data: `0x${string}`; description: string } | null> {
  const pub = getPublicClient();
  const allowance = await pub.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [from, spender],
  }) as bigint;

  if (allowance >= amount) return null;

  return {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    }),
    description: `Approve ${tokenSymbol} for ${spenderName}`,
  };
}

export function encodeCall(abi: Abi, functionName: string, args: unknown[]): `0x${string}` {
  return encodeFunctionData({ abi, functionName, args } as Parameters<typeof encodeFunctionData>[0]);
}
