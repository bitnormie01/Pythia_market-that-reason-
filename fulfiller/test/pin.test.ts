import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";

const baseCfg: Config = {
  rpcUrl: "https://rpc.xlayer.tech",
  providerAddress: "0x0000000000000000000000000000000000000001",
  hookAddress: "0x0000000000000000000000000000000000000002",
  fulfillerPrivateKey: ("0x" + "1".repeat(64)) as `0x${string}`,
  dgridApiKey: "sk-dgrid-test",
  dgridBaseUrl: "https://api.dgrid.ai/v1",
  dgridModel: "google/gemini-2.0-flash-lite-001",
  aveBaseUrl: "https://api.ave.ai",
  pinataJwt: "pinata-jwt"
};

const pinJsonMock = vi.fn();

vi.mock("@pinata/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    pinJSONToIPFS: pinJsonMock
  }))
}));

const fetchMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock("../src/logger", () => ({
  logger: {
    warn: loggerWarnMock
  }
}));

beforeEach(() => {
  pinJsonMock.mockReset();
  fetchMock.mockReset();
  loggerWarnMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadPin() {
  return await import("../src/pin");
}

describe("pinTrail", () => {
  it("returns a CID and gateway URLs when Pinata succeeds", async () => {
    pinJsonMock.mockResolvedValueOnce({ IpfsHash: "bafyPINATA" });

    const { pinTrail } = await loadPin();
    const result = await pinTrail(baseCfg, { hello: "world" });

    expect(pinJsonMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.cid).toBe("bafyPINATA");
    expect(result.pins.some((p) => p.includes("bafyPINATA"))).toBe(true);
  });

  it("does not call web3.storage while pinning through Pinata", async () => {
    pinJsonMock.mockResolvedValueOnce({ IpfsHash: "bafyOnlyPinata" });

    const { pinTrail } = await loadPin();
    const result = await pinTrail(baseCfg, { x: 1 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.cid).toBe("bafyOnlyPinata");
    expect(result.pins.find((p) => p.includes("bafyOnlyPinata"))).toBeDefined();
  });

  it("throws when Pinata fails", async () => {
    pinJsonMock.mockRejectedValueOnce(new Error("pinata 500"));

    const { pinTrail } = await loadPin();
    await expect(pinTrail(baseCfg, {})).rejects.toThrow(/All IPFS pin attempts failed/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledOnce();
  });

  it("does not warn about missing web3.storage configuration", async () => {
    pinJsonMock.mockResolvedValueOnce({ IpfsHash: "bafyP" });

    const { pinTrail } = await loadPin();
    const result = await pinTrail(baseCfg, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(result.cid).toBe("bafyP");
  });
});
