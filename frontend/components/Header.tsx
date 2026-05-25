"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-xl font-mono">
        <span className="text-emerald-400">Pythia</span>
        <span className="text-zinc-500 ml-2 text-sm hidden sm:inline">/ markets that reason</span>
      </Link>
      <nav className="flex items-center gap-3 sm:gap-6 text-sm">
        <Link href="/markets" className="hover:text-emerald-400">
          Markets
        </Link>
        <Link href="/markets/create" className="hover:text-emerald-400 hidden sm:inline">
          Create
        </Link>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </nav>
    </header>
  );
}
