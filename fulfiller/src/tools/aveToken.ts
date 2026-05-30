import { createHash } from "node:crypto";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import type { Config } from "../config";

export const aveTokenToolDef = {
  name: "ave_token_tool",
  description:
    "Fetch live market data (price, volume, market cap, holder counts) for a token on a given chain. Use sparingly; one call per token.",
  input_schema: {
    type: "object",
    properties: {
      chain: { type: "string", description: "Chain identifier (e.g., 'xlayer', 'bsc', 'eth')." },
      address: { type: "string", description: "Token contract address (0x...)." }
    },
    required: ["chain", "address"]
  }
} as const;

export type AveTokenInput = { chain: string; address: string };
export type AveTokenResult = { result: unknown; rawResponseSha256: string };

// On-chain price oracle for X Layer tokens whose USD price can be read directly
// from a canonical Uniswap V3 pool. This is stronger provenance than a 3rd-party
// API: the price comes from the same chain the market settles on.
type OnchainPriceSource = {
  symbol: string;
  pool: `0x${string}`;
  // price = 1e(quoteDec-baseDec) * (2^192 / sqrtPriceX96^2) when base is token1/quote is token0
  baseIsToken1: boolean;
  baseDecimals: number;
  quoteDecimals: number;
  quoteSymbol: string;
};

const XLAYER_PRICE_SOURCES: Record<string, OnchainPriceSource> = {
  // WOKB / USDT 0.05% pool on X Layer (USDT = token0, WOKB = token1)
  "0xe538905cf8410324e03a5a23c1c177a474d59b2b": {
    symbol: "OKB",
    pool: "0x63d62734847e55a266fca4219a9ad0a02d5f6e02",
    baseIsToken1: true,
    baseDecimals: 18,
    quoteDecimals: 6,
    quoteSymbol: "USDT"
  }
};

const slot0Abi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint8 d, bool e)"
]);

async function readOnchainPrice(
  cfg: Config,
  src: OnchainPriceSource,
  address: string
): Promise<AveTokenResult> {
  const transports = cfg.rpcBackup ? fallback([http(cfg.rpcUrl), http(cfg.rpcBackup)]) : http(cfg.rpcUrl);
  const client = createPublicClient({ transport: transports });
  const [sqrtPriceX96] = (await client.readContract({
    address: src.pool,
    abi: slot0Abi,
    functionName: "slot0"
  })) as readonly [bigint, number, number, number, number, number, boolean];

  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  const ratioToken1PerToken0 = sqrt * sqrt; // token1_raw / token0_raw
  // base is token1 (WOKB), quote is token0 (USDT)
  const baseHumanPerQuoteHuman = ratioToken1PerToken0 * 10 ** (src.quoteDecimals - src.baseDecimals);
  const priceUsd = 1 / baseHumanPerQuoteHuman;

  const result = {
    chain: "xlayer",
    address,
    symbol: src.symbol,
    price_usd: priceUsd,
    quote: src.quoteSymbol,
    source: "xlayer-univ3-pool",
    pool: src.pool,
    sqrtPriceX96: sqrtPriceX96.toString()
  };
  const rawResponseSha256 = createHash("sha256").update(JSON.stringify(result)).digest("hex");
  return { result, rawResponseSha256 };
}

export async function callAveToken(cfg: Config, input: AveTokenInput): Promise<AveTokenResult> {
  // Match the canonical on-chain price source by token address alone. The model
  // sometimes passes an unrecognized chain string ("X Layer", "Xlayer", etc.) and
  // sometimes drops the 0x prefix; gating on either caused false INVALIDs that
  // burn the creator bond. Normalize to lowercase 0x-prefixed before lookup.
  const normalizedAddress = "0x" + (input.address ?? "").trim().toLowerCase().replace(/^0x/, "");
  const src = XLAYER_PRICE_SOURCES[normalizedAddress];
  if (src) {
    try {
      return await readOnchainPrice(cfg, src, input.address);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        result: { error: `onchain price read failed: ${message}` },
        rawResponseSha256: createHash("sha256").update(message).digest("hex")
      };
    }
  }

  const url = `${cfg.aveBaseUrl}/token/${encodeURIComponent(input.chain)}/${encodeURIComponent(input.address)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.aveApiKey) headers.Authorization = `Bearer ${cfg.aveApiKey}`;

  const resp = await fetch(url, { headers });
  const bodyText = await resp.text();
  const rawResponseSha256 = createHash("sha256").update(bodyText).digest("hex");

  if (!resp.ok) {
    return {
      result: { error: `ave.ai responded ${resp.status}`, body: bodyText.slice(0, 512) },
      rawResponseSha256
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = { raw: bodyText.slice(0, 512) };
  }

  return { result: parsed, rawResponseSha256 };
}
