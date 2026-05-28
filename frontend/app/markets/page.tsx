import Link from "next/link";

import Header from "@/components/Header";
import MarketsBrowse from "@/components/MarketsBrowse";
import { Icon } from "@/components/ui";

export default function MarketsPage() {
  return (
    <>
      <Header />
      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Markets</h1>
            <p className="page-subtitle">AI-resolved prediction markets on X Layer · Uniswap v4</p>
          </div>
          <Link href="/markets/create" className="btn btn--primary">
            <Icon name="plus" size={14} /> Create market
          </Link>
        </div>
        <MarketsBrowse limit={50} />
      </main>
    </>
  );
}
