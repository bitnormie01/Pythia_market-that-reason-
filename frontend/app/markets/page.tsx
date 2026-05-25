import Link from "next/link";

import Header from "@/components/Header";
import MarketsBrowse from "@/components/MarketsBrowse";

export default function MarketsPage() {
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-mono">Markets</h1>
          <Link
            href="/markets/create"
            className="text-sm bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded font-semibold"
          >
            New market
          </Link>
        </div>
        <MarketsBrowse limit={50} />
      </main>
    </>
  );
}
