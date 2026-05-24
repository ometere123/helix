import { BridgeChain, type ChainDefinition } from "@circle-fin/app-kit";
import {
  ArbitrumSepolia,
  ArcTestnet,
  AvalancheFuji,
  BaseSepolia,
  EthereumSepolia,
  LineaSepolia,
  OptimismSepolia,
  PolygonAmoy,
  SonicTestnet,
  UnichainSepolia,
  WorldChainSepolia,
} from "@circle-fin/app-kit/chains";
import type { Chain } from "viem";
import {
  arbitrumSepolia,
  avalancheFuji,
  baseSepolia,
  lineaSepolia,
  optimismSepolia,
  polygonAmoy,
  sepolia,
  sonicTestnet,
  unichainSepolia,
  worldchainSepolia,
} from "viem/chains";
import { arcTestnet } from "./chain";

export type BridgeChainOption = {
  key: string;
  label: string;
  shortLabel: string;
  appKitId: BridgeChain;
  appKitChain: ChainDefinition;
  viemChain: Chain;
  nativeGasToken: string;
  faucetUrl?: string;
};

export const BRIDGE_CHAIN_OPTIONS = [
  {
    key: "arc",
    label: "Arc Testnet",
    shortLabel: "Arc",
    appKitId: BridgeChain.Arc_Testnet,
    appKitChain: ArcTestnet,
    viemChain: arcTestnet,
    nativeGasToken: "USDC",
    faucetUrl: "https://faucet.circle.com",
  },
  {
    key: "ethereumSepolia",
    label: "Ethereum Sepolia",
    shortLabel: "Ethereum",
    appKitId: BridgeChain.Ethereum_Sepolia,
    appKitChain: EthereumSepolia,
    viemChain: sepolia,
    nativeGasToken: "ETH",
    faucetUrl: "https://sepoliafaucet.com",
  },
  {
    key: "baseSepolia",
    label: "Base Sepolia",
    shortLabel: "Base",
    appKitId: BridgeChain.Base_Sepolia,
    appKitChain: BaseSepolia,
    viemChain: baseSepolia,
    nativeGasToken: "ETH",
  },
  {
    key: "arbitrumSepolia",
    label: "Arbitrum Sepolia",
    shortLabel: "Arbitrum",
    appKitId: BridgeChain.Arbitrum_Sepolia,
    appKitChain: ArbitrumSepolia,
    viemChain: arbitrumSepolia,
    nativeGasToken: "ETH",
  },
  {
    key: "optimismSepolia",
    label: "OP Sepolia",
    shortLabel: "OP",
    appKitId: BridgeChain.Optimism_Sepolia,
    appKitChain: OptimismSepolia,
    viemChain: optimismSepolia,
    nativeGasToken: "ETH",
  },
  {
    key: "avalancheFuji",
    label: "Avalanche Fuji",
    shortLabel: "Avalanche",
    appKitId: BridgeChain.Avalanche_Fuji,
    appKitChain: AvalancheFuji,
    viemChain: avalancheFuji,
    nativeGasToken: "AVAX",
  },
  {
    key: "polygonAmoy",
    label: "Polygon Amoy",
    shortLabel: "Polygon",
    appKitId: BridgeChain.Polygon_Amoy_Testnet,
    appKitChain: PolygonAmoy,
    viemChain: polygonAmoy,
    nativeGasToken: "POL",
  },
  {
    key: "unichainSepolia",
    label: "Unichain Sepolia",
    shortLabel: "Unichain",
    appKitId: BridgeChain.Unichain_Sepolia,
    appKitChain: UnichainSepolia,
    viemChain: unichainSepolia,
    nativeGasToken: "ETH",
  },
  {
    key: "worldchainSepolia",
    label: "World Chain Sepolia",
    shortLabel: "World",
    appKitId: BridgeChain.World_Chain_Sepolia,
    appKitChain: WorldChainSepolia,
    viemChain: worldchainSepolia,
    nativeGasToken: "ETH",
  },
  {
    key: "lineaSepolia",
    label: "Linea Sepolia",
    shortLabel: "Linea",
    appKitId: BridgeChain.Linea_Sepolia,
    appKitChain: LineaSepolia,
    viemChain: lineaSepolia,
    nativeGasToken: "ETH",
  },
  {
    key: "sonicTestnet",
    label: "Sonic Testnet",
    shortLabel: "Sonic",
    appKitId: BridgeChain.Sonic_Testnet,
    appKitChain: SonicTestnet,
    viemChain: sonicTestnet,
    nativeGasToken: "S",
  },
] as const satisfies readonly BridgeChainOption[];

export type BridgeChainKey = (typeof BRIDGE_CHAIN_OPTIONS)[number]["key"];

export const BRIDGE_WAGMI_CHAINS = [
  arcTestnet,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  avalancheFuji,
  polygonAmoy,
  unichainSepolia,
  worldchainSepolia,
  lineaSepolia,
  sonicTestnet,
] as const;

export const BRIDGE_APPKIT_CHAINS = BRIDGE_CHAIN_OPTIONS.map(
  (chain) => chain.appKitChain,
) as ChainDefinition[];

const BRIDGE_RPC_URLS: Record<number, string | undefined> = {
  [arcTestnet.id]: process.env.NEXT_PUBLIC_RPC_URL,
  [sepolia.id]: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
  [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
  [arbitrumSepolia.id]: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL,
  [optimismSepolia.id]: process.env.NEXT_PUBLIC_OP_SEPOLIA_RPC_URL,
  [avalancheFuji.id]: process.env.NEXT_PUBLIC_AVALANCHE_FUJI_RPC_URL,
  [polygonAmoy.id]: process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL,
  [unichainSepolia.id]: process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_RPC_URL,
  [worldchainSepolia.id]: process.env.NEXT_PUBLIC_WORLDCHAIN_SEPOLIA_RPC_URL,
  [lineaSepolia.id]: process.env.NEXT_PUBLIC_LINEA_SEPOLIA_RPC_URL,
  [sonicTestnet.id]: process.env.NEXT_PUBLIC_SONIC_TESTNET_RPC_URL,
};

export function getBridgeRpcUrl(chainId: number): string | undefined {
  return BRIDGE_RPC_URLS[chainId];
}

export function getBridgeChain(key: BridgeChainKey): BridgeChainOption {
  return BRIDGE_CHAIN_OPTIONS.find((chain) => chain.key === key) ?? BRIDGE_CHAIN_OPTIONS[0];
}

