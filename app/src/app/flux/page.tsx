"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Card, StatRow } from "@/components/Card";
import { Field, Input } from "@/components/Field";
import { TokenPicker } from "@/components/TokenPicker";
import { TxButton } from "@/components/TxButton";
import { useFluxPool, useQuote, useFluxActions } from "@/hooks/useFlux";
import { useAppKitSwap } from "@/hooks/useAppKitSwap";
import { useBalances } from "@/hooks/useBalances";
import { useActivity } from "@/hooks/useActivity";
import { USDC_ADDRESS, EURC_ADDRESS, type StableSymbol } from "@/lib/tokens";
import { fmtStable, parseStable } from "@/lib/format";

type SwapRoute = "flux" | "appkit";

export default function FluxPage() {
  const { isConnected } = useAccount();
  const pool     = useFluxPool();
  const actions  = useFluxActions();
  const balances = useBalances();
  const activity = useActivity();

  const [tokenIn, setTokenIn]   = useState<StableSymbol>("USDC");
  const tokenInAddr             = tokenIn === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;
  const tokenOutSym: StableSymbol = tokenIn === "USDC" ? "EURC" : "USDC";

  const [amtIn, setAmtIn]       = useState("");
  const parsedIn                = parseStable(amtIn);

  // ── FluxAMM route ─────────────────────────────────────────────────────────
  const fluxQuote   = useQuote(tokenInAddr, parsedIn);
  const fluxMinOut  = (fluxQuote * 99n) / 100n; // 1 % slippage

  // ── App Kit (RFQ) route ───────────────────────────────────────────────────
  const appKit      = useAppKitSwap(tokenIn, amtIn);
  const hasAppKit   = !!process.env.NEXT_PUBLIC_APPKIT_KEY;

  // Balance of the token being sold
  const tokenInBalance = tokenIn === "USDC" ? balances.usdc : balances.eurc;

  // ── Route selection ───────────────────────────────────────────────────────
  const [route, setRoute] = useState<SwapRoute>("flux");

  // LP state
  const [lpUsdc, setLpUsdc]             = useState("");
  const [lpEurc, setLpEurc]             = useState("");
  const [removeShares, setRemoveShares] = useState("");

  function handleFlip() {
    setTokenIn(tokenIn === "USDC" ? "EURC" : "USDC");
    setAmtIn("");
    appKit.reset();
  }

  const swapDisabled =
    !isConnected ||
    parsedIn === 0n ||
    (route === "flux" && fluxQuote === 0n) ||
    (route === "appkit" && !appKit.quote);

  const activePhase =
    route === "flux" ? actions.phase : appKit.isSwapping ? "acting" : "idle";

  async function handleSwap() {
    if (route === "flux") {
      await actions.swap(tokenInAddr, parsedIn, fluxMinOut, (hash) => {
        activity.add({
          hash,
          action: "Swap",
          detail: `${amtIn} ${tokenIn} → ${fmtStable(fluxQuote)} ${tokenOutSym} via FluxAMM`,
        });
      });
    } else {
      const result = await appKit.executeSwap();
      const hash = (result as { txHash?: string } | undefined)?.txHash ?? "";
      activity.add({
        hash,
        action: "Swap",
        detail: `${amtIn} ${tokenIn} → ${appKit.quote?.estimatedOut ?? "?"} ${tokenOutSym} via App Kit`,
      });
    }
    setAmtIn("");
    pool.refetch();
    appKit.reset();
  }

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Flux</h1>
          <p className="text-sm text-ink-muted">
            Swap USDC ↔ EURC via our StableSwap pool or Circle&apos;s App Kit RFQ — pick whichever
            gives you the better rate.
          </p>
        </div>

        {/* Pool stats */}
        <Card>
          <div className="text-xs uppercase tracking-wide text-ink-muted mb-3">Pool stats</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <StatRow label="USDC reserve"  value={`${fmtStable(pool.reserveUSDC)} USDC`} />
            <StatRow label="EURC reserve"  value={`${fmtStable(pool.reserveEURC)} EURC`} />
            <StatRow label="Invariant D"   value={fmtStable(pool.invariantD, 6, 2)} />
            <StatRow label="Your LP"       value={`${fmtStable(pool.lpBalance, 18)} hLP`} />
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── Swap card ─────────────────────────────────────────────────── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-ink">Swap</h3>
              <TokenPicker value={tokenIn} onChange={(v) => { setTokenIn(v); setAmtIn(""); appKit.reset(); }} />
            </div>

            <Field
              label={`You pay (${tokenIn})`}
              hint={
                isConnected ? (
                  <span className="flex items-center gap-1.5">
                    Balance: {fmtStable(tokenInBalance)} {tokenIn}
                    <button
                      type="button"
                      onClick={() => setAmtIn(fmtStable(tokenInBalance))}
                      className="text-brand font-semibold hover:underline"
                    >
                      Max
                    </button>
                  </span>
                ) : undefined
              }
            >
              <Input
                placeholder="0.00"
                value={amtIn}
                onChange={(e) => setAmtIn(e.target.value)}
                inputMode="decimal"
              />
            </Field>

            <div className="flex justify-center my-3">
              <button
                type="button"
                onClick={handleFlip}
                className="size-8 rounded-md border border-line bg-surface hover:bg-brand-wash flex items-center justify-center text-ink-muted hover:text-brand transition-colors"
                aria-label="Flip direction"
              >
                ↓
              </button>
            </div>

            {/* ── Route quotes ─────────────────────────────────────────── */}
            <div className="space-y-2 mb-4">
              {/* FluxAMM quote */}
              <RouteCard
                active={route === "flux"}
                onSelect={() => setRoute("flux")}
                label="Helix FluxAMM"
                badge="StableSwap · 4 bps fee → LPs"
                outputAmt={parsedIn > 0n ? fmtStable(fluxQuote, 6, 6) : "—"}
                outputSym={tokenOutSym}
                hint="On-chain StableSwap. Fees stay in the pool and accrue to LP holders."
              />

              {/* App Kit (RFQ) quote */}
              {hasAppKit ? (
                <RouteCard
                  active={route === "appkit"}
                  onSelect={() => setRoute("appkit")}
                  label="Circle App Kit"
                  badge="RFQ · market makers compete"
                  outputAmt={
                    appKit.isQuoting
                      ? "…"
                      : appKit.quote
                        ? appKit.quote.estimatedOut
                        : parsedIn > 0n
                          ? "—"
                          : "—"
                  }
                  outputSym={tokenOutSym}
                  hint={
                    appKit.quote
                      ? `Min guaranteed: ${appKit.quote.stopLimit} ${tokenOutSym} (1 % slippage)`
                      : "RFQ quote from Circle's StableFX network."
                  }
                  error={appKit.error ?? undefined}
                />
              ) : (
                <div className="rounded-lg border border-line p-3 text-xs text-ink-muted">
                  <span className="font-medium text-ink">Circle App Kit</span> — set{" "}
                  <code className="bg-bg px-1 rounded">NEXT_PUBLIC_APPKIT_KEY</code> in{" "}
                  <code className="bg-bg px-1 rounded">.env.local</code> to enable RFQ quotes.
                </div>
              )}
            </div>

            <TxButton
              phase={activePhase as never}
              disabled={swapDisabled}
              onClick={handleSwap}
            >
              Swap via {route === "flux" ? "FluxAMM" : "App Kit"}
            </TxButton>

            {actions.error && route === "flux" && (
              <div className="mt-3 text-xs text-cta break-words">
                {actions.error}{" "}
                <button className="underline" onClick={actions.reset}>dismiss</button>
              </div>
            )}
            {appKit.error && route === "appkit" && appKit.phase === "error" && (
              <div className="mt-3 text-xs text-cta break-words">
                {appKit.error}{" "}
                <button className="underline" onClick={appKit.reset}>dismiss</button>
              </div>
            )}
          </Card>

          {/* ── Liquidity card ────────────────────────────────────────────── */}
          <Card>
            <h3 className="text-lg font-semibold text-ink mb-4">Liquidity</h3>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="USDC">
                <Input
                  placeholder="0.00"
                  value={lpUsdc}
                  onChange={(e) => setLpUsdc(e.target.value)}
                  inputMode="decimal"
                />
              </Field>
              <Field label="EURC">
                <Input
                  placeholder="0.00"
                  value={lpEurc}
                  onChange={(e) => setLpEurc(e.target.value)}
                  inputMode="decimal"
                />
              </Field>
            </div>
            <TxButton
              phase={actions.phase}
              disabled={!isConnected || parseStable(lpUsdc) === 0n || parseStable(lpEurc) === 0n}
              onClick={async () => {
                await actions.addLiquidity(
                  USDC_ADDRESS,
                  EURC_ADDRESS,
                  parseStable(lpUsdc),
                  parseStable(lpEurc),
                );
                setLpUsdc("");
                setLpEurc("");
                pool.refetch();
              }}
            >
              Add liquidity
            </TxButton>

            <div className="my-5 border-t border-line" />

            <Field label="LP shares to burn" hint={`Your balance: ${fmtStable(pool.lpBalance, 18)} hLP`}>
              <Input
                placeholder="0.00"
                value={removeShares}
                onChange={(e) => setRemoveShares(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <div className="mt-3">
              <TxButton
                phase={actions.phase}
                variant="secondary"
                disabled={!isConnected || parseStable(removeShares, 18) === 0n}
                onClick={async () => {
                  await actions.removeLiquidity(parseStable(removeShares, 18));
                  setRemoveShares("");
                  pool.refetch();
                }}
              >
                Remove liquidity
              </TxButton>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

// ── RouteCard sub-component ───────────────────────────────────────────────────
function RouteCard({
  active,
  onSelect,
  label,
  badge,
  outputAmt,
  outputSym,
  hint,
  error,
}: {
  active: boolean;
  onSelect: () => void;
  label: string;
  badge: string;
  outputAmt: string;
  outputSym: string;
  hint: string;
  error?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        active
          ? "border-brand bg-brand-wash"
          : "border-line bg-surface hover:border-brand/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {/* Radio indicator */}
            <span
              className={`size-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                active ? "border-brand bg-brand" : "border-ink-muted"
              }`}
            />
            <span className="text-sm font-medium text-ink">{label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg text-ink-muted border border-line">
              {badge}
            </span>
          </div>
          <p className="text-xs text-ink-muted pl-5">
            {error ? <span className="text-cta">{error}</span> : hint}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-base font-semibold font-mono text-ink">
            {outputAmt}
          </div>
          <div className="text-xs text-ink-muted">{outputSym}</div>
        </div>
      </div>
    </button>
  );
}
