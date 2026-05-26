import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";
import { runWithTools } from "../src/runner";

const baseCfg: Config = {
  rpcUrl: "https://rpc.xlayer.tech",
  providerAddress: "0x0000000000000000000000000000000000000001",
  hookAddress: "0x0000000000000000000000000000000000000002",
  fulfillerPrivateKey: ("0x" + "1".repeat(64)) as `0x${string}`,
  dgridApiKey: "sk-dgrid-test",
  dgridBaseUrl: "https://api.dgrid.ai/v1",
  dgridModel: "google/gemini-2.5-flash-lite",
  aveBaseUrl: "https://api.ave.ai",
  pinataJwt: "pinata-jwt"
};

function makeMockChat(responses: any[]) {
  let i = 0;
  return vi.fn(async () => {
    if (i >= responses.length) throw new Error("no more mock responses");
    return responses[i++];
  });
}

describe("runWithTools", () => {
  it("returns the choice when the model emits a single final integer in text", async () => {
    const chatComplete = makeMockChat([
      { choices: [{ message: { role: "assistant", content: "After reviewing the evidence I conclude 0" } }] }
    ]);

    const result = await runWithTools(baseCfg, 0, "Will OKB > $50 on 2026-01-01?", 3, {
      chatComplete
    });

    expect(result.choice).toBe(0);
    expect(result.modelUsed).toBe("google/gemini-2.5-flash-lite");
    expect(result.steps.some((s) => s.type === "final_choice" && s.choice === 0)).toBe(true);
    expect(chatComplete.mock.calls[0][1].model).toBe("google/gemini-2.5-flash-lite");
  });

  it("invokes whitelisted tools and feeds results back to the model", async () => {
    const chatComplete = makeMockChat([
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "ave_token_tool",
                    arguments: JSON.stringify({ chain: "xlayer", address: "0xAA" })
                  }
                }
              ]
            }
          }
        ]
      },
      { choices: [{ message: { role: "assistant", content: "Based on the token data the answer is 1" } }] }
    ]);

    const aveStub = vi.fn(async () => ({ result: { price: 42 }, rawResponseSha256: "deadbeef" }));

    const result = await runWithTools(baseCfg, 0, "Resolve?", 3, {
      chatComplete,
      callAveToken: aveStub
    });

    expect(aveStub).toHaveBeenCalledOnce();
    expect(result.choice).toBe(1);
    expect(result.steps.some((s) => s.type === "tool_call" && s.tool === "ave_token_tool")).toBe(true);
    expect(chatComplete.mock.calls[1][1].messages.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "call_1"
    });
  });

  it("falls back to choice=2 INVALID after 5 iterations without a valid choice", async () => {
    const toolResponse = {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "ave_token_tool",
                  arguments: JSON.stringify({ chain: "xlayer", address: "0xAA" })
                }
              }
            ]
          }
        }
      ]
    };

    const chatComplete = makeMockChat(Array.from({ length: 5 }, () => toolResponse));
    const aveStub = vi.fn(async () => ({ result: {}, rawResponseSha256: "" }));

    const result = await runWithTools(baseCfg, 0, "Resolve?", 3, {
      chatComplete,
      callAveToken: aveStub
    });

    expect(chatComplete).toHaveBeenCalledTimes(5);
    expect(result.choice).toBe(2);
    expect(result.steps.at(-1)).toMatchObject({ type: "final_choice", choice: 2, label: "INVALID" });
  });

  it("rejects unknown tool calls without crashing", async () => {
    const chatComplete = makeMockChat([
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_rogue",
                  type: "function",
                  function: { name: "rogue_tool", arguments: "{}" }
                }
              ]
            }
          }
        ]
      },
      { choices: [{ message: { role: "assistant", content: "Given the lack of data the answer is 2" } }] }
    ]);

    const result = await runWithTools(baseCfg, 0, "Resolve?", 3, { chatComplete });
    const toolStep = result.steps.find((s) => s.type === "tool_call");
    expect(toolStep).toBeDefined();
    expect((toolStep as any).result).toMatchObject({ error: expect.stringContaining("not whitelisted") });
    expect(result.choice).toBe(2);
  });

  it("throws when env model does not match on-chain model mapping", async () => {
    await expect(
      runWithTools({ ...baseCfg, dgridModel: "google/gemini-2.5-flash" }, 0, "Resolve?", 3, {
        chatComplete: makeMockChat([])
      })
    ).rejects.toThrow(/DGRID_MODEL mismatch/);
  });

  it.each([1, 2, 3, 99])("throws on unsupported cheap-mode modelId %i", async (modelId) => {
    await expect(
      runWithTools(baseCfg, modelId, "Resolve?", 3, { chatComplete: makeMockChat([]) })
    ).rejects.toThrow(/Cheap DGrid mode supports only modelId=0/);
  });
});
