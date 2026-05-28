"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { MarketCard } from "@/components/MarketCard";
import { EmptyState, Icon, ProbSplit, StatusTag } from "@/components/ui";
import { useMarketIds, useMarketSummaries, type MarketSummary } from "@/hooks/useMarkets";
import { ADDRESSES } from "@/lib/contracts";
import { formatExpiryParts, truncateAddress } from "@/lib/format";

type Filter = "all" | "trading" | "expired" | "resolving" | "resolved";
type Sort = "new" | "expiry" | "status";
type View = "table" | "cards";

const FILTER_STATUS: Record<Exclude<Filter, "all">, number> = {
  trading: 0,
  expired: 1,
  resolving: 2,
  resolved: 3
};

export default function MarketsBrowse({ limit = 50, compact = false }: { limit?: number; compact?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [view, setView] = useState<View>(compact ? "cards" : "table");

  const idsQuery = useMarketIds(0, limit);
  const idArray = (idsQuery.data ?? []) as readonly bigint[];
  const { summaries, isLoading: summariesLoading } = useMarketSummaries(idArray);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = summaries.slice();
    if (filter !== "all") {
      rows = rows.filter((m) => m.effectiveStatus === FILTER_STATUS[filter]);
    }
    if (q) {
      rows = rows.filter((m) => m.question.toLowerCase().includes(q) || m.id.toString().includes(q));
    }
    rows.sort((a, b) => {
      if (sort === "expiry") return Number(a.expiry - b.expiry);
      if (sort === "status") return a.effectiveStatus - b.effectiveStatus || Number(b.id - a.id);
      return Number(b.id - a.id);
    });
    return rows;
  }, [filter, search, sort, summaries]);

  const totals = useMemo(
    () => ({
      open: summaries.filter((m) => m.effectiveStatus === 0 || m.effectiveStatus === 1).length,
      resolving: summaries.filter((m) => m.effectiveStatus === 2).length,
      resolved: summaries.filter((m) => m.effectiveStatus === 3).length,
      total: summaries.length
    }),
    [summaries]
  );

  if (ADDRESSES.hook === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="banner banner--warn">
        <Icon name="info" size={14} />
        Hook address not configured. Set NEXT_PUBLIC_HOOK_ADDRESS to load markets.
      </div>
    );
  }

  if (idsQuery.isLoading || summariesLoading) {
    return (
      <div className="panel">
        <EmptyState icon="refresh" title="Loading markets" hint="Reading market ids and status from the deployed hook." />
      </div>
    );
  }

  if (idsQuery.error) {
    return (
      <div className="banner banner--warn">
        <Icon name="x" size={14} />
        RPC error loading markets: {(idsQuery.error as Error).message}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="panel">
        <EmptyState
          icon="grid"
          title="No markets yet"
          hint="The production contracts are live but no creator has seeded a market yet."
          action={<Link href="/markets/create" className="btn btn--primary">Create the first market <Icon name="arrow" size={13} /></Link>}
        />
      </div>
    );
  }

  return (
    <div className="col gap-4">
      {!compact && (
        <>
          <div className="panel">
            <div className="panel-grid">
              <div className="stat">
                <div className="stat__label">Open markets</div>
                <div className="stat__value">{totals.open}</div>
                <div className="stat__sub">{totals.total} total on-chain</div>
              </div>
              <div className="stat">
                <div className="stat__label">Resolving</div>
                <div className="stat__value">{totals.resolving}</div>
                <div className="stat__sub">awaiting AI callback</div>
              </div>
              <div className="stat">
                <div className="stat__label">Resolved</div>
                <div className="stat__value">{totals.resolved}</div>
                <div className="stat__sub">proof CID available</div>
              </div>
              <div className="stat">
                <div className="stat__label">Volume / liquidity</div>
                <div className="stat__value">—</div>
                <div className="stat__sub">indexer not connected</div>
              </div>
            </div>
          </div>

          <div className="row between gap-3" style={{ flexWrap: "wrap" }}>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              <div className="segmented">
                {(["all", "trading", "expired", "resolving", "resolved"] as Filter[]).map((f) => (
                  <button key={f} className="segmented__btn" data-active={filter === f} onClick={() => setFilter(f)}>
                    {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ position: "relative", width: 280, maxWidth: "100%" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}>
                  <Icon name="search" size={14} />
                </span>
                <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search question or ID..." style={{ paddingLeft: 32 }} />
              </div>
            </div>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: 160 }}>
                <option value="new">Sort · newest</option>
                <option value="expiry">Sort · expiry</option>
                <option value="status">Sort · status</option>
              </select>
              <div className="segmented">
                <button className="segmented__btn" data-active={view === "table"} onClick={() => setView("table")}>
                  <Icon name="filter" size={12} /> Table
                </button>
                <button className="segmented__btn" data-active={view === "cards"} onClick={() => setView("cards")}>
                  <Icon name="grid" size={12} /> Cards
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {visible.length === 0 ? (
        <div className="panel">
          <EmptyState icon="search" title="No markets match" hint="Try a different search term or status filter." />
        </div>
      ) : view === "table" && !compact ? (
        <MarketsTable rows={visible} />
      ) : (
        <div className="market-grid">
          {visible.map((m) => (
            <MarketCard
              key={m.id.toString()}
              data={{
                id: m.id,
                question: m.question,
                expiry: m.expiry,
                status: m.effectiveStatus,
                creator: m.creator,
                modelId: m.modelId,
                winningChoice: m.winningChoice
              }}
            />
          ))}
        </div>
      )}

      {!compact && (
        <div className="banner">
          <Icon name="shield" size={14} />
          Market list uses verified PythiaHook reads. Volume, liquidity, and implied probability are intentionally hidden until an indexer is connected.
        </div>
      )}
    </div>
  );
}

function MarketsTable({ rows }: { rows: MarketSummary[] }) {
  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 64 }}>#</th>
            <th>Question</th>
            <th style={{ width: 150 }}>Status</th>
            <th style={{ width: 130, textAlign: "right" }}>YES / NO</th>
            <th style={{ width: 150, textAlign: "right" }}>Creator</th>
            <th style={{ width: 150, textAlign: "right" }}>Expires</th>
            <th style={{ width: 36 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const expiry = formatExpiryParts(m.expiry);
            return (
              <tr key={m.id.toString()} onClick={() => { window.location.href = `/markets/${m.id.toString()}`; }}>
                <td><span className="font-mono muted">{m.id.toString().padStart(3, "0")}</span></td>
                <td>
                  <div className="col gap-1" style={{ maxWidth: 520 }}>
                    <span className="line-clamp-2">{m.question}</span>
                    <ProbSplit />
                  </div>
                </td>
                <td><StatusTag status={m.effectiveStatus} winningChoice={m.winningChoice} /></td>
                <td style={{ textAlign: "right" }}><span className="muted font-mono">not indexed</span></td>
                <td style={{ textAlign: "right" }}><span className="font-mono muted">{truncateAddress(m.creator)}</span></td>
                <td style={{ textAlign: "right" }}>
                  <div className="col" style={{ alignItems: "flex-end", gap: 1 }}>
                    <span>{expiry.date}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{expiry.rel}</span>
                  </div>
                </td>
                <td><Icon name="arrow" size={14} className="muted" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
