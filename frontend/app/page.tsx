import Link from "next/link";

import Header from "@/components/Header";
import MarketsBrowse from "@/components/MarketsBrowse";
import { Icon, Tag } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="page">
        <section className="hero">
          <Tag variant="info">
            <Icon name="spark" size={11} /> Live on X Layer mainnet
          </Tag>
          <h1 className="hero__title">
            Prediction markets that <span className="accent">show their work.</span>
          </h1>
          <p className="hero__sub">
            Pythia turns Uniswap v4 pools into AI-resolved prediction markets. Every resolution is backed by an IPFS
            trail containing the prompt, tool calls, response hashes, and final reasoning.
          </p>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <Link href="/markets" className="btn btn--primary btn--lg">
              Browse markets <Icon name="arrow" size={14} />
            </Link>
            <Link href="/markets/create" className="btn btn--ghost btn--lg">
              <Icon name="plus" size={14} /> Create a market
            </Link>
          </div>
        </section>

        <section>
          <div className="page-head">
            <div>
              <h2 className="page-title">Recent markets</h2>
              <p className="page-subtitle">Real markets loaded from the deployed PythiaHook.</p>
            </div>
            <Link href="/markets" className="btn">
              View all <Icon name="arrow" size={13} />
            </Link>
          </div>
          <MarketsBrowse limit={6} compact />
        </section>
      </main>
    </>
  );
}
