const GATEWAYS = [
  "https://w3s.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://4everland.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/"
];

export type TrailStep =
  | { type: "thought"; text: string }
  | {
      type: "tool_call";
      tool: string;
      args: unknown;
      result: unknown;
      rawResponseSha256?: string;
    }
  | { type: "final_choice"; choice: number; label: string; rationale: string };

export type Trail = {
  version?: string;
  chainId?: number;
  providerAddress?: string;
  requestId?: string;
  consumer?: string;
  modelId?: number;
  modelName?: string;
  numOfChoices?: number;
  promptKeccak?: string;
  promptSha256?: string;
  marketQuestion?: string;
  fulfilledAt?: string;
  steps: TrailStep[];
  pins?: string[];
};

export async function fetchTrail<T = Trail>(cid: string): Promise<T> {
  if (!cid) throw new Error("missing CID");
  const promises = GATEWAYS.map((gateway) =>
    fetch(gateway + cid, { cache: "force-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${gateway} → ${r.status}`);
      return r.json() as Promise<T>;
    })
  );
  return Promise.any(promises);
}

export function gatewayUrls(cid: string): string[] {
  return GATEWAYS.map((g) => g + cid);
}
