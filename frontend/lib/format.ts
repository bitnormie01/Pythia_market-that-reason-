import { MARKET_STATUS_LABEL } from "./contracts";

export function statusLabel(status: number): string {
  return MARKET_STATUS_LABEL[status] ?? `UNKNOWN(${status})`;
}

export function formatExpiry(expirySec: bigint | number): string {
  const ms = Number(expirySec) * 1000;
  if (!Number.isFinite(ms) || ms === 0) return "—";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatExpiryParts(expirySec: bigint | number): { date: string; rel: string } {
  const ms = Number(expirySec) * 1000;
  if (!Number.isFinite(ms) || ms === 0) return { date: "—", rel: "—" };
  const diffMs = ms - Date.now();
  const absMs = Math.abs(diffMs);
  const dayMs = 86_400_000;
  const hourMs = 3_600_000;
  let rel: string;
  if (absMs < hourMs) {
    const minutes = Math.max(1, Math.round(absMs / 60_000));
    rel = diffMs >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
  } else if (absMs < dayMs) {
    const hours = Math.round(absMs / hourMs);
    rel = diffMs >= 0 ? `in ${hours}h` : `${hours}h ago`;
  } else {
    const days = Math.round(absMs / dayMs);
    rel = diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
  }
  return {
    date: new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    rel
  };
}

export function formatUsdtAmount(amount: bigint | undefined, decimals = 6): string {
  if (amount === undefined) return "—";
  const whole = Number(amount) / 10 ** decimals;
  if (!Number.isFinite(whole)) return "—";
  return whole.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length < head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
