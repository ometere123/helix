"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Card } from "@/components/Card";
import { Field, Input } from "@/components/Field";
import { TokenPicker } from "@/components/TokenPicker";
import { TxButton } from "@/components/TxButton";
import { useSchedule, useStreamActions, crank } from "@/hooks/useStream";
import { useBalances } from "@/hooks/useBalances";
import { USDC_ADDRESS, EURC_ADDRESS, type StableSymbol } from "@/lib/tokens";
import { fmtStable, parseStable, shortAddr } from "@/lib/format";

interface SavedSchedule {
  id: `0x${string}`;
  createdAt: number;
}

const STORAGE_KEY = "helix_schedules";

function loadSaved(): SavedSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveSaved(list: SavedSchedule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function StreamPage() {
  const { isConnected } = useAccount();
  const actions  = useStreamActions();
  const balances = useBalances();

  const [recipient, setRecipient] = useState("");
  const [tokenSym, setTokenSym] = useState<StableSymbol>("USDC");
  const [amount, setAmount] = useState("");
  const [intervalSec, setIntervalSec] = useState("60");
  const [count, setCount] = useState("3");

  const [saved, setSaved] = useState<SavedSchedule[]>(loadSaved);

  const token = tokenSym === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Stream</h1>
          <p className="text-sm text-ink-muted">
            Recurring stablecoin payments. The Helix Agent executes each payment server-side — you
            sign one approval, then never sign again.
          </p>
        </div>

        <Card>
          <h3 className="text-lg font-semibold text-ink mb-4">Create schedule</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Recipient">
              <Input
                placeholder="0x…"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </Field>
            <Field label="Token">
              <div className="pt-1">
                <TokenPicker value={tokenSym} onChange={setTokenSym} />
              </div>
            </Field>
            <Field
              label="Amount per payment"
              hint={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {isConnected && (
                    <>
                      <span>
                        Balance: {fmtStable(tokenSym === "USDC" ? balances.usdc : balances.eurc)} {tokenSym}
                      </span>
                      <span className="text-ink-muted">·</span>
                    </>
                  )}
                  <span>
                    Total approval:{" "}
                    {parseStable(amount) > 0n && parseInt(count) > 0
                      ? fmtStable(parseStable(amount) * BigInt(parseInt(count) || 0))
                      : "—"}{" "}
                    {tokenSym}
                  </span>
                </span>
              }
            >
              <Input
                placeholder="10.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Interval (seconds)" hint="60 = 1 min, 3600 = 1 h, 86400 = 1 day">
              <Input
                placeholder="60"
                value={intervalSec}
                onChange={(e) => setIntervalSec(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Number of payments">
              <Input
                placeholder="3"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>

          <div className="mt-5">
            <TxButton
              phase={actions.phase}
              disabled={
                !isConnected ||
                !recipient.startsWith("0x") ||
                recipient.length !== 42 ||
                parseStable(amount) === 0n ||
                !parseInt(intervalSec) ||
                !parseInt(count)
              }
              onClick={async () => {
                const res = await actions.createSchedule(
                  recipient as `0x${string}`,
                  token,
                  parseStable(amount),
                  BigInt(parseInt(intervalSec)),
                  BigInt(parseInt(count)),
                );
                if (res?.scheduleId) {
                  const next = [{ id: res.scheduleId, createdAt: Date.now() }, ...saved];
                  saveSaved(next);
                  setSaved(next);
                  setRecipient("");
                  setAmount("");
                }
              }}
            >
              Create schedule
            </TxButton>
          </div>
        </Card>

        {actions.error && (
          <Card className="border-cta">
            <div className="text-sm text-cta break-words">{actions.error}</div>
            <button className="mt-2 text-xs text-ink-muted hover:text-ink underline" onClick={actions.reset}>
              dismiss
            </button>
          </Card>
        )}

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Your schedules</h2>
          {saved.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">No schedules yet. Create one above.</p>
            </Card>
          ) : (
            saved.map((s) => (
              <ScheduleRow
                key={s.id}
                id={s.id}
                onCancel={async () => {
                  await actions.cancelSchedule(s.id);
                }}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function ScheduleRow({ id, onCancel }: { id: `0x${string}`; onCancel: () => Promise<void> }) {
  const { schedule, refetch } = useSchedule(id);
  const [crankResult, setCrankResult] = useState<string | null>(null);
  const [cranking, setCranking] = useState(false);

  // Auto-poll the crank while the schedule is active
  useEffect(() => {
    if (!schedule) return;
    if (schedule.cancelled || schedule.remaining === 0n) return;
    const t = setInterval(async () => {
      const res = (await crank(id)) as { ok?: boolean; skipped?: boolean; reason?: string; error?: string };
      if (res.ok) {
        setCrankResult("Executed ✓");
        refetch();
      } else if (res.skipped) {
        setCrankResult(`Skipped: ${res.reason}`);
      } else if (res.error) {
        setCrankResult(`Error: ${res.error}`);
      }
    }, 2_000);
    return () => clearInterval(t);
  }, [id, schedule, refetch]);

  if (!schedule) {
    return (
      <Card>
        <div className="text-sm text-ink-muted font-mono">{shortAddr(id)} — loading…</div>
      </Card>
    );
  }

  const total = schedule.remaining + 0n; // remaining only — we don't store total separately on-chain
  const done = schedule.cancelled || schedule.remaining === 0n;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="text-xs text-ink-muted font-mono">{id}</div>
          <div className="text-sm text-ink">
            <span className="font-mono">{fmtStable(schedule.amount)} </span>
            → <span className="font-mono">{shortAddr(schedule.recipient)}</span>
          </div>
          <div className="text-xs text-ink-muted">
            every {schedule.interval.toString()}s · {schedule.remaining.toString()} payments left
          </div>
          {crankResult && <div className="text-xs text-ink-muted">{crankResult}</div>}
        </div>

        <div className="flex gap-2">
          {!done && (
            <TxButton
              phase="idle"
              variant="secondary"
              onClick={async () => {
                setCranking(true);
                const res = (await crank(id)) as { ok?: boolean; skipped?: boolean; reason?: string };
                setCrankResult(res.ok ? "Executed ✓" : `Skipped: ${res.reason}`);
                setCranking(false);
                refetch();
              }}
              disabled={cranking}
            >
              Crank now
            </TxButton>
          )}
          {!done && (
            <TxButton phase="idle" variant="danger" onClick={onCancel}>
              Cancel
            </TxButton>
          )}
          {done && (
            <a
              href="/stream"
              className="h-10 px-4 rounded-md border border-line bg-bg text-sm text-ink flex items-center hover:bg-brand-wash"
            >
              Start new
            </a>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 rounded-full bg-bg overflow-hidden">
        <div
          className="h-full bg-brand transition-all"
          style={{
            width: schedule.remaining === 0n ? "100%" : `${100 - Math.min(100, Number(schedule.remaining) * 100 / Math.max(1, Number(schedule.remaining) + 1))}%`,
          }}
        />
      </div>
      {/* Suppress unused-variable lint warning for total */}
      <span className="hidden">{total.toString()}</span>
    </Card>
  );
}
