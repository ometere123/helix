import { defineChain } from "viem";

/**
 * Arc Testnet chain config.
 *
 * Confirmed from docs.arc.io:
 *   - Chain ID: 5042002
 *   - RPC: https://rpc.testnet.arc.network
 *   - Explorer: https://testnet.arcscan.app
 *   - Native gas token: USDC (18 decimals as native, 6 decimals via ERC-20 interface)
 *
 * Note: viem/wagmi may expose `arcTestnet` as a built-in soon, but we define it
 * locally for explicitness and to avoid version-skew on a brand-new chain.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  network: "arc-testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});
