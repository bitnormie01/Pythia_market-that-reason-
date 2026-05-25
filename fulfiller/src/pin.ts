import pinataSDK from "@pinata/sdk";
import type { Config } from "./config";
import { logger } from "./logger";

export type PinResult = {
  cid: string;
  pins: string[];
};

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const W3S_GATEWAY = "https://w3s.link/ipfs/";
const CF_GATEWAY = "https://cloudflare-ipfs.com/ipfs/";

export async function pinTrail(cfg: Config, trail: unknown): Promise<PinResult> {
  const json = JSON.stringify(trail);
  const parsed = JSON.parse(json) as Record<string, unknown>;

  const pinata = new pinataSDK({ pinataJWTKey: cfg.pinataJwt });
  const pinataPromise = pinata
    .pinJSONToIPFS(parsed, { pinataMetadata: { name: "pythia-trail" } })
    .then((res: { IpfsHash: string }) => ({ source: "pinata", cid: res.IpfsHash }));

  const w3sPromise: Promise<{ source: string; cid: string }> = cfg.web3StorageToken
    ? pinToWeb3Storage(cfg.web3StorageToken, json).then((cid) => ({ source: "web3.storage", cid }))
    : Promise.reject(new Error("web3.storage token not configured"));

  const settled = await Promise.allSettled([pinataPromise, w3sPromise]);

  let primaryCid: string | undefined;
  const pins: string[] = [];

  for (const r of settled) {
    if (r.status === "fulfilled") {
      const { source, cid } = r.value;
      primaryCid ??= cid;
      if (source === "pinata") pins.push(`${PINATA_GATEWAY}${cid}`);
      if (source === "web3.storage") pins.push(`${W3S_GATEWAY}${cid}`);
    } else {
      logger.warn({ reason: r.reason instanceof Error ? r.reason.message : String(r.reason) }, "pin provider failed");
    }
  }

  if (!primaryCid) {
    throw new Error("All IPFS pin attempts failed");
  }

  pins.push(`${CF_GATEWAY}${primaryCid}`);
  return { cid: primaryCid, pins };
}

async function pinToWeb3Storage(token: string, json: string): Promise<string> {
  const resp = await fetch("https://api.web3.storage/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: json
  });
  if (!resp.ok) {
    throw new Error(`web3.storage upload failed: ${resp.status}`);
  }
  const data = (await resp.json()) as { cid: string };
  if (!data.cid) throw new Error("web3.storage response missing cid");
  return data.cid;
}
