"use client";

/**
 * useAppKitSwap — wraps Circle's App Kit estimateSwap / swap for USDC ↔ EURC on Arc Testnet.
 *
 * The App Kit routes through Circle's StableFX RFQ system. Market makers compete for
 * the order, so you often get tighter spreads than an on-chain AMM can offer.
 *
 * Requires NEXT_PUBLIC_APPKIT_KEY to be set in .env.local.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWalletClient } from "wagmi";
import { createPublicClient, http } from "viem";
import { AppKit } from "@circle-fin/app-kit";
import { ArcTestnet } from "@circle-fin/app-kit/chains";
import { ViemAdapter } from "@circle-fin/adapter-viem-v2";
import type { StableSymbol } from "@/lib/tokens";

// ── Types re-exported for the UI ──────────────────────────────────────────────
export interface AppKitQuote {
  /** Expected output, human-readable (e.g. "99.82") */
  estimatedOut: string;
  /** Minimum guaranteed output after slippage (e.g. "98.83") */
  stopLimit: string;
  /** Token symbol of the output */
  tokenOut: string;
}

export type AppKitPhase = "idle" | "quoting" | "swapping" | "success" | "error";

const ARC_RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.arc.network";
const KIT_KEY = process.env.NEXT_PUBLIC_APPKIT_KEY ?? "";

// Viem chain definition for Arc Testnet (used by the public client only).
const arcViemChain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC] } },
} as const;

// ── CORS proxy interceptor ────────────────────────────────────────────────────
// Circle's API blocks the `x-user-agent` header that the App Kit injects,
// which causes every browser request to fail in preflight.
// We patch globalThis.fetch to route api.circle.com calls through our
// Next.js rewrite proxy (/api/circle-proxy/...) which forwards them
// server-side — no CORS involved.
let _fetchPatched = false;
function ensureFetchProxy() {
  if (_fetchPatched || typeof globalThis.fetch !== "function") return;
  _fetchPatched = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init?) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.circle.com")) {
      const proxied = url.replace("https://api.circle.com", "/api/circle-proxy");
      return original(proxied, init);
    }
    return original(input, init);
  };
}

// ── Lazy singletons — only created client-side to avoid SSR crashes ───────────
// AppKit and viem's PublicClient access browser globals; module-level init breaks
// Next.js SSR. We initialise them on first use instead.
let _kit: AppKit | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _publicClient: any = null;

function getKit(): AppKit {
  if (!_kit) _kit = new AppKit();
  return _kit;
}

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: arcViemChain as never,
      transport: http(ARC_RPC),
    });
  }
  return _publicClient;
}

export function useAppKitSwap(tokenIn: StableSymbol, amountInRaw: string) {
  const { data: walletClient } = useWalletClient();
  const tokenOut: StableSymbol = tokenIn === "USDC" ? "EURC" : "USDC";

  const [quote, setQuote]   = useState<AppKitQuote | null>(null);
  const [phase, setPhase]   = useState<AppKitPhase>("idle");
  const [error, setError]   = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Build a ViemAdapter from the connected wagmi wallet. */
  const buildAdapter = useCallback(() => {
    ensureFetchProxy(); // redirect api.circle.com → /api/circle-proxy before any SDK call
    if (!walletClient) throw new Error("Wallet not connected");
    // ViemAdapter and wagmi share viem as a peer dep but resolve to different minor
    // versions whose WalletClient/PublicClient types are structurally incompatible
    // at the TS level, even though they are 100 % runtime-compatible.
    // We use `any` on the options object — the narrowest escape hatch available.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = {
      getPublicClient: () => getPublicClient(),
      getWalletClient: () => walletClient,
    };
    return new ViemAdapter(
      opts,
      { addressContext: "user-controlled", supportedChains: [ArcTestnet] },
    );
  }, [walletClient]);

  // ── Debounced quote fetch ─────────────────────────────────────────────────
  useEffect(() => {
    const parsed = parseFloat(amountInRaw);
    if (!walletClient || !amountInRaw || isNaN(parsed) || parsed <= 0) {
      setQuote(null);
      setPhase("idle");
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setPhase("quoting");
      setError(null);
      try {
        const adapter = buildAdapter();
        const est = await getKit().estimateSwap({
          from: { adapter, chain: "Arc_Testnet" },
          tokenIn,
          tokenOut,
          amountIn: amountInRaw,
          config: { kitKey: KIT_KEY, slippageBps: 100 }, // 1 % slippage
        });

        setQuote({
          estimatedOut: est.estimatedOutput.amount,
          stopLimit:    est.stopLimit.amount,
          tokenOut:     est.estimatedOutput.token,
        });
        setPhase("idle");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setQuote(null);
        setPhase("error");
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [walletClient, amountInRaw, tokenIn, tokenOut, buildAdapter]);

  // ── Execute swap ──────────────────────────────────────────────────────────
  const executeSwap = useCallback(async () => {
    if (!walletClient) throw new Error("Wallet not connected");
    if (!amountInRaw || parseFloat(amountInRaw) <= 0) throw new Error("No amount");

    setPhase("swapping");
    setError(null);
    try {
      const adapter = buildAdapter();
      const result = await getKit().swap({
        from: { adapter, chain: "Arc_Testnet" },
        tokenIn,
        tokenOut,
        amountIn: amountInRaw,
        config: { kitKey: KIT_KEY, slippageBps: 100 },
      });
      setPhase("success");
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("error");
      throw e;
    }
  }, [walletClient, amountInRaw, tokenIn, tokenOut, buildAdapter]);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setQuote(null);
  }, []);

  return {
    quote,
    phase,
    error,
    executeSwap,
    reset,
    isQuoting: phase === "quoting",
    isSwapping: phase === "swapping",
  };
}
