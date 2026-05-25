import { createHash } from "node:crypto";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import type { Config } from "../config";

export const onchainReadToolDef = {
  name: "onchain_read_tool",
  description:
    "Read a Solidity view/pure function on X Layer. Provide the contract address, a human-readable signature (e.g. 'totalSupply() view returns (uint256)'), and any args as strings.",
  input_schema: {
    type: "object",
    properties: {
      contract: { type: "string", description: "Contract address (0x...)" },
      signature: {
        type: "string",
        description:
          "Full human-readable signature. Examples: 'totalSupply() view returns (uint256)', 'balanceOf(address) view returns (uint256)'."
      },
      args: { type: "array", items: { type: "string" }, description: "Arguments, in order, as strings." }
    },
    required: ["contract", "signature"]
  }
} as const;

export type OnchainReadInput = { contract: string; signature: string; args?: string[] };
export type OnchainReadResult = { result: unknown; rawResponseSha256: string };

function coerceArg(raw: string): unknown {
  if (/^-?\d+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      return raw;
    }
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

function serializeForHash(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() + "n" : v));
}

export async function callOnchainRead(cfg: Config, input: OnchainReadInput): Promise<OnchainReadResult> {
  const transports = cfg.rpcBackup ? fallback([http(cfg.rpcUrl), http(cfg.rpcBackup)]) : http(cfg.rpcUrl);
  const client = createPublicClient({ transport: transports });

  const fullSig = input.signature.trim().startsWith("function ")
    ? input.signature.trim()
    : `function ${input.signature.trim()}`;
  const abi = parseAbi([fullSig]);
  const functionName = fullSig.replace(/^function\s+/, "").split("(")[0];
  const args = (input.args ?? []).map(coerceArg);

  try {
    const result = await client.readContract({
      address: input.contract as `0x${string}`,
      abi,
      functionName,
      args: args as readonly unknown[]
    });

    const serialized = serializeForHash({
      contract: input.contract,
      signature: fullSig,
      args: input.args ?? [],
      result
    });
    const rawResponseSha256 = createHash("sha256").update(serialized).digest("hex");
    const safeResult = JSON.parse(JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    return { result: safeResult, rawResponseSha256 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { error: `readContract failed: ${message}` },
      rawResponseSha256: createHash("sha256").update(message).digest("hex")
    };
  }
}
