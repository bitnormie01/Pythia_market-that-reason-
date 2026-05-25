import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config";
import { aveTokenToolDef, callAveToken as defaultCallAveToken, type AveTokenInput } from "./tools/aveToken";
import {
  callOnchainRead as defaultCallOnchainRead,
  onchainReadToolDef,
  type OnchainReadInput
} from "./tools/onchainRead";

export type TrailStep =
  | { type: "thought"; text: string }
  | {
      type: "tool_call";
      tool: string;
      args: unknown;
      result: unknown;
      rawResponseSha256: string;
    }
  | { type: "final_choice"; choice: number; label: string; rationale: string };

export type RunResult = {
  choice: number;
  steps: TrailStep[];
  modelUsed: string;
};

export type RunnerDeps = {
  anthropic?: Pick<Anthropic, "messages"> | { messages: { create: (...args: any[]) => Promise<any> } };
  callAveToken?: (cfg: Config, input: AveTokenInput) => Promise<{ result: unknown; rawResponseSha256: string }>;
  callOnchainRead?: (
    cfg: Config,
    input: OnchainReadInput
  ) => Promise<{ result: unknown; rawResponseSha256: string }>;
};

const MODEL_NAMES: Record<number, string> = {
  1: "claude-sonnet-4-6",
  2: "claude-haiku-4-5"
};

const CHOICE_LABELS = ["YES", "NO", "INVALID"] as const;
const MAX_ITERATIONS = 5;

function extractChoice(text: string, numOfChoices: number): number | null {
  const matches = Array.from(text.matchAll(/\b([0-9]+)\b/g));
  for (const m of matches.reverse()) {
    const v = parseInt(m[1], 10);
    if (Number.isInteger(v) && v >= 0 && v < numOfChoices) return v;
  }
  return null;
}

export async function runWithTools(
  cfg: Config,
  modelId: number,
  prompt: string,
  numOfChoices: number,
  deps: RunnerDeps = {}
): Promise<RunResult> {
  const modelName = MODEL_NAMES[modelId];
  if (!modelName) throw new Error(`Unsupported model ID: ${modelId}`);

  const anthropic = deps.anthropic ?? new Anthropic({ apiKey: cfg.anthropicApiKey });
  const aveTool = deps.callAveToken ?? defaultCallAveToken;
  const onchainTool = deps.callOnchainRead ?? defaultCallOnchainRead;

  const steps: TrailStep[] = [];
  const messages: Array<{ role: "user" | "assistant"; content: any }> = [
    { role: "user", content: prompt }
  ];
  const tools = [aveTokenToolDef, onchainReadToolDef];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 1024,
      tools,
      messages
    });

    const blocks: any[] = response.content ?? [];
    const assistantContent: any[] = [];
    const toolResultsForNextTurn: any[] = [];

    for (const block of blocks) {
      assistantContent.push(block);

      if (block.type === "text") {
        const text: string = block.text ?? "";
        steps.push({ type: "thought", text });
        const choice = extractChoice(text, numOfChoices);
        if (choice !== null && (response.stop_reason === "end_turn" || !blocks.some((b) => b.type === "tool_use"))) {
          steps.push({
            type: "final_choice",
            choice,
            label: CHOICE_LABELS[choice] ?? `CHOICE_${choice}`,
            rationale: text
          });
          return { choice, steps, modelUsed: modelName };
        }
      } else if (block.type === "tool_use") {
        let toolResult: { result: unknown; rawResponseSha256: string };
        try {
          if (block.name === aveTokenToolDef.name) {
            toolResult = await aveTool(cfg, block.input as AveTokenInput);
          } else if (block.name === onchainReadToolDef.name) {
            toolResult = await onchainTool(cfg, block.input as OnchainReadInput);
          } else {
            toolResult = {
              result: { error: `tool '${block.name}' is not whitelisted` },
              rawResponseSha256: ""
            };
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          toolResult = { result: { error: message }, rawResponseSha256: "" };
        }

        steps.push({
          type: "tool_call",
          tool: block.name,
          args: block.input,
          result: toolResult.result,
          rawResponseSha256: toolResult.rawResponseSha256
        });

        toolResultsForNextTurn.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(toolResult.result)
        });
      }
    }

    if (toolResultsForNextTurn.length === 0) {
      // No more tools requested; if we got here without a final_choice, give the model one more pass with a nudge.
      if (response.stop_reason === "end_turn") {
        const lastText = [...blocks].reverse().find((b) => b.type === "text")?.text ?? "";
        const choice = extractChoice(lastText, numOfChoices);
        if (choice !== null) {
          steps.push({
            type: "final_choice",
            choice,
            label: CHOICE_LABELS[choice] ?? `CHOICE_${choice}`,
            rationale: lastText
          });
          return { choice, steps, modelUsed: modelName };
        }
        break;
      }
    }

    messages.push({ role: "assistant", content: assistantContent });
    if (toolResultsForNextTurn.length > 0) {
      messages.push({ role: "user", content: toolResultsForNextTurn });
    }
  }

  steps.push({
    type: "final_choice",
    choice: 2,
    label: "INVALID",
    rationale: "no valid choice produced after 5 iterations"
  });
  return { choice: 2, steps, modelUsed: modelName };
}
