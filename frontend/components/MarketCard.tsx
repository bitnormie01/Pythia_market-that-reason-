"use client";

import Link from "next/link";

import { ProbBar, ProbSplit, StatusTag } from "@/components/ui";
import { formatExpiryParts, truncateAddress } from "@/lib/format";

export type MarketCardData = {
  id: bigint;
  question: string;
  expiry: bigint;
  status: number;
  creator?: `0x${string}`;
  modelId?: number;
  winningChoice?: number;
};

export function MarketCard({ data, yes = null }: { data: MarketCardData; yes?: number | null }) {
  const expiry = formatExpiryParts(data.expiry);
  return (
    <Link href={`/markets/${data.id.toString()}`} className="market-card col between">
      <div>
        <div className="row between gap-2" style={{ marginBottom: 12 }}>
          <span className="font-mono muted" style={{ fontSize: 12 }}>
            #{data.id.toString().padStart(3, "0")}
          </span>
          <StatusTag status={data.status} winningChoice={data.winningChoice} />
        </div>
        <p className="market-question line-clamp-3" style={{ minHeight: 62, margin: 0 }}>
          {data.question}
        </p>
      </div>

      <div className="col gap-2" style={{ marginTop: 18 }}>
        <ProbBar yes={yes} />
        <div className="row between gap-2" style={{ fontSize: 12 }}>
          <span className="muted">{yes === null ? "Awaiting liquidity" : "Implied YES / NO"}</span>
          <ProbSplit yes={yes} />
        </div>
        <div className="row between gap-2" style={{ paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: 12 }}>
          <div className="col">
            <span className="muted">Expires</span>
            <span>{expiry.date}</span>
          </div>
          <div className="col" style={{ alignItems: "flex-end" }}>
            <span className="muted">{expiry.rel}</span>
            <span className="font-mono muted">{data.creator ? truncateAddress(data.creator) : `Model #${data.modelId ?? 0}`}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
