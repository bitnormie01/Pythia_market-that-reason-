"use client";

import { useEffect, useState } from "react";

import { fetchTrail, gatewayUrls, type Trail } from "@/lib/ipfs";

const CHOICE_LABELS: Record<number, string> = { 0: "YES", 1: "NO", 2: "INVALID" };

export default function ProofViewer({ cid }: { cid: string }) {
  const [trail, setTrail] = useState<Trail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
      <div className="font-mono text-sm space-y-2">
        <p className="text-rose-400">Failed to fetch trail: {err}</p>
        <p className="text-zinc-500">
          Try one of the gateways directly:
        </p>
        <ul className="text-xs text-zinc-400 space-y-1">
          {gatewayUrls(cid).map((u) => (
            <li key={u}>
              <a className="text-emerald-400 hover:underline" href={u} target="_blank" rel="noreferrer">
                {u}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (!trail) {
    return <p className="text-zinc-500 font-mono text-sm">Loading reasoning trail…</p>;
  }

  const finalStep = trail.steps?.find((s) => s.type === "final_choice");
  const finalLabel =
    (finalStep as { label?: string; choice?: number } | undefined)?.label ??
    CHOICE_LABELS[(finalStep as { choice?: number } | undefined)?.choice ?? -1] ??
    "—";

  return (
    <div className="font-mono text-sm space-y-4">
      <header className="border-b border-zinc-800 pb-3 space-y-1">
        {trail.marketQuestion && <h2 className="text-lg text-zinc-100">{trail.marketQuestion}</h2>}
        <p className="text-zinc-500">
          Resolved: <span className="text-emerald-400">{finalLabel}</span>
          {trail.modelName ? ` · Model: ${trail.modelName}` : ""}
          {trail.fulfilledAt ? ` · ${new Date(trail.fulfilledAt).toLocaleString()}` : ""}
        </p>
        <p className="text-xs text-zinc-600 break-all">CID: {cid}</p>
        {trail.requestId && <p className="text-xs text-zinc-600">Request #{trail.requestId}</p>}
      </header>

      <div className="space-y-3">
        {trail.steps?.map((step, i) => {
          if (step.type === "thought") {
            return (
              <div key={i} className="text-zinc-300 italic pl-4 border-l border-zinc-700 whitespace-pre-wrap">
                ▸ {step.text}
              </div>
            );
          }
          if (step.type === "tool_call") {
            return (
              <details key={i} className="bg-zinc-900 rounded p-3 border border-zinc-800">
                <summary className="cursor-pointer text-emerald-400">▸ tool_call: {step.tool}</summary>
                <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify({ args: step.args, result: step.result }, null, 2)}
                </pre>
                {step.rawResponseSha256 && (
                  <p className="text-xs text-zinc-600 mt-2 break-all">raw response sha256: {step.rawResponseSha256}</p>
                )}
              </details>
            );
          }
          if (step.type === "final_choice") {
            return (
              <div key={i} className="bg-emerald-950/40 border border-emerald-700 rounded p-3">
                <p className="text-emerald-300">
                  ▸ final_choice → {step.choice} ({step.label})
                </p>
                {step.rationale && <p className="text-zinc-300 mt-2 whitespace-pre-wrap">{step.rationale}</p>}
              </div>
            );
          }
          return null;
        })}
      </div>

      <footer className="border-t border-zinc-800 pt-3 text-xs text-zinc-500 space-y-1">
        <p>Verify on IPFS:</p>
        <ul className="space-y-0.5">
          {(trail.pins ?? gatewayUrls(cid)).map((p, i) => {
            let host = p;
            try {
              host = new URL(p).hostname;
            } catch {
              host = p;
            }
            return (
              <li key={i}>
                <a href={p} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline mr-3">
                  [{host}]
                </a>
              </li>
            );
          })}
        </ul>
      </footer>
    </div>
  );
}
