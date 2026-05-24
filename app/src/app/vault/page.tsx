"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Card, StatRow } from "@/components/Card";
import { Field, Input } from "@/components/Field";
import { TokenPicker } from "@/components/TokenPicker";
import { TxButton } from "@/components/TxButton";
import { useVaultData, useVaultActions } from "@/hooks/useVault";
import { useBalances } from "@/hooks/useBalances";
import { TOKENS, USDC_ADDRESS, EURC_ADDRESS, type StableSymbol } from "@/lib/tokens";
import { fmtStable, parseStable, fmtHealthFactor, fmtPct1e18 } from "@/lib/format";

type Tab = "supply" | "borrow";

export default function VaultPage() {
  const { isConnected } = useAccount();
  const actions  = useVaultActions();
  const balances = useBalances();

  // Active tab
  const [tab, setTab] = useState<Tab>("supply");

  // Supply tab state
  const [supplySym, setSupplySym] = useState<StableSymbol>("USDC");
  const [supplyAmt, setSupplyAmt] = useState("");

  // Borrow tab state
  const [debtSym, setDebtSym]         = useState<StableSymbol>("USDC");
  const [collateralSym, setCollateralSym] = useState<StableSymbol>("EURC");
  const [borrowAmt, setBorrowAmt]     = useState("");
  const [repayAmt, setRepayAmt]       = useState("");

  const supplyToken     = TOKENS[supplySym].address;
  const debtToken       = TOKENS[debtSym].address;
  const collateralToken = TOKENS[collateralSym].address;

  // Vault data for current selections
  const data = useVaultData(
    tab === "supply" ? supplyToken : debtToken,
    collateralToken,
  );

  // Prevent same debt + collateral token
  const samePair = debtSym === collateralSym;

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Vault</h1>
          <p className="text-sm text-ink-muted">
            Supply stablecoins to earn yield or borrow against cross-asset collateral.
            Prices are pulled from an on-chain oracle — no hardcoded assumptions.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg bg-bg p-1 w-fit border border-line">
          {(["supply", "borrow"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Supply Tab ───────────────────────────────────────────────────── */}
        {tab === "supply" && (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink-muted">Asset:</span>
              <TokenPicker value={supplySym} onChange={setSupplySym} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <div className="text-xs uppercase tracking-wide text-ink-muted mb-3">
                  Your supply ({supplySym})
                </div>
                <StatRow label="Supplied" value={`${fmtStable(data.supplied)} ${supplySym}`} />
              </Card>

              <Card>
                <div className="text-xs uppercase tracking-wide text-ink-muted mb-3">
                  Market ({supplySym})
                </div>
                <StatRow label="Total supplied"  value={`${fmtStable(data.totalSupplied)} ${supplySym}`} />
                <StatRow label="Total borrowed"  value={`${fmtStable(data.totalBorrowed)} ${supplySym}`} />
                <StatRow label="Utilization"     value={fmtPct1e18(data.utilization)} />
                <StatRow label="Supply APR"      value="5.00%" />
              </Card>

              <Card>
                <div className="text-xs uppercase tracking-wide text-ink-muted mb-3">
                  Risk parameters ({supplySym})
                </div>
                {supplySym === "USDC" ? (
                  <>
                    <StatRow label="Max LTV"         value="90%" />
                    <StatRow label="Liq. threshold"  value="92%" />
                    <StatRow label="Liq. bonus"      value="2%" />
                  </>
                ) : (
                  <>
                    <StatRow label="Max LTV"         value="85%" />
                    <StatRow label="Liq. threshold"  value="88%" />
                    <StatRow label="Liq. bonus"      value="3%" />
                  </>
                )}
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <h3 className="text-lg font-semibold text-ink mb-4">
                  Supply &amp; withdraw {supplySym}
                </h3>
                <Field
                  label="Amount"
                  hint={
                    isConnected ? (
                      <span className="flex items-center gap-1.5">
                        Balance: {fmtStable(supplySym === "USDC" ? balances.usdc : balances.eurc)} {supplySym}
                        <button
                          type="button"
                          onClick={() => setSupplyAmt(fmtStable(supplySym === "USDC" ? balances.usdc : balances.eurc))}
                          className="text-brand font-semibold hover:underline"
                        >
                          Max
                        </button>
                      </span>
                    ) : "Earn 5% APR from borrowers"
                  }
                >
                  <Input
                    placeholder="0.00"
                    value={supplyAmt}
                    onChange={(e) => setSupplyAmt(e.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <div className="flex gap-2 mt-4">
                  <TxButton
                    phase={actions.phase}
                    disabled={!isConnected || parseStable(supplyAmt) === 0n}
                    onClick={async () => {
                      await actions.deposit(supplyToken, parseStable(supplyAmt));
                      setSupplyAmt("");
                      data.refetch();
                    }}
                  >
                    Supply
                  </TxButton>
                  <TxButton
                    phase="idle"
                    variant="secondary"
                    disabled={!isConnected || parseStable(supplyAmt) === 0n}
                    onClick={async () => {
                      await actions.withdraw(supplyToken, parseStable(supplyAmt));
                      setSupplyAmt("");
                      data.refetch();
                    }}
                  >
                    Withdraw
                  </TxButton>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ── Borrow Tab ───────────────────────────────────────────────────── */}
        {tab === "borrow" && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-muted">Borrow:</span>
                <TokenPicker value={debtSym} onChange={setDebtSym} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-muted">Collateral:</span>
                <TokenPicker value={collateralSym} onChange={setCollateralSym} />
              </div>
              {samePair && (
                <span className="text-sm text-cta">Debt and collateral must be different tokens.</span>
              )}
            </div>

            {!samePair && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <div className="text-xs uppercase tracking-wide text-ink-muted mb-3">
                      Your position ({debtSym} debt / {collateralSym} collateral)
                    </div>
                    <StatRow label={`Borrowed (${debtSym})`}       value={`${fmtStable(data.borrowed)} ${debtSym}`} />
                    <StatRow label={`Collateral (${collateralSym})`} value={`${fmtStable(data.collateral)} ${collateralSym}`} />
                    <StatRow label="Health factor" value={fmtHealthFactor(data.healthFactor)} />
                    {data.healthFactor !== undefined && data.healthFactor < 10n ** 18n && (
                      <div className="mt-2 text-xs text-cta font-medium">
                        ⚠ Health factor below 1 — position is liquidatable.
                      </div>
                    )}
                  </Card>

                  <Card>
                    <div className="text-xs uppercase tracking-wide text-ink-muted mb-3">
                      {debtSym} market
                    </div>
                    <StatRow label="Total supplied"  value={`${fmtStable(data.totalSupplied)} ${debtSym}`} />
                    <StatRow label="Total borrowed"  value={`${fmtStable(data.totalBorrowed)} ${debtSym}`} />
                    <StatRow label="Utilization"     value={fmtPct1e18(data.utilization)} />
                    <StatRow label="Borrow APR"      value="5.00%" />
                  </Card>

                  <Card>
                    <div className="text-xs uppercase tracking-wide text-ink-muted mb-3">
                      Risk parameters
                    </div>
                    {debtSym === "USDC" ? (
                      <>
                        <StatRow label="Max LTV"        value="90%" />
                        <StatRow label="Liq. threshold" value="92%" />
                        <StatRow label="Liq. bonus"     value="2%" />
                      </>
                    ) : (
                      <>
                        <StatRow label="Max LTV"        value="85%" />
                        <StatRow label="Liq. threshold" value="88%" />
                        <StatRow label="Liq. bonus"     value="3%" />
                      </>
                    )}
                    <div className="mt-2 text-xs text-ink-muted">
                      Prices via on-chain oracle. Collateral posted is determined by the
                      oracle at transaction time.
                    </div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Borrow */}
                  <Card>
                    <h3 className="text-lg font-semibold text-ink mb-4">
                      Borrow {debtSym}
                    </h3>
                    <Field
                      label={`Amount to borrow`}
                      hint={
                        isConnected ? (
                          <span>
                            Collateral bal: {fmtStable(collateralSym === "USDC" ? balances.usdc : balances.eurc)} {collateralSym} · oracle determines exact amount locked
                          </span>
                        ) : `Collateral (${collateralSym}) is calculated by the oracle at the time of the transaction`
                      }
                    >
                      <Input
                        placeholder="0.00"
                        value={borrowAmt}
                        onChange={(e) => setBorrowAmt(e.target.value)}
                        inputMode="decimal"
                      />
                    </Field>
                    <div className="mt-4">
                      <TxButton
                        phase={actions.phase}
                        disabled={!isConnected || parseStable(borrowAmt) === 0n || samePair}
                        onClick={async () => {
                          await actions.borrow(debtToken, collateralToken, parseStable(borrowAmt));
                          setBorrowAmt("");
                          data.refetch();
                        }}
                      >
                        Borrow {debtSym}
                      </TxButton>
                    </div>
                  </Card>

                  {/* Repay */}
                  <Card>
                    <h3 className="text-lg font-semibold text-ink mb-4">
                      Repay {debtSym}
                    </h3>
                    <Field
                      label="Amount to repay"
                      hint={
                        isConnected ? (
                          <span className="flex items-center gap-1.5">
                            Balance: {fmtStable(debtSym === "USDC" ? balances.usdc : balances.eurc)} {debtSym}
                            <button
                              type="button"
                              onClick={() => setRepayAmt(fmtStable(debtSym === "USDC" ? balances.usdc : balances.eurc))}
                              className="text-brand font-semibold hover:underline"
                            >
                              Max
                            </button>
                            <span className="text-ink-muted">· releases {collateralSym} pro-rata</span>
                          </span>
                        ) : `Repaying releases ${collateralSym} collateral pro-rata`
                      }
                    >
                      <Input
                        placeholder="0.00"
                        value={repayAmt}
                        onChange={(e) => setRepayAmt(e.target.value)}
                        inputMode="decimal"
                      />
                    </Field>
                    <div className="mt-4 flex gap-2">
                      <TxButton
                        phase={actions.phase}
                        variant="secondary"
                        disabled={!isConnected || parseStable(repayAmt) === 0n || samePair}
                        onClick={async () => {
                          await actions.repay(debtToken, collateralToken, parseStable(repayAmt));
                          setRepayAmt("");
                          data.refetch();
                        }}
                      >
                        Repay {debtSym}
                      </TxButton>
                      {/* Quick-fill max debt */}
                      {data.borrowed > 0n && (
                        <button
                          className="text-xs text-brand underline hover:text-brand/80"
                          onClick={() => setRepayAmt(
                            (Number(data.borrowed) / 1e6).toFixed(6)
                          )}
                        >
                          Max ({fmtStable(data.borrowed)} {debtSym})
                        </button>
                      )}
                    </div>
                  </Card>
                </div>
              </>
            )}
          </>
        )}

        {/* Error banner */}
        {actions.error && (
          <Card className="border-cta">
            <div className="text-sm text-cta break-words">{actions.error}</div>
            <button
              className="mt-2 text-xs text-ink-muted hover:text-ink underline"
              onClick={actions.reset}
            >
              dismiss
            </button>
          </Card>
        )}
      </div>
    </main>
  );
}
