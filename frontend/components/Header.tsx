"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/ui";

export default function Header() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href === "/markets" && pathname.startsWith("/markets/"));

  return (
    <header className="app-header">
      <div className="app-header__left">
        <Link href="/markets" className="app-header__brand">
          <Image src="/pythia-mark.svg" alt="" width={32} height={32} className="brand-mark" priority />
          <span>Pythia</span>
          <span className="app-header__tagline">· Markets that reason</span>
        </Link>
        <nav className="app-header__nav">
          <Link className="nav-link" data-active={active("/markets")} href="/markets">
            <Icon name="grid" size={13} /> Markets
          </Link>
          <Link className="nav-link" data-active={active("/markets/create")} href="/markets/create">
            <Icon name="plus" size={13} /> Create
          </Link>
          <Link className="nav-link" data-active={pathname.startsWith("/proofs")} href="/proofs/demo">
            <Icon name="file" size={13} /> Proofs
          </Link>
          <a className="nav-link" href="https://github.com/bitnormie01/Pythia_market-that-reason-" target="_blank" rel="noreferrer">
            Docs <Icon name="external" size={11} />
          </a>
        </nav>
      </div>
      <div className="app-header__right">
        <div className="chain-chip">
          <span className="chain-chip__dot" />
          X Layer · 196
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>
    </header>
  );
}
