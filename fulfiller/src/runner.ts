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

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenAiToolCall[];
    };
    finish_reason?: string;
  }>;
};

type ChatCompletionBody = {
  model: string;
  max_tokens: number;
  tools: ReturnType<typeof toOpenAiTool>[];
  messages: ChatMessage[];
};

export type RunnerDeps = {
  chatComplete?: (cfg: Config, body: ChatCompletionBody) => Promise<ChatCompletionResponse>;
  callAveToken?: (cfg: Config, input: AveTokenInput) => Promise<{ result: unknown; rawResponseSha256: string }>;
  callOnchainRead?: (
    cfg: Config,
    input: OnchainReadInput
  ) => Promise<{ result: unknown; rawResponseSha256: string }>;
};

export const SUPPORTED_MODEL_ID = 0;
export const DGRID_CHEAP_MODEL = "google/gemini-2.5-flash-lite";

export const MODEL_NAMES: Record<number, string> = {
  [SUPPORTED_MODEL_ID]: DGRID_CHEAP_MODEL
};

const CHOICE_LABELS = ["YES", "NO", "INVALID"] as const;
const MAX_ITERATIONS = 5;

function toOpenAiTool(tool: { name: string; description: string; input_schema: unknown }) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  };
}

function extractChoice(text: string, numOfChoices: number): number | null {
  const matches = Array.from(text.matchAll(/\b([0-9]+)\b/g));
  for (const m of matches.reverse()) {
    const v = parseInt(m[1], 10);
    if (Number.isInteger(v) && v >= 0 && v < numOfChoices) return v;
  }
  return null;
}

async function defaultChatComplete(cfg: Config, body: ChatCompletionBody): Promise<ChatCompletionResponse> {
  const base = cfg.dgridBaseUrl.replace(/\/+$/, "");
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.dgridApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`DGrid chat completion failed ${resp.status}: ${text.slice(0, 512)}`);
  }

  return JSON.parse(text) as ChatCompletionResponse;
}

function parseToolArgs(raw: string): unknown {
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function runWithTools(
  cfg: Config,
  modelId: number,
  prompt: string,
  numOfChoices: number,
  deps: RunnerDeps = {}
): Promise<RunResult> {
  const modelName = MODEL_NAMES[modelId];
  if (!modelName) {
    throw new Error(`Unsupported model ID: ${modelId}. Cheap DGrid mode supports only modelId=0.`);
  }
  if (cfg.dgridModel !== modelName) {
    throw new Error(`DGRID_MODEL mismatch: expected ${modelName}, got ${cfg.dgridModel}`);
  }

  const chatComplete = deps.chatComplete ?? defaultChatComplete;
  const aveTool = deps.callAveToken ?? defaultCallAveToken;
  const onchainTool = deps.callOnchainRead ?? defaultCallOnchainRead;

  const steps: TrailStep[] = [];
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  const tools = [toOpenAiTool(aveTokenToolDef), toOpenAiTool(onchainReadToolDef)];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await chatComplete(cfg, {
      model: modelName,
      max_tokens: 1024,
      tools,
      messages
    });

    const message = response.choices?.[0]?.message ?? {};
    const text = message.content ?? "";
    const toolCalls = message.tool_calls ?? [];

    if (text) {
      steps.push({ type: "thought", text });
    }

    if (toolCalls.length === 0) {
      const choice = extractChoice(text, numOfChoices);
      if (choice !== null) {
        steps.push({
          type: "final_choice",
          choice,
          label: CHOICE_LABELS[choice] ?? `CHOICE_${choice}`,
          rationale: text
        });
        return { choice, steps, modelUsed: modelName };
      }
      break;
    }

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls
    });

    for (const call of toolCalls) {
      let args: unknown = {};
      let toolResult: { result: unknown; rawResponseSha256: string };
      try {
        args = parseToolArgs(call.function.arguments);
        if (call.function.name === aveTokenToolDef.name) {
          toolResult = await aveTool(cfg, args as AveTokenInput);
        } else if (call.function.name === onchainReadToolDef.name) {
          toolResult = await onchainTool(cfg, args as OnchainReadInput);
        } else {
          toolResult = {
            result: { error: `tool '${call.function.name}' is not whitelisted` },
            rawResponseSha256: ""
          };
        }
      } catch (err) {
        const message_ = err instanceof Error ? err.message : String(err);
        toolResult = { result: { error: message_ }, rawResponseSha256: "" };
      }

      steps.push({
        type: "tool_call",
        tool: call.function.name,
        args,
        result: toolResult.result,
        rawResponseSha256: toolResult.rawResponseSha256
      });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult.result)
      });
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
