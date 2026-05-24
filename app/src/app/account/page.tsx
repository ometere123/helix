"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ExternalLink } from "lucide-react";
import { useBalances } from "@/hooks/useBalances";
import { useExplorer } from "@/hooks/useExplorer";
import { useActivity } from "@/hooks/useActivity";
import { Card, CardLabel, StatRow } from "@/components/Card";
import { fmtStable } from "@/lib/format";
import { CIRCLE_FAUCET_URL } from "@/lib/contracts";

const QUICK_LINKS = [
  { href: "/vault",   label: "Vault"   },
  { href: "/flux",    label: "Flux"    },
  { href: "/stream",  label: "Stream"  },
  { href: "/lockbox", label: "Lockbox" },
  { href: "/grid",    label: "Grid"    },
  { href: "/agents",  label: "Agents"  },
  { href: "/bridge",  label: "Bridge"  },
];

type Tab = "overview" | "activity";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortHash(hash: string): string {
  if (!hash || hash.length < 10) return hash || "—";
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export default function AccountPage() {
  const { address, isConnected, chain } = useAccount();
  const { usdc, eurc } = useBalances();
  const { txUrl, addressUrl, name: explorerName } = useExplorer();
  const activity = useActivity();

  const [tab, setTab] = useState<Tab>("overview");

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="mb-2">
          <h1 className="text-3xl font-bold text-ink mb-1">Account</h1>
          <p className="text-sm text-ink-muted">Your wallet, balances, and activity.</p>
        </div>

        {!isConnected ? (
          <Card>
            <p className="text-ink-muted">Connect a wallet to see your balances and activity.</p>
          </Card>
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-line">
              {(["overview", "activity"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                    tab === t
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {t}
                  {t === "activity" && activity.entries.length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center size-4 rounded-full bg-brand text-white text-[10px] font-bold">
                      {activity.entries.length > 9 ? "9+" : activity.entries.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
                <Card className="lg:col-span-2">
                  <CardLabel>Connected address</CardLabel>
                  <div className="font-mono text-sm text-ink mb-3 break-all leading-relaxed">
                    {address}
                  </div>
                  <a
                    href={addressUrl(address!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
                  >
                    View on {explorerName}
                    <ExternalLink size={12} />
                  </a>
                </Card>

                <Card>
                  <CardLabel>Balances</CardLabel>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="rounded-md p-4 token-usdc border flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide opacity-70">USDC</span>
                      <span className="text-2xl font-bold font-mono">{fmtStable(usdc)}</span>
                    </div>
                    <div className="rounded-md p-4 token-eurc border flex flex-col gap-1">
                      <span className="text-xs font-semibold uppercase tracking-wide opacity-70">EURC</span>
                      <span className="text-2xl font-bold font-mono">{fmtStable(eurc)}</span>
                    </div>
                  </div>
                  <a
                    href={CIRCLE_FAUCET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-md bg-brand text-white text-sm font-semibold hover:bg-brand/90 transition-colors"
                  >
                    Get test USDC &amp; EURC
                    <ExternalLink size={12} />
                  </a>
                </Card>

                <Card className="lg:col-span-2">
                  <CardLabel>Network</CardLabel>
                  <StatRow label="Chain" value={chain?.name ?? "—"} mono={false} />
                  <StatRow label="Chain ID" value={String(chain?.id ?? "—")} />
                  <StatRow label="Native gas" value={chain?.nativeCurrency?.symbol ?? "—"} mono={false} />
                  <div className="mt-4 px-3 py-2.5 rounded-md bg-brand-wash border border-line text-xs text-ink-muted leading-relaxed">
                    <strong className="text-ink font-semibold">Arc gas model:</strong> Arc uses USDC as the
                    native gas token. Small amounts are deducted per transaction automatically. The ERC-20
                    interface used by Helix contracts is the same USDC viewed at 6 decimals.
                  </div>
                </Card>

                <Card>
                  <CardLabel>Quick links</CardLabel>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {QUICK_LINKS.map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        className="flex items-center justify-center h-10 px-3 rounded-md border border-line text-sm text-ink-muted hover:bg-brand-wash hover:text-brand transition-colors"
                      >
                        {label}
                      </Link>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {tab === "activity" && (
              <div className="space-y-3">
                {activity.entries.length === 0 ? (
                  <Card>
                    <div className="py-10 text-center text-ink-muted text-sm">
                      No transactions yet. Once you swap, deposit, or borrow, they&apos;ll appear here.
                    </div>
                  </Card>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-ink-muted">{activity.entries.length} transaction{activity.entries.length !== 1 ? "s" : ""} recorded locally</p>
                      <button
                        type="button"
                        onClick={activity.clear}
                        className="text-xs text-ink-muted hover:text-cta transition-colors"
                      >
                        Clear history
                      </button>
                    </div>
                    <Card className="overflow-hidden p-0">
                      <div className="divide-y divide-line">
                        {activity.entries.map((entry, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-brand-wash text-brand border border-brand/20">
                                  {entry.action}
                                </span>
                                <span className="text-xs text-ink-muted">{timeAgo(entry.ts)}</span>
                              </div>
                              <p className="text-sm text-ink truncate">{entry.detail}</p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {entry.hash ? (
                                <a
                                  href={txUrl(entry.hash)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-mono text-brand hover:underline"
                                >
                                  {shortHash(entry.hash)}
                                  <ExternalLink size={10} />
                                </a>
                              ) : (
                                <span className="text-xs text-ink-muted font-mono">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
