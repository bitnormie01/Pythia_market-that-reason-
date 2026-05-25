import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";

const baseCfg: Config = {
  rpcUrl: "https://rpc.xlayer.tech",
  providerAddress: "0x0000000000000000000000000000000000000001",
  hookAddress: "0x0000000000000000000000000000000000000002",
  fulfillerPrivateKey: ("0x" + "1".repeat(64)) as `0x${string}`,
  anthropicApiKey: "sk-ant-test",
  aveBaseUrl: "https://api.ave.ai",
  pinataJwt: "pinata-jwt",
  web3StorageToken: "w3s-token"
};

const pinJsonMock = vi.fn();

vi.mock("@pinata/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    pinJSONToIPFS: pinJsonMock
  }))
}));

const fetchMock = vi.fn();

beforeEach(() => {
  pinJsonMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadPin() {
  return await import("../src/pin");
}

describe("pinTrail", () => {
  it("returns a CID and both gateway URLs when both providers succeed", async () => {
    pinJsonMock.mockResolvedValueOnce({ IpfsHash: "bafyPINATA" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ cid: "bafyW3S" })
    } as any);

    const { pinTrail } = await loadPin();
    const result = await pinTrail(baseCfg, { hello: "world" });

    expect(pinJsonMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.cid).toBe("bafyPINATA");
    expect(result.pins.some((p) => p.includes("bafyPINATA"))).toBe(true);
    expect(result.pins.some((p) => p.includes("bafyW3S"))).toBe(true);
  });

  it("succeeds when only Pinata works", async () => {
    pinJsonMock.mockResolvedValueOnce({ IpfsHash: "bafyOnlyPinata" });
    fetchMock.mockRejectedValueOnce(new Error("w3s offline"));

    const { pinTrail } = await loadPin();
    const result = await pinTrail(baseCfg, { x: 1 });

    expect(result.cid).toBe("bafyOnlyPinata");
    expect(result.pins.find((p) => p.includes("bafyOnlyPinata"))).toBeDefined();
  });

  it("succeeds when only web3.storage works", async () => {
    pinJsonMock.mockRejectedValueOnce(new Error("pinata 500"));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ cid: "bafyOnlyW3S" })
    } as any);

    const { pinTrail } = await loadPin();
    const result = await pinTrail(baseCfg, { x: 1 });

    expect(result.cid).toBe("bafyOnlyW3S");
  });

  it("throws when both providers fail", async () => {
    pinJsonMock.mockRejectedValueOnce(new Error("pinata down"));
    fetchMock.mockRejectedValueOnce(new Error("w3s down"));

    const { pinTrail } = await loadPin();
    await expect(pinTrail(baseCfg, {})).rejects.toThrow(/All IPFS pin attempts failed/);
  });

  it("skips web3.storage when no token is configured", async () => {
    pinJsonMock.mockResolvedValueOnce({ IpfsHash: "bafyP" });

    const { pinTrail } = await loadPin();
    const result = await pinTrail({ ...baseCfg, web3StorageToken: undefined }, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.cid).toBe("bafyP");
  });
});
