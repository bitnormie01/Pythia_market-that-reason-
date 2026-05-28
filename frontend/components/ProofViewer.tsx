"use client";

import { useEffect, useState } from "react";

import { CopyChip, EmptyState, Icon, Tag } from "@/components/ui";
import { fetchTrail, gatewayUrls, type Trail } from "@/lib/ipfs";

const CHOICE_LABELS: Record<number, string> = { 0: "YES", 1: "NO", 2: "INVALID" };

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
              <a key={u} className="copy-chip" href={u} target="_blank" rel="noreferrer">
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
        <EmptyState icon="refresh" title="Loading reasoning trail" hint="Fetching from the first responsive IPFS gateway." />
      </div>
    );
  }

  const finalStep = trail.steps?.find((s) => s.type === "final_choice");
  const finalLabel =
    (finalStep as { label?: string; choice?: number } | undefined)?.label ??
    CHOICE_LABELS[(finalStep as { choice?: number } | undefined)?.choice ?? -1] ??
    "—";

  return (
    <div className="col gap-4">
      <section className="panel">
        <div className="panel__body" style={{ padding: 20 }}>
          <div className="row between gap-3" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <Tag variant={finalLabel === "YES" ? "yes" : finalLabel === "NO" ? "no" : finalLabel === "INVALID" ? "warn" : "neutral"}>
              Final · {finalLabel}
            </Tag>
            <CopyChip value={cid} label={`CID ${cid.slice(0, 10)}...`} />
          </div>
          {trail.marketQuestion && <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.3 }}>{trail.marketQuestion}</h1>}
          <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", fontSize: 13 }}>
            {trail.modelName ? `Model: ${trail.modelName}` : "Model: —"}
            {trail.fulfilledAt ? ` · ${new Date(trail.fulfilledAt).toLocaleString()}` : ""}
            {trail.requestId ? ` · Request #${trail.requestId}` : ""}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">Reasoning trail</span>
          <Tag variant="info">{trail.steps?.length ?? 0} steps</Tag>
        </div>
        <div className="panel__body col gap-3">
          {trail.steps?.map((step, i) => {
            if (step.type === "thought") {
              return (
                <div key={i} className="banner">
                  <Icon name="spark" size={14} />
                  <div style={{ whiteSpace: "pre-wrap" }}>{step.text}</div>
                </div>
              );
            }
            if (step.type === "tool_call") {
              return (
                <details key={i} className="panel" style={{ background: "var(--surface-2)" }}>
                  <summary className="row gap-2" style={{ cursor: "pointer", padding: 12, color: "var(--accent)" }}>
                    <Icon name="chain" size={14} /> tool_call: {step.tool}
                  </summary>
                  <div className="panel__body col gap-2">
                    <pre style={{ margin: 0, overflowX: "auto", whiteSpace: "pre-wrap", fontSize: 12 }}>
                      {JSON.stringify({ args: step.args, result: step.result }, null, 2)}
                    </pre>
                    {step.rawResponseSha256 && (
                      <p className="muted" style={{ margin: 0, wordBreak: "break-all", fontSize: 12 }}>
                        raw response sha256: {step.rawResponseSha256}
                      </p>
                    )}
                  </div>
                </details>
              );
            }
            if (step.type === "final_choice") {
              return (
                <div key={i} className="banner banner--yes">
                  <Icon name="check" size={14} />
                  <div>
                    <div className="font-mono">final_choice → {step.choice} ({step.label})</div>
                    {step.rationale && <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{step.rationale}</p>}
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
      </section>

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
