import { MARKET_STATUS_LABEL } from "./contracts";

export function statusLabel(status: number): string {
  return MARKET_STATUS_LABEL[status] ?? `UNKNOWN(${status})`;
}

export function formatExpiry(expirySec: bigint | number): string {
  const ms = Number(expirySec) * 1000;
  if (!Number.isFinite(ms) || ms === 0) return "—";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function truncateAddress(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length < head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
