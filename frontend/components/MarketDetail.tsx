"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useReadContract, useWatchContractEvent } from "wagmi";

import ResolveButton from "@/components/ResolveButton";
import { ShareButton, type Outcome } from "@/components/ShareButton";
import TradePanel from "@/components/TradePanel";
import { CopyChip, Icon, ProbBar, StatusTag, Tag } from "@/components/ui";
import { useMarketProbabilities } from "@/hooks/useMarkets";
import { PythiaAIProviderAbi } from "@/lib/abi/PythiaAIProvider";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { ADDRESSES } from "@/lib/contracts";
import { formatExpiry, formatExpiryParts, truncateAddress } from "@/lib/format";

type MarketTuple = readonly [
  string,
  bigint,
  number,
  number,
  `0x${string}`,
  boolean,
  unknown,
  `0x${string}`,
  `0x${string}`,
  number
];

type ReasoningRequest = {
  requestId: bigint;
  consumer: `0x${string}`;
  modelId: number;
  numOfChoices: number;
  timestamp: bigint;
  feePaid: bigint;
  status: number;
  choice: number;
  reasoningCid: string;
};

const CHOICE_LABELS: Record<number, Outcome> = { 0: "YES", 1: "NO", 2: "INVALID" };

export default function MarketDetail({ marketId }: { marketId: bigint }) {
  const marketQuery = useReadContract({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    functionName: "markets",
    args: [marketId]
  });

  const statusQuery = useReadContract({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    functionName: "effectiveStatus",
    args: [marketId]
  });

  const requestIdQuery = useReadContract({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    functionName: "marketLastRequestId",
    args: [marketId]
  });

  const requestId = (requestIdQuery.data as bigint | undefined) ?? 0n;
  const requestQuery = useReadContract({
    address: ADDRESSES.provider,
    abi: PythiaAIProviderAbi,
    functionName: "getRequest",
    args: [requestId],
    query: { enabled: requestId > 0n }
  });

  const marketTuple = marketQuery.data as unknown as MarketTuple | undefined;
  const yesTokenTop = marketTuple?.[7];
  const noTokenTop = marketTuple?.[8];
  const probMarkets = useMemo(
    () => (yesTokenTop && noTokenTop ? [{ id: marketId, yesToken: yesTokenTop, noToken: noTokenTop }] : []),
    [marketId, yesTokenTop, noTokenTop]
  );
  const { probabilities } = useMarketProbabilities(probMarkets);
  const yesProb = probabilities.get(marketId.toString()) ?? null;

  useWatchContractEvent({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    eventName: "Resolved",
    onLogs: (logs) => {
      for (const log of logs) {
        const args = (log as unknown as { args: { marketId?: bigint } }).args;
        if (args?.marketId === marketId) {
          void marketQuery.refetch();
          void statusQuery.refetch();
          void requestQuery.refetch();
        }
      }
    }
  });

  useWatchContractEvent({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    eventName: "ResolutionRequested",
    onLogs: (logs) => {
      for (const log of logs) {
        const args = (log as unknown as { args: { marketId?: bigint } }).args;
        if (args?.marketId === marketId) {
          void statusQuery.refetch();
          void requestQuery.refetch();
        }
      }
    }
  });

  if (marketQuery.isLoading) {
    return <div className="panel"><div className="panel__body muted">Loading market...</div></div>;
  }
  if (!marketQuery.data) {
    return (
      <div className="banner banner--warn">
        <Icon name="x" size={14} />
        Market #{marketId.toString()} not found. <Link href="/markets" style={{ color: "var(--accent)" }}>Back to markets</Link>
      </div>
    );
  }

  const tuple = marketQuery.data as unknown as MarketTuple;
  const [question, expiry, modelId, storedStatus, creator, yesIsCurrency0, , yesToken, noToken, winningChoice] = tuple;
  const effectiveStatus = (statusQuery.data as number | undefined) ?? storedStatus;
  const statusNum = Number(effectiveStatus);
  const request = requestQuery.data as unknown as ReasoningRequest | undefined;
  const expiryParts = formatExpiryParts(expiry);
  const outcome = CHOICE_LABELS[Number(winningChoice)] ?? "INVALID";

  return (
    <div className="detail-grid">
      <div className="col gap-4">
        <div className="row gap-2" style={{ fontSize: 12 }}>
          <Link href="/markets" className="btn btn--ghost btn--sm">
            <Icon name="arrowLeft" size={12} /> Markets
          </Link>
          <span className="muted">/</span>
          <span className="muted">Market #{marketId.toString()}</span>
        </div>

        <section className="panel">
          <div className="panel__body" style={{ padding: 20 }}>
            <div className="row between gap-3" style={{ marginBottom: 12, alignItems: "flex-start" }}>
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                <StatusTag status={statusNum} winningChoice={Number(winningChoice)} />
                <Tag variant="neutral">Model #{Number(modelId)}</Tag>
                <Tag variant="info">X Layer</Tag>
              </div>
              {statusNum === 3 && request?.reasoningCid && (
                <ShareButton
                  question={question}
                  outcome={outcome}
                  proofUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/proofs/${request.reasoningCid}`}
                />
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.25, letterSpacing: "-0.01em" }}>{question}</h1>
            <div className="row gap-3" style={{ flexWrap: "wrap", marginTop: 14, color: "var(--text-secondary)", fontSize: 13 }}>
              <span><Icon name="clock" size={13} /> Expires {formatExpiry(expiry)} ({expiryParts.rel})</span>
              <span>Creator <CopyChip value={creator} label={truncateAddress(creator)} /></span>
            </div>
          </div>
        </section>

        {yesProb !== null && (
          <section className="panel">
            <div className="panel__head">
              <span className="panel__title">Implied probability</span>
              <Tag variant="neutral">live pool read</Tag>
            </div>
            <div className="panel__body col gap-3">
              <div className="prob-hero">
                <span className="prob-hero__main">
                  <span className="prob-hero__label">YES</span>
                  <span className="prob-hero__value" style={{ fontSize: 40 }}>{Math.round(yesProb * 100)}%</span>
                </span>
                <span className="prob-hero__no" style={{ fontSize: 15 }}>
                  NO <b>{100 - Math.round(yesProb * 100)}%</b>
                </span>
              </div>
              <ProbBar yes={yesProb} />
              <p className="field__hint" style={{ margin: 0 }}>
                1 YES ≈ {yesProb.toFixed(2)} USDT, 1 NO ≈ {(1 - yesProb).toFixed(2)} USDT right now — each share pays out 1 USDT if it wins. Read live from the v4 pool reserves, updates within seconds of every trade.
              </p>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Market state</span>
            <Tag variant="neutral">verified hook read</Tag>
          </div>
          <div className="three-col">
            <div className="stat">
              <div className="stat__label">YES token</div>
              <div className="stat__value" style={{ fontSize: 13 }}><CopyChip value={yesToken} label={truncateAddress(yesToken)} /></div>
              <div className="stat__sub">{yesIsCurrency0 ? "currency0" : "currency1"}</div>
            </div>
            <div className="stat">
              <div className="stat__label">NO token</div>
              <div className="stat__value" style={{ fontSize: 13 }}><CopyChip value={noToken} label={truncateAddress(noToken)} /></div>
              <div className="stat__sub">{yesIsCurrency0 ? "currency1" : "currency0"}</div>
            </div>
            <div className="stat">
              <div className="stat__label">Request id</div>
              <div className="stat__value">{requestId > 0n ? requestId.toString() : "—"}</div>
              <div className="stat__sub">latest resolution request</div>
            </div>
          </div>
        </section>

        {statusNum === 1 && <ResolveButton marketId={marketId} modelId={Number(modelId)} />}

        {statusNum === 2 && (
          <div className="banner banner--warn">
            <Icon name="refresh" size={14} />
            The AI fulfiller has picked this market up. The reasoning CID and final choice will appear after fulfillment.
          </div>
        )}

        {statusNum === 3 && (
          <section className="panel" style={{ borderColor: "var(--accent-border)" }}>
            <div className="panel__head">
              <span className="panel__title">AI resolution</span>
              <StatusTag status={statusNum} winningChoice={Number(winningChoice)} />
            </div>
            <div className="panel__body col gap-3">
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <span className="empty-state__icon" style={{ width: 40, height: 40, borderColor: "var(--accent-border)" }}>
                  <Icon name="reasoning" size={20} />
                </span>
                <div className="col">
                  <span className="muted" style={{ fontSize: 12 }}>Final outcome</span>
                  <span className="font-mono" style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 600 }}>{outcome}</span>
                </div>
              </div>
              <p className="field__hint" style={{ margin: 0 }}>
                This market was resolved by AI. The full prompt, tool calls, response hashes, and final reasoning are
                published to IPFS so anyone can audit how the outcome was reached.
              </p>
              {request?.reasoningCid ? (
                <Link href={`/proofs/${request.reasoningCid}`} className="btn btn--primary btn--lg" style={{ width: "fit-content" }}>
                  <Icon name="reasoning" size={15} /> View AI reasoning trail <Icon name="arrow" size={14} />
                </Link>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Resolution CID is not available yet.</p>
              )}
            </div>
          </section>
        )}
      </div>

      <aside>
        <TradePanel marketId={marketId} yesToken={yesToken} noToken={noToken} status={statusNum} yesProb={yesProb} />
      </aside>
    </div>
  );
}
