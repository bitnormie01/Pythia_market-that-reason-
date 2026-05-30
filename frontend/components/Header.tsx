"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // next-themes can only know the resolved theme on the client; render a stable
  // placeholder until mounted so SSR and first client paint match.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Toggle theme"}
      aria-pressed={mounted ? isDark : undefined}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? <Icon name={isDark ? "sun" : "moon"} size={16} /> : <Icon name="moon" size={16} />}
    </button>
  );
}

export default function Header() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href === "/markets" && pathname.startsWith("/markets/"));

  return (
    <header className="app-header">
      <div className="app-header__left">
        <Link href="/markets" className="app-header__brand">
          <Image src="/pythia-mark.svg" alt="" width={30} height={30} className="brand-mark" priority />
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
            <Icon name="reasoning" size={13} /> Proofs
          </Link>
          <a className="nav-link" href="https://github.com/bitnormie01/Pythia_market-that-reason-" target="_blank" rel="noreferrer">
            Docs <Icon name="external" size={11} />
          </a>
        </nav>
      </div>
      <div className="app-header__right">
        <ThemeToggle />
        <div className="chain-chip">
          <span className="chain-chip__dot" />
          X Layer · 196
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>
    </header>
  );
}
