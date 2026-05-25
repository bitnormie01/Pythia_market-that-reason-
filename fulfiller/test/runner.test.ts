import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";
import { runWithTools } from "../src/runner";

const baseCfg: Config = {
  rpcUrl: "https://rpc.xlayer.tech",
  providerAddress: "0x0000000000000000000000000000000000000001",
  hookAddress: "0x0000000000000000000000000000000000000002",
  fulfillerPrivateKey: ("0x" + "1".repeat(64)) as `0x${string}`,
  anthropicApiKey: "sk-ant-test",
  aveBaseUrl: "https://api.ave.ai",
  pinataJwt: "pinata-jwt"
};

function makeMockAnthropic(responses: Array<{ content: any[]; stop_reason: string }>) {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => {
        if (i >= responses.length) throw new Error("no more mock responses");
        return responses[i++];
      })
    }
  };
}

describe("runWithTools", () => {
  it("returns the choice when the model emits a single final integer in text", async () => {
    const mock = makeMockAnthropic([
      { content: [{ type: "text", text: "After reviewing the evidence I conclude 0" }], stop_reason: "end_turn" }
    ]);

    const result = await runWithTools(baseCfg, 1, "Will OKB > $50 on 2026-01-01?", 3, {
      anthropic: mock as any
    });

    expect(result.choice).toBe(0);
    expect(result.modelUsed).toBe("claude-sonnet-4-20250514");
    expect(result.steps.some((s) => s.type === "final_choice" && s.choice === 0)).toBe(true);
  });

  it("invokes whitelisted tools and feeds results back to the model", async () => {
    const mock = makeMockAnthropic([
      {
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "ave_token_tool",
            input: { chain: "xlayer", address: "0xAA" }
          }
        ],
        stop_reason: "tool_use"
      },
      { content: [{ type: "text", text: "Based on the token data the answer is 1" }], stop_reason: "end_turn" }
    ]);

    const aveStub = vi.fn(async () => ({ result: { price: 42 }, rawResponseSha256: "deadbeef" }));

    const result = await runWithTools(baseCfg, 1, "Resolve?", 3, {
      anthropic: mock as any,
      callAveToken: aveStub
    });

    expect(aveStub).toHaveBeenCalledOnce();
    expect(result.choice).toBe(1);
    expect(result.steps.some((s) => s.type === "tool_call" && s.tool === "ave_token_tool")).toBe(true);
  });

  it("falls back to choice=2 INVALID after 5 iterations without a valid choice", async () => {
    const toolResponse = {
      content: [
        { type: "tool_use", id: "t1", name: "ave_token_tool", input: { chain: "xlayer", address: "0xAA" } }
      ],
      stop_reason: "tool_use" as const
    };

    const mock = makeMockAnthropic(Array.from({ length: 5 }, () => toolResponse));
    const aveStub = vi.fn(async () => ({ result: {}, rawResponseSha256: "" }));

    const result = await runWithTools(baseCfg, 1, "Resolve?", 3, {
      anthropic: mock as any,
      callAveToken: aveStub
    });

    expect(result.choice).toBe(2);
    expect(result.steps.at(-1)).toMatchObject({ type: "final_choice", choice: 2, label: "INVALID" });
  });

  it("rejects unknown tool calls without crashing", async () => {
    const mock = makeMockAnthropic([
      {
        content: [
          {
            type: "tool_use",
            id: "tx",
            name: "rogue_tool",
            input: {}
          }
        ],
        stop_reason: "tool_use"
      },
      { content: [{ type: "text", text: "Given the lack of data the answer is 2" }], stop_reason: "end_turn" }
    ]);

    const result = await runWithTools(baseCfg, 1, "Resolve?", 3, { anthropic: mock as any });
    const toolStep = result.steps.find((s) => s.type === "tool_call");
    expect(toolStep).toBeDefined();
    expect((toolStep as any).result).toMatchObject({ error: expect.stringContaining("not whitelisted") });
    expect(result.choice).toBe(2);
  });

  it.each([0, 2, 3, 99])("throws on unsupported demo modelId %i", async (modelId) => {
    await expect(
      runWithTools(baseCfg, modelId, "Resolve?", 3, { anthropic: {} as any })
    ).rejects.toThrow(/supports only modelId=1/);
  });
});
