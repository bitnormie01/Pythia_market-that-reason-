"use client";

import Link from "next/link";

import { formatExpiry, statusLabel } from "@/lib/format";

export type MarketCardData = {
  id: bigint;
  question: string;
  expiry: bigint;
  status: number;
};

export function MarketCard({ data }: { data: MarketCardData }) {
  return (
    <Link
      href={`/markets/${data.id.toString()}`}
      className="block border border-zinc-800 rounded p-4 hover:border-emerald-500 transition"
    >
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
        <span>#{data.id.toString()}</span>
        <span className="px-2 py-0.5 bg-zinc-900 rounded">{statusLabel(data.status)}</span>
      </div>
      <p className="text-base mb-3 line-clamp-3 min-h-[3.5rem]">{data.question}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-emerald-400 font-mono text-xs">Expires</span>
        <span className="text-zinc-500 text-xs">{formatExpiry(data.expiry)}</span>
      </div>
    </Link>
  );
}
