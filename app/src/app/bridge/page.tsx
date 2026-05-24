"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Check } from "lucide-react";
import { useAccount } from "wagmi";
import { Card } from "@/components/Card";
import { Field, Input } from "@/components/Field";
import { TxButton } from "@/components/TxButton";
import { useBridge, type BridgePhase } from "@/hooks/useBridge";
import { useBalances } from "@/hooks/useBalances";
import {
  BRIDGE_CHAIN_OPTIONS,
  getBridgeChain,
  type BridgeChainKey,
} from "@/lib/bridgeChains";
import { parseStable, fmtStable } from "@/lib/format";

const FALLBACK_STEPS: { phase: BridgePhase; label: string }[] = [
  { phase: "switchingToSource", label: "Switch to source chain" },
  { phase: "bridging", label: "Approve and burn USDC" },
  { phase: "bridging", label: "Wait for Circle attestation" },
  { phase: "bridging", label: "Forwarder mints on destination" },
  { phase: "success", label: "Complete" },
];

const PHASE_ORDER: BridgePhase[] = ["idle", "switchingToSource", "bridging", "success"];

export default function BridgePage() {
  const { isConnected } = useAccount();
  const { phase, error, result, steps, bridge, reset } = useBridge();
  const balances = useBalances();
  const [amount, setAmount] = useState("");
  const [sourceKey, setSourceKey] = useState<BridgeChainKey>("arc");
  const [destinationKey, setDestinationKey] = useState<BridgeChainKey>("ethereumSepolia");

  const amountBigint = parseStable(amount);
  const source = getBridgeChain(sourceKey);
  const destination = getBridgeChain(destinationKey);
  const sameChain = sourceKey === destinationKey;
  const currentIdx = PHASE_ORDER.indexOf(phase);
  const busy = phase !== "idle" && phase !== "success" && phase !== "error";

  const directionCopy = useMemo(() => {
    if (sameChain) return "Choose two different chains.";
    if (source.key === "arc") return "Arc to EVM";
    if (destination.key === "arc") return "EVM to Arc";
    return "EVM to EVM";
  }, [destination.key, sameChain, source.key]);

  const handleFlip = () => {
    setSourceKey(destinationKey);
    setDestinationKey(sourceKey);
    reset();
  };

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-muted mb-2">
            <span>Circle AppKit Bridge</span>
            <span className="h-1 w-1 rounded-full bg-line" />
            <span>{directionCopy}</span>
          </div>
          <h1 className="text-3xl font-bold text-ink mb-1">Bridge</h1>
          <p className="text-sm text-ink-muted max-w-3xl">
            Move native USDC between Arc Testnet and supported EVM testnets. AppKit handles the CCTP
            burn, attestation, and relayed mint so the destination side does not need a manual mint transaction.
          </p>
        </div>

        <Card>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <ChainSelect
              label="From"
              value={sourceKey}
              onChange={(value) => {
                setSourceKey(value);
                reset();
              }}
            />
            <button
              type="button"
              onClick={handleFlip}
              disabled={busy}
              className="h-10 w-10 rounded-md border border-line bg-surface text-ink-muted hover:text-ink hover:bg-brand-wash disabled:opacity-50 flex items-center justify-center"
              aria-label="Flip bridge direction"
              title="Flip bridge direction"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <ChainSelect
              label="To"
              value={destinationKey}
              onChange={(value) => {
                setDestinationKey(value);
                reset();
              }}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <Field
              label="Amount (USDC)"
              hint={
                isConnected && sourceKey === "arc" ? (
                  <span className="flex items-center gap-1.5">
                    Balance: {fmtStable(balances.usdc)} USDC
                    <button
                      type="button"
                      onClick={() => setAmount(fmtStable(balances.usdc))}
                      className="text-brand font-semibold hover:underline"
                    >
                      Max
                    </button>
                    <span className="text-ink-muted">· {source.nativeGasToken} covers gas</span>
                  </span>
                ) : `Source gas: ${source.nativeGasToken}. Destination mint is relayed and paid from bridged USDC.`
              }
            >
              <Input
                placeholder="100.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </Field>

            <TxButton
              phase={phase === "idle" ? "idle" : phase === "success" ? "success" : phase === "error" ? "error" : phase}
              disabled={!isConnected || amountBigint === 0n || sameChain}
              onClick={() => bridge({ sourceKey, destinationKey, amount })}
              className="md:min-w-48"
            >
              Bridge {amountBigint > 0n ? fmtStable(amountBigint) : ""} USDC
            </TxButton>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-muted">
            <span className="rounded-full border border-line px-2.5 py-1">
              {source.shortLabel} -&gt; {destination.shortLabel}
            </span>
            <span className="rounded-full border border-line px-2.5 py-1">USDC only</span>
            <span className="rounded-full border border-line px-2.5 py-1">Forwarder mint enabled</span>
            {source.faucetUrl && (
              <a
                href={source.faucetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-line px-2.5 py-1 text-brand hover:bg-brand-wash"
              >
                Get {source.nativeGasToken} gas
              </a>
            )}
          </div>

          {(phase === "success" || phase === "error") && (
            <button
              onClick={reset}
              className="mt-4 text-sm text-ink-muted hover:text-ink underline"
            >
              Start over
            </button>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-xs uppercase tracking-wide text-ink-muted">Progress</div>
            {result && (
              <div className="text-xs text-ink-muted">
                Provider: <span className="text-ink">{result.provider}</span>
              </div>
            )}
          </div>

          {steps.length > 0 ? (
            <ol className="space-y-2">
              {steps.map((step, idx) => (
                <li key={`${step.name}-${idx}`} className="flex items-center gap-3 text-sm">
                  <StepDot status={step.state} index={idx} />
                  <span className={step.state === "error" ? "text-cta" : "text-ink"}>
                    {step.name}
                  </span>
                  {step.txHash && (
                    <a
                      href={step.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto font-mono text-xs text-brand hover:underline"
                    >
                      {step.txHash.slice(0, 10)}...
                    </a>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <ol className="space-y-2">
              {FALLBACK_STEPS.map((step, idx) => {
                const stepIdx = PHASE_ORDER.indexOf(step.phase);
                const status = currentIdx > stepIdx ? "success" : currentIdx === stepIdx ? "pending" : "noop";
                return (
                  <li key={`${step.label}-${idx}`} className="flex items-center gap-3 text-sm">
                    <StepDot status={status} index={idx} />
                    <span className={status === "noop" ? "text-ink-muted" : "text-ink"}>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {error && (
          <Card className="border-cta">
            <div className="text-sm text-cta break-words">{error}</div>
          </Card>
        )}

        <Card>
          <div className="text-xs uppercase tracking-wide text-ink-muted mb-2">Bridge notes</div>
          <ol className="space-y-2 text-sm text-ink-muted leading-relaxed list-decimal pl-5">
            <li>AppKit Bridge currently moves USDC only.</li>
            <li>The source wallet must hold USDC and the source chain&apos;s native gas token.</li>
            <li>Circle&apos;s Forwarding Service submits the destination mint and deducts its fee from minted USDC.</li>
            <li>The kit key is not required for this bridge flow; keep it in env only if we add swaps or paid kit features.</li>
          </ol>
        </Card>
      </div>
    </main>
  );
}

function ChainSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BridgeChainKey;
  onChange: (value: BridgeChainKey) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-ink-muted mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as BridgeChainKey)}
        className="h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand"
      >
        {BRIDGE_CHAIN_OPTIONS.map((chain) => (
          <option key={chain.key} value={chain.key}>
            {chain.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StepDot({
  status,
  index,
}: {
  status: "pending" | "success" | "error" | "noop";
  index: number;
}) {
  const className =
    status === "success"
      ? "bg-brand text-white"
      : status === "pending"
        ? "bg-brand-wash text-brand animate-pulse"
        : status === "error"
          ? "bg-cta text-white"
          : "bg-bg text-ink-muted border border-line";

  return (
    <span className={`size-6 rounded-full flex items-center justify-center text-xs font-medium ${className}`}>
      {status === "success" ? <Check className="h-3 w-3" /> : index + 1}
    </span>
  );
}
