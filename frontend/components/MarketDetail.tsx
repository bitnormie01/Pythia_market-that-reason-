"use client";

import Link from "next/link";
import { useReadContract, useWatchContractEvent } from "wagmi";

import ResolveButton from "@/components/ResolveButton";
import { ShareButton, type Outcome } from "@/components/ShareButton";
import TradePanel from "@/components/TradePanel";
import { PythiaAIProviderAbi } from "@/lib/abi/PythiaAIProvider";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { ADDRESSES, MARKET_STATUS_LABEL } from "@/lib/contracts";
import { formatExpiry, statusLabel, truncateAddress } from "@/lib/format";

type MarketTuple = readonly [
  string, // question
  bigint, // expiry
  number, // modelId
  number, // status
  `0x${string}`, // creator
  boolean, // yesIsCurrency0
  unknown, // poolKey tuple
  `0x${string}`, // yesToken
  `0x${string}`, // noToken
  number // winningChoice
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

  if (marketQuery.isLoading) return <p className="text-zinc-500">Loading market…</p>;
  if (!marketQuery.data) {
    return (
      <p className="text-rose-400 text-sm">
        Market #{marketId.toString()} not found.{" "}
        <Link href="/markets" className="text-emerald-400">
          Back to markets
        </Link>
      </p>
    );
  }

  const tuple = marketQuery.data as unknown as MarketTuple;
  const [question, expiry, modelId, storedStatus, creator, , , yesToken, noToken, winningChoice] = tuple;
  const effectiveStatus = (statusQuery.data as number | undefined) ?? storedStatus;
  const statusNum = Number(effectiveStatus);
  const request = requestQuery.data as unknown as ReasoningRequest | undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <header>
          <div className="flex items-center gap-3 text-xs text-zinc-500 mb-2">
            <span>Market #{marketId.toString()}</span>
            <span className="px-2 py-0.5 bg-zinc-900 rounded">{statusLabel(statusNum)}</span>
            <span>Model #{Number(modelId)}</span>
          </div>
          <h1 className="text-2xl font-mono leading-snug">{question}</h1>
          <p className="text-sm text-zinc-500 mt-2">
            Expires {formatExpiry(expiry)} · Creator {truncateAddress(creator)}
          </p>
        </header>

        {statusNum === 1 && (
          <ResolveButton marketId={marketId} modelId={Number(modelId)} />
        )}

        {statusNum === 2 && (
          <div className="border border-amber-700 rounded p-4 bg-amber-950/30 text-sm">
            <p className="text-amber-300 font-mono">RESOLVING…</p>
            <p className="text-zinc-300 mt-2">
              The AI fulfiller has picked this market up. The reasoning trail and final choice will appear
              on-chain as soon as the fulfiller's tx confirms.
            </p>
          </div>
        )}

        {statusNum === 3 && (
          <div className="border border-emerald-700 rounded p-4 bg-emerald-950/20 text-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-mono">
                <span className="text-emerald-400">RESOLVED →</span>{" "}
                <span className="text-zinc-100">
                  {Number(winningChoice) === 0 ? "YES" : Number(winningChoice) === 1 ? "NO" : "INVALID"}
                </span>
              </p>
              {request?.reasoningCid && (
                <ShareButton
                  question={question}
                  outcome={
                    (Number(winningChoice) === 0 ? "YES" : Number(winningChoice) === 1 ? "NO" : "INVALID") as Outcome
                  }
                  proofUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/proofs/${request.reasoningCid}`}
                />
              )}
            </div>
            {request?.reasoningCid && (
              <Link
                href={`/proofs/${request.reasoningCid}`}
                className="text-emerald-400 hover:underline inline-block"
              >
                View AI reasoning trail →
              </Link>
            )}
          </div>
        )}
      </div>

      <aside>
        <TradePanel
          marketId={marketId}
          yesToken={yesToken}
          noToken={noToken}
          status={statusNum}
          statusLabel={MARKET_STATUS_LABEL[statusNum] ?? "UNKNOWN"}
        />
      </aside>
    </div>
  );
}
