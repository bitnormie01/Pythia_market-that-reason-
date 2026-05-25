import { createHash } from "node:crypto";
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

export async function callAveToken(cfg: Config, input: AveTokenInput): Promise<AveTokenResult> {
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
