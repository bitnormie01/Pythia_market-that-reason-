const FALLBACK_ZERO = "0x0000000000000000000000000000000000000000" as const;

function envAddr(name: string, fallback: `0x${string}` = FALLBACK_ZERO): `0x${string}` {
  const v = (process.env[name] ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(v) ? (v as `0x${string}`) : fallback;
}

export const ADDRESSES = {
  hook: envAddr("NEXT_PUBLIC_HOOK_ADDRESS"),
  provider: envAddr("NEXT_PUBLIC_PROVIDER_ADDRESS"),
  periphery: envAddr("NEXT_PUBLIC_PERIPHERY_ADDRESS"),
  usdt: envAddr("NEXT_PUBLIC_USDT_ADDRESS", "0x779ded0c9e1022225f8e0630b35a9b54be713736"),
  outcomeMaster: envAddr("NEXT_PUBLIC_OUTCOME_MASTER_ADDRESS"),
  poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32" as `0x${string}`,
  quoter: "0x8928074ca1b241d8ec02815881c1af11e8bc5219" as `0x${string}`,
  universalRouter: "0x8b844f885672f333bc0042cb669255f93a4c1e6b" as `0x${string}`,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as `0x${string}`,
  wokb: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" as `0x${string}`,
  usdtWokbV3Pool: "0x63d62734847e55a266fca4219a9ad0a02d5f6e02" as `0x${string}`
} as const;

export const USDT_DECIMALS = 6;
export const OKB_DECIMALS = 18;

export const MARKET_STATUS_LABEL = ["TRADING", "EXPIRED", "RESOLVING", "RESOLVED"] as const;
export type MarketStatus = (typeof MARKET_STATUS_LABEL)[number];
