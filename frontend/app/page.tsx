import Link from "next/link";

import Header from "@/components/Header";
import MarketsBrowse from "@/components/MarketsBrowse";
import { Icon, Tag } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="page">
        <section className="panel" style={{ marginBottom: 18 }}>
          <div className="panel__body" style={{ padding: 24 }}>
            <Tag variant="info">
              <Icon name="spark" size={11} /> Live on X Layer mainnet
            </Tag>
            <h1 style={{ margin: "16px 0 10px", maxWidth: 760, fontSize: 40, lineHeight: 1.15, fontWeight: 650 }}>
              Prediction markets that show their work.
            </h1>
            <p style={{ maxWidth: 680, margin: 0, color: "var(--text-secondary)", fontSize: 16, lineHeight: 1.6 }}>
              Pythia turns Uniswap v4 pools into AI-resolved prediction markets. Every resolution is backed by an IPFS
              trail containing the prompt, tool calls, response hashes, and final reasoning.
            </p>
            <div className="row gap-2" style={{ marginTop: 22, flexWrap: "wrap" }}>
              <Link href="/markets" className="btn btn--primary btn--lg">
                Browse markets <Icon name="arrow" size={14} />
              </Link>
              <Link href="/markets/create" className="btn btn--lg">
                <Icon name="plus" size={14} /> Create a market
              </Link>
              <a
                href="https://www.oklink.com/xlayer/address/0xB5370e00d486a39eb3654e41F8b8425b24D94880"
                target="_blank"
                rel="noreferrer"
                className="btn btn--ghost btn--lg"
              >
                <Icon name="shield" size={14} /> Verified hook
              </a>
            </div>
          </div>
        </section>

        <section className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-grid">
            <div className="stat">
              <div className="stat__label">Solidity tests</div>
              <div className="stat__value">96 / 96</div>
              <div className="stat__sub">passing under forge</div>
            </div>
            <div className="stat">
              <div className="stat__label">Off-chain tests</div>
              <div className="stat__value">30 / 30</div>
              <div className="stat__sub">vitest, 7 files</div>
            </div>
            <div className="stat">
              <div className="stat__label">Resolution fee</div>
              <div className="stat__value">0.005 OKB</div>
              <div className="stat__sub">model #0 · DGrid Gemini</div>
            </div>
            <div className="stat">
              <div className="stat__label">Creator bond</div>
              <div className="stat__value">5 USDT</div>
              <div className="stat__sub">burned on INVALID</div>
            </div>
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
