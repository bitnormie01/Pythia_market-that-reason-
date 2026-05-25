import pinataSDK from "@pinata/sdk";
import type { Config } from "./config";
import { logger } from "./logger";

export type PinResult = {
  cid: string;
  pins: string[];
};

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const CF_GATEWAY = "https://cloudflare-ipfs.com/ipfs/";

export async function pinTrail(cfg: Config, trail: unknown): Promise<PinResult> {
  const json = JSON.stringify(trail);
  const parsed = JSON.parse(json) as Record<string, unknown>;

  const pinata = new pinataSDK({ pinataJWTKey: cfg.pinataJwt });
  const pinataPromise = pinata
    .pinJSONToIPFS(parsed, { pinataMetadata: { name: "pythia-trail" } })
    .then((res: { IpfsHash: string }) => ({ source: "pinata", cid: res.IpfsHash }));

  const settled = await Promise.allSettled([pinataPromise]);

  let primaryCid: string | undefined;
  const pins: string[] = [];

  for (const r of settled) {
    if (r.status === "fulfilled") {
      const { source, cid } = r.value;
      primaryCid ??= cid;
      if (source === "pinata") pins.push(`${PINATA_GATEWAY}${cid}`);
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
