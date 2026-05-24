"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { keccak256, toBytes } from "viem";
import { Card, StatRow } from "@/components/Card";
import { Field, Input, TextArea } from "@/components/Field";
import { TokenPicker } from "@/components/TokenPicker";
import { TxButton } from "@/components/TxButton";
import { useBalances } from "@/hooks/useBalances";
import { useBounty, useBountyList, useForgeActions } from "@/hooks/useForge";
import { USDC_ADDRESS, EURC_ADDRESS, type StableSymbol } from "@/lib/tokens";
import { fmtStable, parseStable, shortAddr } from "@/lib/format";

const DISPUTE_WINDOW_DAYS = 3;

function timeLeft(submittedAt: bigint): string {
  const deadline = Number(submittedAt) * 1000 + DISPUTE_WINDOW_DAYS * 86_400_000;
  const diff = deadline - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

export default function GridPage() {
  const { isConnected, address } = useAccount();
  const actions  = useForgeActions();
  const balances = useBalances();
  const { ids, refetch } = useBountyList();

  const [tokenSym, setTokenSym] = useState<StableSymbol>("USDC");
  const [amount, setAmount]     = useState("");
  const [title, setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [isAgent, setIsAgent]   = useState(false);

  const token = tokenSym === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Grid · Agent Task Market</h1>
          <p className="text-sm text-ink-muted">
            Post a task with escrowed USDC or EURC. Workers — human or AI agent — submit proof
            on-chain. You release payment or dispute. After {DISPUTE_WINDOW_DAYS} days of silence the
            worker self-collects automatically.
          </p>
        </div>

        {/* ── Post bounty ─────────────────────────────────────────────────── */}
        <Card>
          <h3 className="text-lg font-semibold text-ink mb-4">Post a task</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Title">
              <Input placeholder="Index 100 product images" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field
              label="Bounty"
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
              <div className="flex gap-2">
                <Input placeholder="25.00" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                <TokenPicker value={tokenSym} onChange={setTokenSym} />
              </div>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Description">
              <TextArea
                rows={3}
                placeholder="What needs to be done, where to deliver, criteria for completion…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="checkbox" id="agent-task" checked={isAgent}
              onChange={(e) => setIsAgent(e.target.checked)}
              className="size-4 accent-brand"
            />
            <label htmlFor="agent-task" className="text-sm text-ink">
              This is an AI-agent task
            </label>
          </div>
          <div className="mt-5">
            <TxButton
              phase={actions.phase}
              disabled={!isConnected || parseStable(amount) === 0n || !title.trim()}
              onClick={async () => {
                const meta = JSON.stringify({ title, description, isAgent });
                const res = await actions.post(token, parseStable(amount), meta);
                if (res) {
                  setTitle(""); setDescription(""); setAmount("");
                  refetch();
                }
              }}
            >
              Post bounty
            </TxButton>
          </div>
        </Card>

        {actions.error && (
          <Card className="border-cta">
            <div className="text-sm text-cta break-words">{actions.error}</div>
            <button className="mt-2 text-xs text-ink-muted hover:text-ink underline" onClick={actions.reset}>dismiss</button>
          </Card>
        )}

        {/* ── Bounty list ──────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">Bounties ({ids.length})</h2>
          {ids.length === 0 ? (
            <Card><p className="text-sm text-ink-muted">No bounties yet. Post one above.</p></Card>
          ) : (
            <div className="space-y-3">
              {ids.map((id) => (
                <BountyRow
                  key={id} id={id}
                  myAddress={address}
                  onRelease={async () => { await actions.release(id); await refetch(); }}
                  onDispute={async () => { await actions.dispute(id); await refetch(); }}
                  onCancel={async () => { await actions.cancel(id); await refetch(); }}
                  onSubmit={async (hash, uri) => { await actions.submitWork(id, hash, uri); await refetch(); }}
                  onFinalize={async () => { await actions.finalizeWork(id); await refetch(); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── BountyRow ─────────────────────────────────────────────────────────────────
function BountyRow({
  id,
  myAddress,
  onRelease,
  onDispute,
  onCancel,
  onSubmit,
  onFinalize,
}: {
  id: `0x${string}`;
  myAddress: string | undefined;
  onRelease: () => Promise<void>;
  onDispute: () => Promise<void>;
  onCancel: () => Promise<void>;
  onSubmit: (hash: `0x${string}`, uri: string) => Promise<void>;
  onFinalize: () => Promise<void>;
}) {
  const { bounty, refetch } = useBounty(id);
  const [submitURI, setSubmitURI] = useState("");

  if (!bounty) return null;

  const meta = (() => {
    try { return JSON.parse(bounty.metadataURI); }
    catch { return { title: bounty.metadataURI }; }
  })() as { title?: string; description?: string; isAgent?: boolean };

  const sym      = bounty.token.toLowerCase() === USDC_ADDRESS.toLowerCase() ? "USDC" : "EURC";
  const settled  = bounty.released || bounty.cancelled;
  const isPoster = myAddress?.toLowerCase() === bounty.poster.toLowerCase();
  const isWorker = myAddress?.toLowerCase() === bounty.worker.toLowerCase();
  const hasPendingWork = bounty.worker !== "0x0000000000000000000000000000000000000000";
  const windowExpired  = hasPendingWork && Date.now() > Number(bounty.submittedAt) * 1000 + DISPUTE_WINDOW_DAYS * 86_400_000;

  // Status label + color
  const statusLabel =
    bounty.released  ? "Released ✓"  :
    bounty.cancelled ? "Cancelled"   :
    hasPendingWork   ? "Work pending" : "Open";
  const statusColor =
    bounty.released  ? "text-brand"     :
    bounty.cancelled ? "text-ink-muted" :
    hasPendingWork   ? "text-amber-500" : "text-ink-muted";

  return (
    <Card>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {meta.isAgent && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-wash text-brand uppercase tracking-wide">agent</span>
            )}
            <span className="text-base font-medium text-ink">{meta.title ?? "(untitled)"}</span>
          </div>
          {meta.description && <p className="text-sm text-ink-muted mb-1">{meta.description}</p>}
          <div className="text-xs text-ink-muted font-mono">
            {shortAddr(id)} · posted by {shortAddr(bounty.poster)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-ink font-mono">{fmtStable(bounty.amount)} {sym}</div>
          <div className={`text-xs font-medium ${statusColor}`}>{statusLabel}</div>
        </div>
      </div>

      {/* Work submission details */}
      {hasPendingWork && !settled && (
        <div className="mt-3 p-3 rounded-md bg-surface border border-line space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink uppercase tracking-wide">Submitted work</span>
            <span className="text-xs text-ink-muted">
              {windowExpired ? (
                <span className="text-amber-500 font-medium">dispute window expired</span>
              ) : (
                <>window closes in <span className="font-mono">{timeLeft(bounty.submittedAt)}</span></>
              )}
            </span>
          </div>
          <StatRow label="Worker" value={shortAddr(bounty.worker)} />
          <StatRow label="Deliverable" value={
            <a href={bounty.submissionURI} target="_blank" rel="noopener noreferrer"
               className="text-brand hover:underline truncate max-w-xs inline-block">
              {bounty.submissionURI.length > 40 ? bounty.submissionURI.slice(0, 40) + "…" : bounty.submissionURI}
            </a>
          } />
          <StatRow label="Proof hash" value={
            <span className="font-mono text-[11px]">{bounty.deliverableHash.slice(0, 14)}…</span>
          } />
        </div>
      )}

      {/* Actions */}
      {!settled && (
        <div className="mt-4 space-y-3">
          {/* Poster controls */}
          {isPoster && hasPendingWork && (
            <div className="flex gap-2">
              <TxButton phase="idle" onClick={async () => { await onRelease(); refetch(); }}>
                Release payment
              </TxButton>
              <TxButton phase="idle" variant="danger" onClick={async () => { await onDispute(); refetch(); }}>
                Dispute
              </TxButton>
            </div>
          )}
          {isPoster && !hasPendingWork && (
            <TxButton phase="idle" variant="danger" onClick={async () => { await onCancel(); refetch(); }}>
              Cancel &amp; refund
            </TxButton>
          )}

          {/* Worker: submit work */}
          {!isPoster && !hasPendingWork && (
            <div className="space-y-2">
              <Field
                label="Submit deliverable"
                hint="IPFS link, GitHub PR, Google Drive URL — anything verifiable"
              >
                <Input
                  placeholder="https://… or ipfs://…"
                  value={submitURI}
                  onChange={(e) => setSubmitURI(e.target.value)}
                />
              </Field>
              <TxButton
                phase="idle"
                disabled={!submitURI.startsWith("http") && !submitURI.startsWith("ipfs")}
                onClick={async () => {
                  // hash = keccak256 of the URI bytes — content-addressable proof
                  const hash = keccak256(toBytes(submitURI)) as `0x${string}`;
                  await onSubmit(hash, submitURI);
                  setSubmitURI("");
                  refetch();
                }}
              >
                Submit work
              </TxButton>
            </div>
          )}

          {/* Worker: finalize after window */}
          {isWorker && hasPendingWork && windowExpired && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                The {DISPUTE_WINDOW_DAYS}-day dispute window has expired. You can now collect payment.
              </p>
              <TxButton phase="idle" onClick={async () => { await onFinalize(); refetch(); }}>
                Finalize &amp; collect
              </TxButton>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
