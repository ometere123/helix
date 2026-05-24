"use client";

import { useCallback, useState } from "react";
import { AppKit, TransferSpeed, type BridgeResult, type BridgeStep } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { createPublicClient, http, type EIP1193Provider } from "viem";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import {
  BRIDGE_APPKIT_CHAINS,
  getBridgeChain,
  getBridgeRpcUrl,
  type BridgeChainKey,
} from "@/lib/bridgeChains";

export type BridgePhase =
  | "idle"
  | "switchingToSource"
  | "bridging"
  | "success"
  | "error";

type BridgeArgs = {
  sourceKey: BridgeChainKey;
  destinationKey: BridgeChainKey;
  amount: string;
};

export function useBridge() {
  const [phase, setPhase] = useState<BridgePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BridgeResult | null>(null);

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const bridge = useCallback(
    async ({ sourceKey, destinationKey, amount }: BridgeArgs) => {
      if (!address || !walletClient) {
        setError("Wallet not connected");
        setPhase("error");
        return;
      }
      if (sourceKey === destinationKey) {
        setError("Choose two different chains.");
        setPhase("error");
        return;
      }

      const source = getBridgeChain(sourceKey);
      const destination = getBridgeChain(destinationKey);

      try {
        setError(null);
        setResult(null);

        setPhase("switchingToSource");
        if (walletClient.chain?.id !== source.viemChain.id) {
          await switchChainAsync({ chainId: source.viemChain.id });
        }

        setPhase("bridging");
        const provider = walletClient.transport as unknown as EIP1193Provider;
        const adapter = await createViemAdapterFromProvider({
          provider,
          getPublicClient: ({ chain }) =>
            createPublicClient({
              chain,
              transport: http(getBridgeRpcUrl(chain.id)),
            }),
          capabilities: {
            addressContext: "user-controlled",
            supportedChains: BRIDGE_APPKIT_CHAINS,
          },
        });
        const kit = new AppKit();
        const bridgeResult = await kit.bridge({
          from: { adapter, chain: source.appKitId },
          to: {
            adapter,
            chain: destination.appKitId,
            recipientAddress: address,
            useForwarder: true,
          },
          amount: amount.trim(),
          token: "USDC",
          config: {
            transferSpeed: TransferSpeed.FAST,
            batchTransactions: false,
          },
        });

        setResult(bridgeResult);
        setPhase(bridgeResult.state === "success" ? "success" : "bridging");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase("error");
      }
    },
    [address, walletClient, switchChainAsync],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setResult(null);
  }, []);

  const steps: BridgeStep[] = result?.steps ?? [];

  return { phase, error, result, steps, bridge, reset };
}
