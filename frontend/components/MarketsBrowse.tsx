"use client";

import Link from "next/link";

import { MarketCard } from "@/components/MarketCard";
import { useMarketIds, useMarketSummaries } from "@/hooks/useMarkets";
import { ADDRESSES } from "@/lib/contracts";

export default function MarketsBrowse({ limit = 50 }: { limit?: number }) {
  const idsQuery = useMarketIds(0, limit);
  const idArray = (idsQuery.data ?? []) as readonly bigint[];
  const { summaries, isLoading: summariesLoading } = useMarketSummaries(idArray);

  if (ADDRESSES.hook === "0x0000000000000000000000000000000000000000") {
    return (
      <p className="text-amber-400 text-sm">
        Hook address not configured. Set <code className="text-amber-300">NEXT_PUBLIC_HOOK_ADDRESS</code> in
        <code className="text-amber-300"> .env.local</code> to load markets.
      </p>
    );
  }

  if (idsQuery.isLoading || summariesLoading) {
    return <p className="text-zinc-500">Loading markets…</p>;
  }

  if (idsQuery.error) {
    return <p className="text-rose-400 text-sm">RPC error loading markets: {(idsQuery.error as Error).message}</p>;
  }

  if (summaries.length === 0) {
    return (
      <p className="text-zinc-500">
        No markets yet.{" "}
        <Link href="/markets/create" className="text-emerald-400">
          Create one →
        </Link>
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {summaries.map((m) => (
        <MarketCard
          key={m.id.toString()}
          data={{ id: m.id, question: m.question, expiry: m.expiry, status: m.effectiveStatus }}
        />
      ))}
    </div>
  );
}
