"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { Card, StatRow } from "@/components/Card";
import { Field, Input } from "@/components/Field";
import { TokenPicker } from "@/components/TokenPicker";
import { TxButton } from "@/components/TxButton";
import { useLock, useLockboxActions, generateNonce } from "@/hooks/useLockbox";
import { useBalances } from "@/hooks/useBalances";
import { USDC_ADDRESS, EURC_ADDRESS, type StableSymbol } from "@/lib/tokens";
import { fmtStable, parseStable, shortAddr } from "@/lib/format";

function timeUntil(expiry: bigint): string {
  const diff = Number(expiry) * 1000 - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

function LockboxInner() {
  const { isConnected } = useAccount();
  const balances = useBalances();
  const params = useSearchParams();
  const claimNonceParam = params.get("claim") as `0x${string}` | null;
  const claimLockId    = params.get("lockId") as `0x${string}` | null;
  const actions = useLockboxActions();

  // Deposit form
  const [tokenSym, setTokenSym]     = useState<StableSymbol>("USDC");
  const [amount, setAmount]         = useState("");
  const [expiryHours, setExpiryHours] = useState("24");
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [resultLockId, setResultLockId] = useState<`0x${string}` | null>(null);

  // Claim form
  const [claimId, setClaimId]       = useState(claimLockId ?? "");
  const [claimNonce, setClaimNonce] = useState(claimNonceParam ?? "");

  const validClaimId = claimId.startsWith("0x") && claimId.length === 66
    ? claimId as `0x${string}`
    : undefined;
  const { lock, refetch } = useLock(validClaimId);

  const token = tokenSym === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;

  // Derived lock state
  const lockExists  = !!lock && lock.depositor !== "0x0000000000000000000000000000000000000000";
  const lockExpired = lockExists && Date.now() >= Number(lock!.expiry) * 1000;
  const lockSym     = lockExists ? (lock!.token.toLowerCase() === USDC_ADDRESS.toLowerCase() ? "USDC" : "EURC") : "";
  const lockSettled = lockExists && (lock!.claimed || lock!.refunded);

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Lockbox</h1>
          <p className="text-sm text-ink-muted">
            Lock funds behind a secret. Share the URL; the recipient claims with the nonce.
            After expiry anyone can trigger the refund — funds always return to the original depositor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ── Create lock ─────────────────────────────────────────────────── */}
          <Card>
            <h3 className="text-lg font-semibold text-ink mb-4">Create a lock</h3>
            <div className="space-y-3">
              <Field label="Token">
                <div className="pt-1"><TokenPicker value={tokenSym} onChange={setTokenSym} /></div>
              </Field>
              <Field
                label="Amount"
                hint={
                  isConnected ? (
                    <span className="flex items-center gap-1.5">
                      Balance: {fmtStable(tokenSym === "USDC" ? balances.usdc : balances.eurc)} {tokenSym}
                      <button
                        type="button"
                        onClick={() => setAmount(fmtStable(tokenSym === "USDC" ? balances.usdc : balances.eurc))}
                        className="text-brand font-semibold hover:underline"
                      >
                        Max
                      </button>
                    </span>
                  ) : undefined
                }
              >
                <Input placeholder="50.00" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Expires in (hours)" hint="After this window anyone can refund the funds back to you">
                <Input value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} inputMode="numeric" />
              </Field>
            </div>

            <div className="mt-5">
              <TxButton
                phase={actions.phase}
                disabled={!isConnected || parseStable(amount) === 0n || !parseInt(expiryHours)}
                onClick={async () => {
                  const nonce = generateNonce();
                  const expirySec = BigInt(Math.floor(Date.now() / 1000) + parseInt(expiryHours) * 3600);
                  const res = await actions.deposit(token, parseStable(amount), nonce, expirySec);
                  if (res) {
                    setResultLockId(res.lockId);
                    const url = new URL(window.location.href);
                    url.search = `?lockId=${res.lockId}&claim=${nonce}`;
                    setResultLink(url.toString());
                  }
                }}
              >
                Create lock
              </TxButton>
            </div>

            {resultLink && (
              <div className="mt-5 p-4 rounded-md bg-brand-wash border border-brand">
                <div className="text-xs uppercase tracking-wide text-brand font-medium mb-2">Share this link</div>
                <div className="text-xs text-ink font-mono break-all mb-2">{resultLink}</div>
                <button
                  className="text-xs text-brand hover:underline"
                  onClick={() => navigator.clipboard.writeText(resultLink)}
                >
                  Copy to clipboard
                </button>
                {resultLockId && (
                  <div className="mt-2 text-xs text-ink-muted">
                    Lock ID: <span className="font-mono">{shortAddr(resultLockId)}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ── Claim / inspect ─────────────────────────────────────────────── */}
          <Card>
            <h3 className="text-lg font-semibold text-ink mb-4">Claim a lock</h3>
            <div className="space-y-3">
              <Field label="Lock ID">
                <Input placeholder="0x…" value={claimId} onChange={(e) => setClaimId(e.target.value)} />
              </Field>
              <Field label="Nonce (secret)" hint="Only needed to claim — not required to trigger a refund">
                <Input placeholder="0x…" value={claimNonce} onChange={(e) => setClaimNonce(e.target.value)} />
              </Field>
            </div>

            {/* Lock details */}
            {lockExists && lock && (
              <div className="mt-4 rounded-md border border-line overflow-hidden">
                {/* Status banner */}
                {lock.claimed && (
                  <div className="px-3 py-2 bg-brand/10 border-b border-line text-xs font-medium text-brand">
                    Claimed ✓
                  </div>
                )}
                {lock.refunded && (
                  <div className="px-3 py-2 bg-surface border-b border-line text-xs font-medium text-ink-muted">
                    Refunded — funds returned to depositor
                  </div>
                )}
                {!lockSettled && lockExpired && (
                  <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 text-xs font-medium text-amber-700 dark:text-amber-300">
                    Expired — claim window closed. Refund is now available.
                  </div>
                )}
                {!lockSettled && !lockExpired && (
                  <div className="px-3 py-2 bg-brand-wash border-b border-line text-xs font-medium text-brand">
                    Open · closes in {timeUntil(lock.expiry)}
                  </div>
                )}

                <div className="p-3 space-y-0.5 text-xs">
                  <StatRow label="Amount"    value={`${fmtStable(lock.amount)} ${lockSym}`} />
                  <StatRow label="Depositor" value={shortAddr(lock.depositor)} />
                  <StatRow label="Expires"   value={new Date(Number(lock.expiry) * 1000).toLocaleString()} />
                </div>
              </div>
            )}

            {validClaimId && !lockExists && (
              <div className="mt-4 text-xs text-ink-muted">
                Lock not found — may not exist or the ID is incorrect.
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex flex-col gap-2">
              {/* Claim — only while not expired and not settled */}
              {(!lockExists || (!lockSettled && !lockExpired)) && (
                <TxButton
                  phase="idle"
                  disabled={!isConnected || !validClaimId || !claimNonce.startsWith("0x")}
                  onClick={async () => {
                    await actions.claim(claimId as `0x${string}`, claimNonce as `0x${string}`);
                    refetch();
                  }}
                >
                  Claim
                </TxButton>
              )}

              {/* Refund — available to anyone once expired */}
              {(!lockExists || (!lockSettled && lockExpired)) && (
                <TxButton
                  phase="idle"
                  variant={lockExpired ? "primary" as never : "secondary"}
                  disabled={!isConnected || !validClaimId}
                  onClick={async () => {
                    await actions.refund(claimId as `0x${string}`);
                    refetch();
                  }}
                >
                  {lockExpired ? "Refund to depositor" : "Refund (depositor only before expiry)"}
                </TxButton>
              )}
            </div>
          </Card>
        </div>

        {actions.error && (
          <Card className="border-cta">
            <div className="text-sm text-cta break-words">{actions.error}</div>
            <button className="mt-2 text-xs text-ink-muted hover:text-ink underline" onClick={actions.reset}>
              dismiss
            </button>
          </Card>
        )}
      </div>
    </main>
  );
}

export default function LockboxPage() {
  return (
    <Suspense fallback={<div className="p-12 text-ink-muted">Loading…</div>}>
      <LockboxInner />
    </Suspense>
  );
}
