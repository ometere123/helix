import { createPublicClient, createWalletClient, http, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "@/lib/chain";
import { CONTRACTS } from "@/lib/contracts";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.arc.network";

export function getClients() {
  const pk = process.env.CRANK_PRIVATE_KEY;
  if (!pk) throw new Error("CRANK_PRIVATE_KEY not set");
  const account = privateKeyToAccount(pk as `0x${string}`);
  const transport = http(RPC_URL);
  const pub = createPublicClient({ chain: arcTestnet, transport });
  const wallet = createWalletClient({ account, chain: arcTestnet, transport });
  return { pub, wallet, account };
}

export function checkAuth(req: Request): boolean {
  const secret = process.env.HELIX_API_KEY;
  if (!secret) return true; // no key set → open (dev mode)
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function approveIfNeeded(
  tokenAddress: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint,
) {
  const { pub, wallet, account } = getClients();
  const allowance = await pub.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, spender],
  });
  if (allowance < amount) {
    const hash = await wallet.writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
      chain: arcTestnet,
    });
    await pub.waitForTransactionReceipt({ hash });
  }
}

export { CONTRACTS, arcTestnet };
