import Link from "next/link";

import Header from "@/components/Header";
import MarketsBrowse from "@/components/MarketsBrowse";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="mb-16 text-center">
          <h1 className="text-5xl font-mono font-bold mb-4">
            <span className="text-emerald-400">Markets</span> that reason.
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
            AI-resolved prediction markets on X Layer. Every resolution has an auditable IPFS reasoning trail.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/markets"
              className="inline-block bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-3 rounded font-semibold"
            >
              Browse markets →
            </Link>
            <Link
              href="/markets/create"
              className="inline-block border border-zinc-700 hover:border-emerald-500 px-6 py-3 rounded font-semibold"
            >
              Create a market
            </Link>
          </div>
        </section>
        <section>
          <h2 className="text-2xl font-mono mb-6 text-zinc-300">Recent</h2>
          <MarketsBrowse limit={6} />
        </section>
      </main>
    </>
  );
}
