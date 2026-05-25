import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("throws when required env vars are missing", () => {
    expect(() => loadConfig({})).toThrow(/XLAYER_RPC_URL/);
  });

  it("returns parsed config when all required vars present", () => {
    const cfg = loadConfig({
      XLAYER_RPC_URL: "https://rpc.xlayer.tech",
      PYTHIA_AI_PROVIDER_ADDRESS: "0x0000000000000000000000000000000000000001",
      PYTHIA_HOOK_ADDRESS: "0x0000000000000000000000000000000000000002",
      FULFILLER_PRIVATE_KEY: `0x${"1".repeat(64)}`,
      ANTHROPIC_API_KEY: "sk-ant-test",
      PINATA_JWT: "test"
    });

    expect(cfg.providerAddress).toBe("0x0000000000000000000000000000000000000001");
    expect(cfg.anthropicApiKey).toBe("sk-ant-test");
    expect(cfg.aveBaseUrl).toBe("https://api.ave.ai");
  });
});
