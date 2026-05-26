import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";

const baseCfg: Config = {
  rpcUrl: "https://rpc.xlayer.tech",
  providerAddress: "0x0000000000000000000000000000000000000001",
  hookAddress: "0x0000000000000000000000000000000000000002",
  fulfillerPrivateKey: ("0x" + "a".repeat(64)) as `0x${string}`,
  dgridApiKey: "sk-dgrid-test",
  dgridBaseUrl: "https://api.dgrid.ai/v1",
  dgridModel: "google/gemini-2.0-flash-lite-001",
  aveBaseUrl: "https://api.ave.ai",
  pinataJwt: "pinata-jwt"
};

describe("submitFulfillReasoning", () => {
  it("writes fulfillReasoning and waits for a success receipt", async () => {
    const writeContract = vi.fn(async () => "0xTX1" as `0x${string}`);
    const waitForTransactionReceipt = vi.fn(async () => ({ status: "success", transactionHash: "0xTX1" }));

    const { submitFulfillReasoning } = await import("../src/submit");
    const hash = await submitFulfillReasoning(baseCfg, 7n, 1, "bafyABC", {
      wallet: { writeContract } as any,
      pub: { waitForTransactionReceipt } as any
    });

    expect(writeContract).toHaveBeenCalledOnce();
    const callArgs = writeContract.mock.calls[0][0] as any;
    expect(callArgs.functionName).toBe("fulfillReasoning");
    expect(callArgs.args).toEqual([7n, 1, "bafyABC"]);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xTX1" });
    expect(hash).toBe("0xTX1");
  });

  it("throws when the receipt status is not success", async () => {
    const writeContract = vi.fn(async () => "0xTX2" as `0x${string}`);
    const waitForTransactionReceipt = vi.fn(async () => ({ status: "reverted", transactionHash: "0xTX2" }));

    const { submitFulfillReasoning } = await import("../src/submit");
    await expect(
      submitFulfillReasoning(baseCfg, 1n, 0, "bafy", {
        wallet: { writeContract } as any,
        pub: { waitForTransactionReceipt } as any
      })
    ).rejects.toThrow(/reverted/);
  });
});

describe("submitRefund", () => {
  it("writes refundRequest and waits for a success receipt", async () => {
    const writeContract = vi.fn(async () => "0xTXR" as `0x${string}`);
    const waitForTransactionReceipt = vi.fn(async () => ({ status: "success", transactionHash: "0xTXR" }));

    const { submitRefund } = await import("../src/submit");
    const hash = await submitRefund(baseCfg, 99n, {
      wallet: { writeContract } as any,
      pub: { waitForTransactionReceipt } as any
    });

    const callArgs = writeContract.mock.calls[0][0] as any;
    expect(callArgs.functionName).toBe("refundRequest");
    expect(callArgs.args).toEqual([99n]);
    expect(hash).toBe("0xTXR");
  });
});
