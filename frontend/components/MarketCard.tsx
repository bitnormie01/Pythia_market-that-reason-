"use client";

import Link from "next/link";

import { Icon, ProbBar, StatusTag } from "@/components/ui";
import { formatExpiryParts, truncateAddress } from "@/lib/format";

export type MarketCardData = {
  id: bigint;
  question: string;
  expiry: bigint;
  status: number;
  creator?: `0x${string}`;
  modelId?: number;
  winningChoice?: number;
  /** Present only for resolved markets whose proof CID has been fetched. */
  reasoningCid?: string;
};

const OUTCOME_LABEL: Record<number, string> = { 0: "YES", 1: "NO", 2: "INVALID" };
const OUTCOME_VARIANT: Record<number, "yes" | "no" | "warn"> = { 0: "yes", 1: "no", 2: "warn" };

export function MarketCard({ data, yes = null }: { data: MarketCardData; yes?: number | null }) {
  const expiry = formatExpiryParts(data.expiry);
  const id = data.id.toString();
  const yesPct = yes === null ? null : Math.round(Math.max(0, Math.min(1, yes)) * 100);
  const isResolved = data.status === 3;
  const winning = data.winningChoice;

  return (
    <div className="market-card" style={{ position: "relative" }}>
      {/* Full-card overlay link → detail. Sits below interactive children (z-index). */}
      <Link
        href={`/markets/${id}`}
        aria-label={`Open market: ${data.question}`}
        style={{ position: "absolute", inset: 0, zIndex: 0, borderRadius: "inherit" }}
      />

      <div className="market-card__meta" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        <StatusTag status={data.status} winningChoice={winning} />
        <span className="ai-chip">
          <Icon name="reasoning" size={12} />
          AI-resolved
          <span className="ai-chip__model">#{data.modelId ?? 0}</span>
        </span>
      </div>

      <h3 className="market-question line-clamp-2" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        {data.question}
      </h3>

      <div className="market-card__hero" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        <div className="prob-hero">
          {yesPct === null ? (
            <span className="prob-hero__empty">Awaiting liquidity</span>
          ) : (
            <>
              <span className="prob-hero__main">
                <span className="prob-hero__label">YES</span>
                <span className="prob-hero__value">{yesPct}%</span>
              </span>
              <span className="prob-hero__no">
                NO <b>{100 - yesPct}%</b>
              </span>
            </>
          )}
        </div>
        <ProbBar yes={yes} />
      </div>

      {/* State-aware AI hook */}
      {isResolved ? (
        <div className="ai-hook ai-hook--resolved" style={{ position: "relative", zIndex: 1 }}>
          <span style={{ pointerEvents: "none" }}>
            {winning !== undefined && OUTCOME_LABEL[winning] !== undefined ? (
              <span className={`tag tag--${OUTCOME_VARIANT[winning]}`}>{OUTCOME_LABEL[winning]} won</span>
            ) : (
              <span className="tag tag--neutral">Resolved</span>
            )}
          </span>
          {data.reasoningCid ? (
            <Link href={`/proofs/${data.reasoningCid}`} className="proof-link">
              View proof <Icon name="arrow" size={12} />
            </Link>
          ) : (
            <Link href={`/markets/${id}`} className="proof-link">
              View proof <Icon name="arrow" size={12} />
            </Link>
          )}
        </div>
      ) : (
        <div className="ai-hook" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
          <Icon name="spark" size={13} />
          Resolves with an auditable AI proof
        </div>
      )}

      <div className="market-card__footer" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        <span className="col gap-1">
          <span className="muted">Expires</span>
          <span style={{ color: "var(--text-secondary)" }}>
            {expiry.date} · {expiry.rel}
          </span>
        </span>
        <span className="font-mono muted" style={{ textAlign: "right" }}>
          {data.creator ? truncateAddress(data.creator) : `Model #${data.modelId ?? 0}`}
        </span>
      </div>
    </div>
  );
}
