"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Card, StatRow } from "@/components/Card";
import { Field, Input, TextArea } from "@/components/Field";
import { TokenPicker } from "@/components/TokenPicker";
import { TxButton } from "@/components/TxButton";
import { useAgent, useAgentList, useAgentRegistryActions } from "@/hooks/useAgentRegistry";
import { USDC_ADDRESS, EURC_ADDRESS, type StableSymbol } from "@/lib/tokens";
import { fmtStable, parseStable, shortAddr } from "@/lib/format";

export default function AgentsPage() {
  const { isConnected } = useAccount();
  const actions = useAgentRegistryActions();
  const { ids, refetch } = useAgentList();

  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [capabilities, setCapabilities] = useState("text-gen, summarization");
  const [tokenSym, setTokenSym] = useState<StableSymbol>("USDC");
  const [price, setPrice] = useState("0.10");

  const token = tokenSym === "USDC" ? USDC_ADDRESS : EURC_ADDRESS;

  return (
    <main className="flex-1 px-3 sm:px-4 py-5 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink mb-1">Agents</h1>
          <p className="text-sm text-ink-muted">
            Register an agent on-chain with an endpoint URL and a USDC or EURC price per call. Callers pay the
            price; payment settles to the agent owner instantly. Off-chain invocation hits the endpoint.
          </p>
        </div>

        <Card>
          <h3 className="text-lg font-semibold text-ink mb-4">Register agent</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Name">
              <Input placeholder="ImageGen Bot" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Endpoint URL" hint="HTTPS endpoint the caller will hit after payment">
              <Input placeholder="https://api.example.com/agent" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
            </Field>
            <Field label="x402 Metadata URI" hint="Optional — IPFS or HTTPS URL of your x402 v2 payment manifest">
              <Input placeholder="ipfs://Qm… or https://…/x402.json" value={metadataURI} onChange={(e) => setMetadataURI(e.target.value)} />
            </Field>
            <Field label="Capabilities (comma-separated)">
              <TextArea
                rows={2}
                placeholder="text-gen, image-gen, summarization"
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
              />
            </Field>
            <Field label="Price per call">
              <div className="flex gap-2">
                <Input placeholder="0.10" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
                <TokenPicker value={tokenSym} onChange={setTokenSym} />
              </div>
            </Field>
          </div>
          <div className="mt-5">
            <TxButton
              phase={actions.phase}
              disabled={
                !isConnected ||
                !name.trim() ||
                !endpoint.startsWith("http") ||
                parseStable(price) === 0n
              }
              onClick={async () => {
                const caps = capabilities.split(",").map((s) => s.trim()).filter(Boolean);
                const res = await actions.register(name, endpoint, metadataURI, caps, token, parseStable(price));
                if (res) {
                  setName("");
                  setEndpoint("");
                  setMetadataURI("");
                  setPrice("0.10");
                  refetch();
                }
              }}
            >
              Register agent
            </TxButton>
          </div>
        </Card>

        {actions.error && (
          <Card className="border-cta">
            <div className="text-sm text-cta break-words">{actions.error}</div>
            <button className="mt-2 text-xs text-ink-muted hover:text-ink underline" onClick={actions.reset}>dismiss</button>
          </Card>
        )}

        <div>
          <h2 className="text-lg font-semibold text-ink mb-3">Registry ({ids.length})</h2>
          {ids.length === 0 ? (
            <Card><p className="text-sm text-ink-muted">No agents registered yet.</p></Card>
          ) : (
            <div className="space-y-3">
              {ids.map((id) => (
                <AgentRow
                  key={id}
                  id={id}
                  onInvoke={(price, token) => actions.invoke(id, token, price)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

type InvokeState =
  | { phase: "idle" }
  | { phase: "open" }
  | { phase: "paying" }
  | { phase: "calling"; txHash: string }
  | { phase: "done"; txHash: string; response: unknown }
  | { phase: "error"; message: string };

function AgentRow({
  id,
  onInvoke,
}: {
  id: `0x${string}`;
  onInvoke: (price: bigint, token: `0x${string}`) => Promise<`0x${string}` | undefined>;
}) {
  const { agent, refetch } = useAgent(id);
  const [state, setState] = useState<InvokeState>({ phase: "idle" });
  const [requestBody, setRequestBody] = useState('{\n  "prompt": ""\n}');

  if (!agent) return null;
  const sym = agent.paymentToken.toLowerCase() === USDC_ADDRESS.toLowerCase() ? "USDC" : "EURC";

  async function handleInvoke() {
    setState({ phase: "paying" });
    try {
      const txHash = await onInvoke(agent!.pricePerCall, agent!.paymentToken);
      if (!txHash) { setState({ phase: "idle" }); return; }

      setState({ phase: "calling", txHash });

      let parsed: unknown = requestBody;
      try { parsed = JSON.parse(requestBody); } catch { /* send raw string */ }

      const res = await fetch("/api/agents/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: agent!.endpointURL, txHash, request: parsed }),
      });
      const data = await res.json();
      setState({ phase: "done", txHash, response: data });
      refetch();
    } catch (e: unknown) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "unknown error" });
    }
  }

  const isOpen = state.phase !== "idle";

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-medium text-ink">{agent.name}</span>
            {!agent.active && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg text-ink-muted uppercase tracking-wide">
                inactive
              </span>
            )}
          </div>
          <div className="text-xs text-ink-muted font-mono mb-1">{shortAddr(id)}</div>
          <div className="text-xs text-ink-muted truncate">{agent.endpointURL}</div>
          {agent.metadataURI && (
            <div className="text-xs text-ink-muted truncate mt-0.5">
              <span className="font-medium">x402:</span> {agent.metadataURI}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.capabilities.map((c, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-brand-wash text-brand">
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="text-right space-y-1">
          <div className="text-lg font-semibold text-ink font-mono">
            {fmtStable(agent.pricePerCall)} {sym}
          </div>
          <div className="text-xs text-ink-muted">per call</div>
          {state.phase === "idle" ? (
            <button
              disabled={!agent.active}
              onClick={() => setState({ phase: "open" })}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-brand text-white disabled:opacity-40 hover:bg-brand/90 transition-colors"
            >
              Invoke
            </button>
          ) : (
            <button
              onClick={() => setState({ phase: "idle" })}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-surface border border-line text-ink-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-3">
        <StatRow label="Total calls" value={agent.totalCalls.toString()} />
        <StatRow label="Earned" value={`${fmtStable(agent.totalEarned)} ${sym}`} />
      </div>

      {/* ── Invoke panel ─────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="mt-4 pt-4 border-t border-line space-y-3">
          {(state.phase === "open" || state.phase === "paying") && (
            <>
              <Field label="Request body (JSON)" hint={`Sent to ${agent.endpointURL} after payment confirms`}>
                <TextArea
                  rows={4}
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  className="font-mono text-xs"
                />
              </Field>
              <TxButton
                phase={state.phase === "paying" ? "pending" : "idle"}
                disabled={state.phase === "paying"}
                onClick={handleInvoke}
              >
                Pay {fmtStable(agent.pricePerCall)} {sym} + call endpoint
              </TxButton>
            </>
          )}

          {state.phase === "calling" && (
            <div className="text-sm text-ink-muted">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-brand animate-pulse" />
                Calling endpoint…
              </div>
              <div className="mt-1 text-xs font-mono text-ink-muted">
                proof: {state.txHash.slice(0, 18)}…
              </div>
            </div>
          )}

          {state.phase === "done" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-brand font-medium">
                <span>✓</span>
                <span>Payment confirmed · endpoint called</span>
              </div>
              <div className="text-xs font-mono text-ink-muted">
                tx: <a
                  href={`${process.env.NEXT_PUBLIC_EXPLORER_URL}/tx/${state.txHash}`}
                  target="_blank" rel="noreferrer"
                  className="text-brand hover:underline"
                >{state.txHash.slice(0, 18)}…</a>
              </div>
              <div className="rounded-md bg-surface border border-line p-3 max-h-48 overflow-y-auto">
                <pre className="text-xs text-ink whitespace-pre-wrap break-all">
                  {JSON.stringify(state.response, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {state.phase === "error" && (
            <div className="text-sm text-cta">
              {state.message}
              <button
                className="ml-3 text-xs text-ink-muted hover:text-ink underline"
                onClick={() => setState({ phase: "open" })}
              >
                retry
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
