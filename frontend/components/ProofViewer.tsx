"use client";

import { useEffect, useState } from "react";

import { CopyChip, EmptyState, Icon, Tag } from "@/components/ui";
import { fetchTrail, gatewayUrls, type Trail } from "@/lib/ipfs";

const CHOICE_LABELS: Record<number, string> = { 0: "YES", 1: "NO", 2: "INVALID" };

function nodeVariant(label: string): "yes" | "no" | "warn" | "neutral" {
  if (label === "YES") return "yes";
  if (label === "NO") return "no";
  if (label === "INVALID") return "warn";
  return "neutral";
}

export default function ProofViewer({ cid }: { cid: string }) {
  const [trail, setTrail] = useState<Trail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrail(null);
    setErr(null);
    fetchTrail(cid)
      .then((t) => {
        if (!cancelled) setTrail(t);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [cid]);

  if (err) {
    return (
      <div className="panel">
        <div className="panel__body col gap-3">
          <div className="banner banner--warn"><Icon name="x" size={14} /> Failed to fetch trail: {err}</div>
          <p className="muted" style={{ margin: 0 }}>Try one of the gateways directly:</p>
          <div className="col gap-2">
            {gatewayUrls(cid).map((u) => (
              <a key={u} className="copy-chip" href={u} target="_blank" rel="noreferrer" style={{ width: "fit-content" }}>
                {u} <Icon name="external" size={12} />
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!trail) {
    return (
      <div className="panel">
        <EmptyState icon="reasoning" title="Loading reasoning trail" hint="Fetching from the first responsive IPFS gateway." />
      </div>
    );
  }

  const finalStep = trail.steps?.find((s) => s.type === "final_choice");
  const finalLabel =
    (finalStep as { label?: string; choice?: number } | undefined)?.label ??
    CHOICE_LABELS[(finalStep as { choice?: number } | undefined)?.choice ?? -1] ??
    "—";

  const promptHash = trail.promptSha256 ?? trail.promptKeccak;

  return (
    <div className="col gap-4">
      {/* Summary header */}
      <section className="panel">
        <div className="panel__body" style={{ padding: 20 }}>
          <div className="row between gap-3" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <Tag variant={nodeVariant(finalLabel)}>
              <Icon name="reasoning" size={12} /> Final · {finalLabel}
            </Tag>
            <CopyChip value={cid} label={`CID ${cid.slice(0, 10)}…`} />
          </div>
          {trail.marketQuestion && <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{trail.marketQuestion}</h1>}
          <p style={{ margin: "12px 0 0", color: "var(--text-secondary)", fontSize: 13 }}>
            {trail.modelName ? `Model: ${trail.modelName}` : "Model: —"}
            {trail.fulfilledAt ? ` · ${new Date(trail.fulfilledAt).toLocaleString()}` : ""}
            {trail.requestId ? ` · Request #${trail.requestId}` : ""}
          </p>
        </div>
      </section>

      {/* Reasoning trail timeline */}
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Reasoning trail</span>
          <Tag variant="neutral">{trail.steps?.length ?? 0} steps</Tag>
        </div>
        <div className="panel__body">
          <div className="trail">
            {/* Prompt node (the question the AI was asked + its hash) */}
            <div className="trail__step">
              <div className="trail__rail">
                <span className="trail__node trail__node--accent"><Icon name="file" size={14} /></span>
                <span className="trail__line" />
              </div>
              <div className="trail__body">
                <div className="trail__kicker">Prompt</div>
                <div className="trail__card">
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>
                    The resolver was asked to determine this market&apos;s outcome using only the whitelisted tools below.
                  </p>
                  {promptHash && (
                    <p style={{ margin: "8px 0 0" }}>
                      <span className="trail__kicker">prompt {trail.promptSha256 ? "sha256" : "keccak"}</span>
                      <br />
                      <span className="hash">{promptHash}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Steps */}
            {trail.steps?.map((step, i) => {
              if (step.type === "thought") {
                return (
                  <div key={i} className="trail__step">
                    <div className="trail__rail">
                      <span className="trail__node trail__node--accent"><Icon name="reasoning" size={14} /></span>
                      <span className="trail__line" />
                    </div>
                    <div className="trail__body">
                      <div className="trail__kicker">Thought</div>
                      <div className="trail__card">
                        <div style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)", fontSize: 13, lineHeight: 1.6 }}>{step.text}</div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (step.type === "tool_call") {
                return (
                  <div key={i} className="trail__step">
                    <div className="trail__rail">
                      <span className="trail__node"><Icon name="chain" size={14} /></span>
                      <span className="trail__line" />
                    </div>
                    <div className="trail__body">
                      <div className="trail__kicker">Tool call</div>
                      <details className="trail__card trail__card--tool">
                        <summary className="row gap-2">
                          <Icon name="chain" size={13} /> {step.tool}
                        </summary>
                        <pre className="trail__pre">{JSON.stringify({ args: step.args, result: step.result }, null, 2)}</pre>
                        {step.rawResponseSha256 && (
                          <p style={{ margin: "8px 0 0" }}>
                            <span className="trail__kicker">raw response sha256</span>
                            <br />
                            <span className="hash">{step.rawResponseSha256}</span>
                          </p>
                        )}
                      </details>
                    </div>
                  </div>
                );
              }
              if (step.type === "final_choice") {
                const v = nodeVariant(step.label);
                return (
                  <div key={i} className="trail__step">
                    <div className="trail__rail">
                      <span className={`trail__node trail__node--${v}`}><Icon name="check" size={14} /></span>
                      <span className="trail__line" />
                    </div>
                    <div className="trail__body">
                      <div className="trail__kicker">Final choice</div>
                      <div className="trail__card" style={{ borderColor: "var(--accent-border)" }}>
                        <div className="row gap-2" style={{ alignItems: "center" }}>
                          <Tag variant={v}>{step.label}</Tag>
                          <span className="font-mono muted" style={{ fontSize: 12 }}>choice = {step.choice}</span>
                        </div>
                        {step.rationale && (
                          <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6 }}>{step.rationale}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      </section>

      {/* IPFS verification */}
      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">IPFS gateways</span>
          <Tag variant="neutral">first responsive gateway wins</Tag>
        </div>
        <div className="panel__body col gap-2">
          {(trail.pins ?? gatewayUrls(cid)).map((p, i) => {
            let host = p;
            try {
              host = new URL(p).hostname;
            } catch {
              host = p;
            }
            return (
              <a key={`${p}-${i}`} href={p} target="_blank" rel="noreferrer" className="copy-chip" style={{ width: "fit-content" }}>
                [{host}] <Icon name="external" size={12} />
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
