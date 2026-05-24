import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { BRIDGE_WAGMI_CHAINS, getBridgeRpcUrl } from "./bridgeChains";

const chains = BRIDGE_WAGMI_CHAINS;
const transportFor = (chainId: (typeof chains)[number]["id"]) =>
  http(getBridgeRpcUrl(chainId));
const transports = {
  [chains[0].id]: transportFor(chains[0].id),
  [chains[1].id]: transportFor(chains[1].id),
  [chains[2].id]: transportFor(chains[2].id),
  [chains[3].id]: transportFor(chains[3].id),
  [chains[4].id]: transportFor(chains[4].id),
  [chains[5].id]: transportFor(chains[5].id),
  [chains[6].id]: transportFor(chains[6].id),
  [chains[7].id]: transportFor(chains[7].id),
  [chains[8].id]: transportFor(chains[8].id),
  [chains[9].id]: transportFor(chains[9].id),
  [chains[10].id]: transportFor(chains[10].id),
} satisfies Record<(typeof chains)[number]["id"], ReturnType<typeof http>>;

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

/**
 * When a real WalletConnect Cloud projectId is present, use RainbowKit's
 * full getDefaultConfig (enables WalletConnect QR, mobile wallets, etc.).
 *
 * When no projectId is set (local dev, no cloud account), fall back to a
 * plain wagmi config with only the injected connector so MetaMask / Rabby /
 * any browser extension wallet still works — without RainbowKit throwing.
 *
 * Get a free projectId at https://cloud.reown.com
 */
export const wagmiConfig = projectId
  ? getDefaultConfig({
      appName: "Helix",
      projectId,
      chains,
      transports,
      ssr: true,
    })
  : createConfig({
      chains,
      transports,
      connectors: [injected()],
      ssr: true,
    });
