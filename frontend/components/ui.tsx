"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useState } from "react";

import { statusLabel, truncateAddress } from "@/lib/format";

type IconName =
  | "arrow"
  | "arrowLeft"
  | "book"
  | "chain"
  | "check"
  | "clock"
  | "copy"
  | "external"
  | "file"
  | "filter"
  | "grid"
  | "info"
  | "lock"
  | "moon"
  | "plus"
  | "reasoning"
  | "refresh"
  | "search"
  | "shield"
  | "spark"
  | "sun"
  | "wallet"
  | "x";

export function Icon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.5
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
    arrowLeft: <path d="M13 8H3M7 4L3 8l4 4" />,
    book: <path d="M3 3h4a3 3 0 0 1 3 3v8a2 2 0 0 0-2-2H3V3Zm10 0H9a3 3 0 0 0-3 3v8a2 2 0 0 1 2-2h5V3Z" />,
    chain: <path d="m6 8.5-1 1a2.12 2.12 0 0 0 3 3l1.5-1.5M10 7.5l1-1a2.12 2.12 0 0 0-3-3L6.5 5M6 10l4-4" />,
    check: <path d="m3 8 3 3 7-7" />,
    clock: <><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></>,
    copy: <><rect x="5" y="5" width="8" height="8" rx="1" /><path d="M3 11V4a1 1 0 0 1 1-1h7" /></>,
    external: <><path d="M6 3h7v7" /><path d="m13 3-6 6" /><path d="M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" /></>,
    file: <><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></>,
    filter: <path d="M3 4h10M5 8h6M7 12h2" />,
    grid: <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />,
    info: <><circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 5h.01" /></>,
    lock: <><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></>,
    moon: <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5 5.5 5.5 0 1 0 13.5 9.5Z" />,
    plus: <path d="M8 3v10M3 8h10" />,
    reasoning: <><path d="M8 1.5a4 4 0 0 1 2.5 7.1c-.4.3-.6.8-.6 1.3v.6H6.1v-.6c0-.5-.2-1-.6-1.3A4 4 0 0 1 8 1.5Z" /><path d="M6.3 13h3.4M6.8 14.5h2.4" /></>,
    refresh: <><path d="M13 8a5 5 0 0 1-9 3.5L3 13" /><path d="M3 8a5 5 0 0 1 9-3.5L13 3" /><path d="M13 3v3h-3M3 13v-3h3" /></>,
    search: <><circle cx="7" cy="7" r="4" /><path d="m10 10 3 3" /></>,
    shield: <path d="M8 2 3 4v4c0 3 2.5 5 5 6 2.5-1 5-3 5-6V4L8 2Z" />,
    spark: <path d="m2 12 3-7 3 5 2-3 4 5" />,
    sun: <><circle cx="8" cy="8" r="3" /><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1" /></>,
    wallet: <><rect x="2.5" y="4" width="11" height="9" rx="1" /><path d="M2.5 6.5h11M10.5 9H12" /></>,
    x: <path d="m4 4 8 8M12 4l-8 8" />
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Pythia">
      <path d="M3 20 12 4l9 16H3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m12 12-5 8m5-8 5 8m-5-16v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.55" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Icon name="refresh" size={size} className="spin" />;
}

export function Tag({
  children,
  variant = "neutral",
  dot = false,
  pulse = false
}: {
  children: ReactNode;
  variant?: "neutral" | "yes" | "no" | "warn" | "info";
  dot?: boolean;
  pulse?: boolean;
}) {
  return <span className={`tag tag--${variant}${dot ? " tag--dot" : ""}${pulse ? " tag--pulse" : ""}`}>{children}</span>;
}

export function StatusTag({ status, winningChoice }: { status: number; winningChoice?: number }) {
  if (status === 3) {
    if (winningChoice === 0) return <Tag variant="yes">RESOLVED · YES</Tag>;
    if (winningChoice === 1) return <Tag variant="no">RESOLVED · NO</Tag>;
    if (winningChoice === 2) return <Tag variant="warn">RESOLVED · INVALID</Tag>;
    return <Tag>RESOLVED</Tag>;
  }
  if (status === 0) return <Tag variant="info" dot>{statusLabel(status)}</Tag>;
  if (status === 1) return <Tag variant="warn" dot>{statusLabel(status)}</Tag>;
  if (status === 2) return <Tag variant="warn" dot pulse>{statusLabel(status)}</Tag>;
  return <Tag>{statusLabel(status)}</Tag>;
}

export function CopyChip({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function onCopy(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }
  return (
    <button type="button" onClick={onCopy} className="copy-chip" title={value}>
      <span>{label ?? truncateAddress(value)}</span>
      <Icon name={copied ? "check" : "copy"} size={12} />
    </button>
  );
}

export function EmptyState({
  icon = "info",
  title,
  hint,
  action
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><Icon name={icon} size={22} /></div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

export function ProbBar({ yes = null }: { yes?: number | null }) {
  if (yes === null) {
    return <div className="probbar probbar--empty" />;
  }
  const pct = Math.max(0, Math.min(100, yes * 100));
  return (
    <div className="probbar" style={{ "--yes-pct": `${pct}%` } as CSSProperties}>
      <div className="probbar__yes" />
    </div>
  );
}

export function ProbSplit({ yes = null }: { yes?: number | null }) {
  if (yes === null) return <span className="muted font-mono">— / —</span>;
  const yesPct = Math.round(Math.max(0, Math.min(1, yes)) * 100);
  return (
    <span className="prob-split">
      <span className="prob-split__yes">{yesPct}%</span>
      <span className="prob-split__sep">/</span>
      <span className="prob-split__no">{100 - yesPct}%</span>
    </span>
  );
}
