# Pythia Fulfiller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the off-chain Node.js + TypeScript worker that watches `PythiaAIProvider.FlapAIProviderRequestMade` events on X Layer, runs DGrid's OpenAI-compatible chat completions with tool calls, pins the reasoning trail to IPFS, and submits `fulfillReasoning(requestId, choice, cid)` back on-chain.

**Architecture:** Single long-running process on a VPS. Event watcher -> job queue -> LLM runner (DGrid `/v1/chat/completions` with OpenAI tool calls) -> IPFS pinning (Pinata) -> tx submitter. SQLite for crash-safe state. Heartbeat monitoring. Backup fulfiller EOA pre-granted FULFILLER_ROLE on the provider contract for failover.

**Tech Stack:** Node 20, TypeScript 5, viem 2.x, direct `fetch` to DGrid, better-sqlite3, pino (logger), zod (schema validation), Pinata SDK, vitest (tests).

**Source spec:** `docs/superpowers/specs/2026-05-23-pythia-prediction-market-hook-design.md` §4

**Depends on:** Plan 1 contracts (need compiled ABI + deployed addresses)

---

## Phase 0 — Project scaffold

### Task 0.1: Initialize fulfiller package

**Files:**
- Create: `fulfiller/package.json`
- Create: `fulfiller/tsconfig.json`
- Create: `fulfiller/.env.example`
- Create: `fulfiller/.gitignore`

- [ ] **Step 1: Create the folder and init npm**

```bash
cd C:/xLayer-hackathon/uniswapV4Hackthon
mkdir fulfiller
cd fulfiller
npm init -y
```

- [ ] **Step 2: Replace `package.json` contents**

```json
{
  "name": "pythia-fulfiller",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@pinata/sdk": "^2.1.0",
    "better-sqlite3": "^11.0.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "viem": "^2.21.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: Install**

```bash
npm install
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": false
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Write `.env.example`**

```bash
# X Layer
XLAYER_RPC_URL=https://rpc.xlayer.tech
XLAYER_RPC_BACKUP=https://rpc.ankr.com/xlayer

# Contracts (populate after Plan 4 deploy)
PYTHIA_AI_PROVIDER_ADDRESS=0x...
PYTHIA_HOOK_ADDRESS=0x...

# Fulfiller hot wallet (USE A DEDICATED EOA, NOT YOUR MAIN KEY)
FULFILLER_PRIVATE_KEY=0x...
FULFILLER_BACKUP_PRIVATE_KEY=0x... # optional, for failover

# LLM
DGRID_API_KEY=sk-...
DGRID_BASE_URL=https://api.dgrid.ai/v1
DGRID_MODEL=google/gemini-2.5-flash-lite

# Tools
AVE_AI_API_KEY=
AVE_AI_BASE_URL=https://api.ave.ai

# IPFS
PINATA_JWT=

# Monitoring
BETTERSTACK_HEARTBEAT_URL=
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
dist/
.env
*.sqlite
*.log
```

- [ ] **Step 7: Commit**

```bash
cd C:/xLayer-hackathon/uniswapV4Hackthon
git add fulfiller/
git commit -m "feat(fulfiller): npm + tsconfig scaffold"
```

### Task 0.2: Folder structure + config module

**Files:**
- Create: `fulfiller/src/config.ts`
- Create: `fulfiller/src/index.ts`
- Create: `fulfiller/src/logger.ts`

- [ ] **Step 1: Write failing config test**

`fulfiller/test/config.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
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
      FULFILLER_PRIVATE_KEY: "0x" + "1".repeat(64),
      DGRID_API_KEY: "sk-dgrid-test",
      PINATA_JWT: "test",
    });
    expect(cfg.providerAddress).toBe("0x0000000000000000000000000000000000000001");
    expect(cfg.dgridModel).toBe("google/gemini-2.5-flash-lite");
  });
});
```

- [ ] **Step 2: Run; expect fail**

```bash
npm test
```

- [ ] **Step 3: Implement config.ts**

```typescript
import { z } from "zod";

const ConfigSchema = z.object({
  XLAYER_RPC_URL: z.string().url(),
  XLAYER_RPC_BACKUP: z.string().url().optional(),
  PYTHIA_AI_PROVIDER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  PYTHIA_HOOK_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  FULFILLER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  FULFILLER_BACKUP_PRIVATE_KEY: z.string().optional(),
  DGRID_API_KEY: z.string().min(1),
  DGRID_BASE_URL: z.string().url().default("https://api.dgrid.ai/v1"),
  DGRID_MODEL: z.string().min(1).default("google/gemini-2.5-flash-lite"),
  AVE_AI_API_KEY: z.string().optional(),
  AVE_AI_BASE_URL: z.string().url().default("https://api.ave.ai"),
  PINATA_JWT: z.string().min(1),
  BETTERSTACK_HEARTBEAT_URL: z.string().url().optional(),
});

export type Config = {
  rpcUrl: string;
  rpcBackup?: string;
  providerAddress: `0x${string}`;
  hookAddress: `0x${string}`;
  fulfillerPrivateKey: `0x${string}`;
  fulfillerBackupPrivateKey?: `0x${string}`;
  dgridApiKey: string;
  dgridBaseUrl: string;
  dgridModel: string;
  aveApiKey?: string;
  aveBaseUrl: string;
  pinataJwt: string;
  heartbeatUrl?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.parse(env);
  return {
    rpcUrl: parsed.XLAYER_RPC_URL,
    rpcBackup: parsed.XLAYER_RPC_BACKUP,
    providerAddress: parsed.PYTHIA_AI_PROVIDER_ADDRESS as `0x${string}`,
    hookAddress: parsed.PYTHIA_HOOK_ADDRESS as `0x${string}`,
    fulfillerPrivateKey: parsed.FULFILLER_PRIVATE_KEY as `0x${string}`,
    fulfillerBackupPrivateKey: parsed.FULFILLER_BACKUP_PRIVATE_KEY as `0x${string}` | undefined,
    dgridApiKey: parsed.DGRID_API_KEY,
    dgridBaseUrl: parsed.DGRID_BASE_URL,
    dgridModel: parsed.DGRID_MODEL,
    aveApiKey: parsed.AVE_AI_API_KEY,
    aveBaseUrl: parsed.AVE_AI_BASE_URL,
    pinataJwt: parsed.PINATA_JWT,
    heartbeatUrl: parsed.BETTERSTACK_HEARTBEAT_URL,
  };
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
npm test
```

- [ ] **Step 5: Logger**

`fulfiller/src/logger.ts`:
```typescript
import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" } },
});
```

- [ ] **Step 6: Commit**

```bash
git add fulfiller/
git commit -m "feat(fulfiller): config loader + logger with zod validation"
```

---

## Phase 1 — SQLite persistence layer

### Task 1.1: Schema + open/migrate

**Files:**
- Create: `fulfiller/src/persist.ts`
- Create: `fulfiller/test/persist.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, recordRequest, getRequest, markFulfilled, listPending } from "../src/persist";

let db: any;
beforeEach(() => { db = openDb(":memory:"); });

describe("persist", () => {
  it("records and reads back a request", () => {
    recordRequest(db, 42n, "0xC0", 1, 3, "prompt-hash", Date.now());
    const r = getRequest(db, 42n);
    expect(r?.consumer).toBe("0xC0");
    expect(r?.status).toBe("pending");
  });

  it("markFulfilled moves status to fulfilled and stores cid + txHash", () => {
    recordRequest(db, 1n, "0xC0", 1, 3, "h", Date.now());
    markFulfilled(db, 1n, 0, "bafyTEST", "0xTX");
    const r = getRequest(db, 1n);
    expect(r?.status).toBe("fulfilled");
    expect(r?.cid).toBe("bafyTEST");
    expect(r?.txHash).toBe("0xTX");
  });

  it("listPending returns only pending rows", () => {
    recordRequest(db, 1n, "0xC0", 1, 3, "h", Date.now());
    recordRequest(db, 2n, "0xC0", 1, 3, "h", Date.now());
    markFulfilled(db, 1n, 0, "bafy", "0xTX");
    expect(listPending(db).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run; fail**

```bash
npm test -- persist
```

- [ ] **Step 3: Implement**

```typescript
import Database from "better-sqlite3";

export type RequestRow = {
  requestId: bigint;
  consumer: string;
  modelId: number;
  numOfChoices: number;
  promptHash: string;
  status: "pending" | "fulfilled" | "refunded" | "failed";
  choice: number | null;
  cid: string | null;
  txHash: string | null;
  createdAt: number;
  updatedAt: number;
};

export function openDb(path: string) {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      request_id TEXT PRIMARY KEY,
      consumer TEXT NOT NULL,
      model_id INTEGER NOT NULL,
      num_of_choices INTEGER NOT NULL,
      prompt_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      choice INTEGER,
      cid TEXT,
      tx_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_status ON requests(status);
  `);
  return db;
}

export function recordRequest(
  db: Database.Database,
  requestId: bigint, consumer: string, modelId: number,
  numOfChoices: number, promptHash: string, ts: number
) {
  db.prepare(`
    INSERT OR IGNORE INTO requests
      (request_id, consumer, model_id, num_of_choices, prompt_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(requestId.toString(), consumer, modelId, numOfChoices, promptHash, ts, ts);
}

export function getRequest(db: Database.Database, requestId: bigint): RequestRow | undefined {
  const row = db.prepare(`SELECT * FROM requests WHERE request_id = ?`).get(requestId.toString()) as any;
  if (!row) return undefined;
  return {
    requestId: BigInt(row.request_id), consumer: row.consumer, modelId: row.model_id,
    numOfChoices: row.num_of_choices, promptHash: row.prompt_hash, status: row.status,
    choice: row.choice, cid: row.cid, txHash: row.tx_hash, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function listPending(db: Database.Database): RequestRow[] {
  const rows = db.prepare(`SELECT * FROM requests WHERE status = 'pending'`).all() as any[];
  return rows.map(r => ({
    requestId: BigInt(r.request_id), consumer: r.consumer, modelId: r.model_id,
    numOfChoices: r.num_of_choices, promptHash: r.prompt_hash, status: r.status,
    choice: r.choice, cid: r.cid, txHash: r.tx_hash, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export function markFulfilled(db: Database.Database, requestId: bigint, choice: number, cid: string, txHash: string) {
  db.prepare(`
    UPDATE requests SET status='fulfilled', choice=?, cid=?, tx_hash=?, updated_at=?
    WHERE request_id=?
  `).run(choice, cid, txHash, Date.now(), requestId.toString());
}

export function markRefunded(db: Database.Database, requestId: bigint, txHash: string) {
  db.prepare(`UPDATE requests SET status='refunded', tx_hash=?, updated_at=? WHERE request_id=?`)
    .run(txHash, Date.now(), requestId.toString());
}
```

- [ ] **Step 4: Pass; commit**

```bash
npm test -- persist
git add fulfiller/src/persist.ts fulfiller/test/persist.test.ts
git commit -m "feat(fulfiller): SQLite persistence layer with status state machine"
```

---

## Phase 2 — Event watcher

### Task 2.1: viem watchContractEvent for FlapAIProviderRequestMade

**Files:**
- Create: `fulfiller/src/watcher.ts`
- Create: `fulfiller/abi/PythiaAIProvider.ts`
- Create: `fulfiller/test/watcher.test.ts`

- [ ] **Step 1: Copy compiled ABI from contracts**

After Plan 1 compiles, the ABI is at `contracts/out/PythiaAIProvider.sol/PythiaAIProvider.json`. Extract just the `abi` array into `fulfiller/abi/PythiaAIProvider.ts`:

```typescript
export const PythiaAIProviderAbi = [/* paste abi array here */] as const;
```

- [ ] **Step 2: Failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { onRequestMade } from "../src/watcher";

describe("onRequestMade", () => {
  it("invokes the callback with parsed event args", async () => {
    const cb = vi.fn();
    await onRequestMade({
      args: { requestId: 1n, consumer: "0xC0", modelId: 1n, prompt: "p", numOfChoices: 3, feePaid: 10n },
    } as any, cb);
    expect(cb).toHaveBeenCalledWith({
      requestId: 1n, consumer: "0xC0", modelId: 1, numOfChoices: 3, prompt: "p"
    });
  });
});
```

- [ ] **Step 3: Implement**

```typescript
import { createPublicClient, http, fallback, type Log } from "viem";
import { PythiaAIProviderAbi } from "../abi/PythiaAIProvider";
import { Config } from "./config";
import { logger } from "./logger";

export type RequestMadeEvent = {
  requestId: bigint;
  consumer: `0x${string}`;
  modelId: number;
  numOfChoices: number;
  prompt: string;
};

export async function onRequestMade(log: { args: any }, handler: (e: RequestMadeEvent) => void | Promise<void>) {
  await handler({
    requestId: log.args.requestId,
    consumer: log.args.consumer,
    modelId: Number(log.args.modelId),
    numOfChoices: Number(log.args.numOfChoices),
    prompt: log.args.prompt,
  });
}

export function startWatcher(cfg: Config, handler: (e: RequestMadeEvent) => Promise<void>) {
  const transports = [http(cfg.rpcUrl)];
  if (cfg.rpcBackup) transports.push(http(cfg.rpcBackup));
  const client = createPublicClient({ transport: fallback(transports) });

  return client.watchContractEvent({
    address: cfg.providerAddress,
    abi: PythiaAIProviderAbi,
    eventName: "FlapAIProviderRequestMade",
    onLogs: async (logs) => {
      for (const log of logs) {
        try { await onRequestMade(log as any, handler); }
        catch (err) { logger.error({ err, log }, "handler failed"); }
      }
    },
    onError: (err) => logger.error({ err }, "watcher error"),
  });
}
```

- [ ] **Step 4: Run; pass; commit**

```bash
npm test -- watcher
git add fulfiller/
git commit -m "feat(fulfiller): event watcher for FlapAIProviderRequestMade"
```

---

## Phase 3 — LLM runner with tool calls

### Task 3.1: DGrid OpenAI-compatible wrapper with tool registry

**Files:**
- Create: `fulfiller/src/runner.ts`
- Create: `fulfiller/src/tools/aveToken.ts`
- Create: `fulfiller/src/tools/onchainRead.ts`
- Create: `fulfiller/test/runner.test.ts`

- [ ] **Step 1: Failing test (uses mocked chat completions)**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runWithTools } from "../src/runner";

describe("runWithTools", () => {
  it("returns a valid choice from DGrid chat text", async () => {
    const chatComplete = vi.fn(async () => ({
      choices: [{ message: { role: "assistant", content: "0" } }],
    }));
    const result = await runWithTools(cfg, 0, "Resolve?", 3, { chatComplete });
    expect(result.modelUsed).toBe("google/gemini-2.5-flash-lite");
    expect(result.choice).toBe(0);
  });
});
```

- [ ] **Step 2: Implement aveToken tool**

`fulfiller/src/tools/aveToken.ts`:
```typescript
import { Config } from "../config";

export const aveTokenToolDef = {
  name: "ave_token_tool",
  description: "Fetch live market data for a token (price, volume, mcap, holders) on a given chain.",
  input_schema: {
    type: "object",
    properties: {
      chain: { type: "string", description: "Chain name: 'xlayer', 'bsc', etc." },
      address: { type: "string", description: "Token contract address (0x...)" },
    },
    required: ["chain", "address"],
  },
} as const;

export async function callAveToken(cfg: Config, input: { chain: string; address: string }) {
  const url = `${cfg.aveBaseUrl}/token/${input.chain}/${input.address}`;
  const resp = await fetch(url, {
    headers: cfg.aveApiKey ? { Authorization: `Bearer ${cfg.aveApiKey}` } : {},
  });
  const bodyText = await resp.text();
  const result = JSON.parse(bodyText);
  // Hash raw response for trail provenance
  const { createHash } = await import("crypto");
  const sha256 = createHash("sha256").update(bodyText).digest("hex");
  return { result, rawResponseSha256: sha256 };
}
```

- [ ] **Step 3: Implement onchainRead tool**

`fulfiller/src/tools/onchainRead.ts`:
```typescript
import { createPublicClient, http } from "viem";
import { Config } from "../config";

export const onchainReadToolDef = {
  name: "onchain_read_tool",
  description: "Read a view function on X Layer. Pass contract address, function signature, and args.",
  input_schema: {
    type: "object",
    properties: {
      contract: { type: "string" },
      signature: { type: "string", description: "e.g. 'totalSupply()(uint256)'" },
      args: { type: "array", items: { type: "string" } },
    },
    required: ["contract", "signature"],
  },
} as const;

export async function callOnchainRead(cfg: Config, input: { contract: string; signature: string; args?: string[] }) {
  // Use viem to encode + call. For brevity wire via parseAbi + readContract.
  // (Implementation continues; executor agent fills in.)
  return { result: "TODO", rawResponseSha256: "TODO" };
}
```

- [ ] **Step 4: Implement runner**

`fulfiller/src/runner.ts`:
```typescript
import { aveTokenToolDef, callAveToken } from "./tools/aveToken";
import { onchainReadToolDef, callOnchainRead } from "./tools/onchainRead";
import { Config } from "./config";

export type TrailStep =
  | { type: "thought"; text: string }
  | { type: "tool_call"; tool: string; args: any; result: any; rawResponseSha256: string }
  | { type: "final_choice"; choice: number; label: string; rationale: string };

export type RunResult = {
  choice: number;
  steps: TrailStep[];
  modelUsed: string;
};

const MODEL_NAMES: Record<number, string> = {
  0: "google/gemini-2.5-flash-lite",
};

export async function runWithTools(
  cfg: Config,
  modelId: number,
  prompt: string,
  numOfChoices: number
): Promise<RunResult> {
  const modelName = MODEL_NAMES[modelId];
  if (!modelName) throw new Error(`Unsupported model ID: ${modelId}. Cheap DGrid mode supports only modelId=0.`);
  if (cfg.dgridModel !== modelName) throw new Error(`DGRID_MODEL mismatch: expected ${modelName}, got ${cfg.dgridModel}`);

  const steps: TrailStep[] = [];
  const messages: any[] = [{ role: "user", content: prompt }];
  const tools = [aveTokenToolDef, onchainReadToolDef].map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  }));

  for (let iter = 0; iter < 5; iter++) {
    const response = await fetch(`${cfg.dgridBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.dgridApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, max_tokens: 1024, tools, messages }),
    });
    if (!response.ok) throw new Error(`DGrid chat completion failed ${response.status}`);
    const json = await response.json() as any;
    const message = json.choices?.[0]?.message ?? {};
    const text = message.content ?? "";
    const toolCalls = message.tool_calls ?? [];

    if (text) steps.push({ type: "thought", text });
    if (toolCalls.length === 0) {
      const match = text.match(/\b([0-9]+)\b/);
      if (match) {
        const choice = parseInt(match[1], 10);
        if (choice >= 0 && choice < numOfChoices) {
          steps.push({ type: "final_choice", choice, label: ["YES", "NO", "INVALID"][choice] ?? "?", rationale: text });
          return { choice, steps, modelUsed: modelName };
        }
      }
      break;
    }

    messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments || "{}");
      const toolResult = call.function.name === "ave_token_tool"
        ? await callAveToken(cfg, args)
        : call.function.name === "onchain_read_tool"
          ? await callOnchainRead(cfg, args)
          : { result: { error: "tool not whitelisted" }, rawResponseSha256: "" };
      steps.push({ type: "tool_call", tool: call.function.name, args, result: toolResult.result, rawResponseSha256: toolResult.rawResponseSha256 });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult.result) });
    }
  }

  // Fallback if no valid choice extracted
  steps.push({ type: "final_choice", choice: 2, label: "INVALID", rationale: "no valid choice produced after 5 iterations" });
  return { choice: 2, steps, modelUsed: modelName };
}
```

- [ ] **Step 5: Commit**

```bash
git add fulfiller/src/runner.ts fulfiller/src/tools/
git commit -m "feat(fulfiller): DGrid runner with ave_token + onchain_read tool calls"
```

---

## Phase 4 — IPFS pin (Pinata)

### Task 4.1: Pin trail JSON to Pinata

**Files:**
- Create: `fulfiller/src/pin.ts`
- Create: `fulfiller/test/pin.test.ts`

- [ ] **Step 1: Implement**

```typescript
import pinataSDK from "@pinata/sdk";
import { Config } from "./config";
import { logger } from "./logger";

export async function pinTrail(cfg: Config, trail: object): Promise<{ cid: string; pins: string[] }> {
  const json = JSON.stringify(trail);
  const pinata = new pinataSDK({ pinataJWTKey: cfg.pinataJwt });

  const pinPinata = pinata.pinJSONToIPFS(JSON.parse(json), { pinataMetadata: { name: "pythia-trail" } });

  const [pRes] = await Promise.allSettled([pinPinata]);
  let cid: string | undefined;
  const pins: string[] = [];
  if (pRes.status === "fulfilled") { cid = pRes.value.IpfsHash; pins.push(`https://gateway.pinata.cloud/ipfs/${cid}`); }
  if (!cid) throw new Error("All IPFS pin attempts failed");
  pins.push(`https://cloudflare-ipfs.com/ipfs/${cid}`);
  return { cid, pins };
}
```

- [ ] **Step 2: Test with mocked SDKs**

(Mock `@pinata/sdk` in vitest; verify Pinata success returns a CID and gateway URLs, and Pinata failure throws.)

- [ ] **Step 3: Commit**

```bash
git add fulfiller/src/pin.ts fulfiller/test/pin.test.ts
git commit -m "feat(fulfiller): Pinata IPFS pin with fallback gateway"
```

---

## Phase 5 — Submit fulfillReasoning on-chain

### Task 5.1: viem wallet client + submit tx

**Files:**
- Create: `fulfiller/src/submit.ts`

- [ ] **Step 1: Implement**

```typescript
import { createWalletClient, http, fallback, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { PythiaAIProviderAbi } from "../abi/PythiaAIProvider";
import { Config } from "./config";
import { logger } from "./logger";

const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
});

export async function submitFulfillReasoning(
  cfg: Config,
  requestId: bigint,
  choice: number,
  cid: string
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(cfg.fulfillerPrivateKey);
  const transports = [http(cfg.rpcUrl)];
  if (cfg.rpcBackup) transports.push(http(cfg.rpcBackup));
  const wallet = createWalletClient({ chain: xLayer, account, transport: fallback(transports) });
  const pub = createPublicClient({ chain: xLayer, transport: fallback(transports) });

  const hash = await wallet.writeContract({
    address: cfg.providerAddress,
    abi: PythiaAIProviderAbi,
    functionName: "fulfillReasoning",
    args: [requestId, choice, cid],
  });
  logger.info({ requestId, hash }, "fulfillment tx submitted");

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Tx reverted: ${hash}`);
  return hash;
}

export async function submitRefund(cfg: Config, requestId: bigint): Promise<`0x${string}`> {
  const account = privateKeyToAccount(cfg.fulfillerPrivateKey);
  const wallet = createWalletClient({ chain: xLayer, account, transport: http(cfg.rpcUrl) });
  const hash = await wallet.writeContract({
    address: cfg.providerAddress,
    abi: PythiaAIProviderAbi,
    functionName: "refundRequest",
    args: [requestId],
  });
  return hash;
}
```

- [ ] **Step 2: Commit**

```bash
git add fulfiller/src/submit.ts
git commit -m "feat(fulfiller): submit fulfillReasoning + refundRequest via viem walletClient"
```

---

## Phase 6 — Orchestration: wire it all together

### Task 6.1: Main loop in `src/index.ts`

**Files:**
- Modify: `fulfiller/src/index.ts`

- [ ] **Step 1: Implement orchestration**

```typescript
import { loadConfig } from "./config";
import { logger } from "./logger";
import { openDb, recordRequest, listPending, markFulfilled, markRefunded, getRequest } from "./persist";
import { startWatcher, type RequestMadeEvent } from "./watcher";
import { runWithTools } from "./runner";
import { pinTrail } from "./pin";
import { submitFulfillReasoning, submitRefund } from "./submit";
import { keccak256, toBytes, sha256, type Hex } from "viem";

const cfg = loadConfig();
const db = openDb("./pythia-fulfiller.sqlite");

async function processRequest(ev: RequestMadeEvent) {
  // Idempotency: if already in DB and not pending, skip.
  const existing = getRequest(db, ev.requestId);
  if (existing && existing.status !== "pending") {
    logger.info({ requestId: ev.requestId, status: existing.status }, "skip non-pending");
    return;
  }
  if (!existing) {
    recordRequest(db, ev.requestId, ev.consumer, ev.modelId, ev.numOfChoices,
                  keccak256(toBytes(ev.prompt)), Date.now());
  }

  try {
    const run = await runWithTools(cfg, ev.modelId, ev.prompt, ev.numOfChoices);

    const trail = {
      version: "1",
      chainId: 196,
      providerAddress: cfg.providerAddress,
      requestId: ev.requestId.toString(),
      consumer: ev.consumer,
      modelId: ev.modelId,
      modelName: run.modelUsed,
      promptKeccak: keccak256(toBytes(ev.prompt)),
      promptSha256: sha256(toBytes(ev.prompt)),
      fulfilledAt: new Date().toISOString(),
      steps: run.steps,
      pins: [] as string[],
    };

    const { cid, pins } = await pinTrail(cfg, trail);
    trail.pins = pins;

    const txHash = await submitFulfillReasoning(cfg, ev.requestId, run.choice, cid);
    markFulfilled(db, ev.requestId, run.choice, cid, txHash);
    logger.info({ requestId: ev.requestId, choice: run.choice, cid, txHash }, "fulfilled");
  } catch (err) {
    logger.error({ err, requestId: ev.requestId }, "processing failed, refunding");
    try {
      const refundTx = await submitRefund(cfg, ev.requestId);
      markRefunded(db, ev.requestId, refundTx);
    } catch (refundErr) {
      logger.error({ refundErr, requestId: ev.requestId }, "refund also failed — manual intervention");
    }
  }
}

// On startup, replay any locally-pending requests against on-chain state.
async function replayPending() {
  for (const row of listPending(db)) {
    logger.info({ requestId: row.requestId }, "replay pending request");
    await processRequest({
      requestId: row.requestId, consumer: row.consumer as `0x${string}`,
      modelId: row.modelId, numOfChoices: row.numOfChoices, prompt: "",
    });
  }
}

(async function main() {
  logger.info("Pythia fulfiller starting");
  await replayPending();
  startWatcher(cfg, processRequest);
  // Heartbeat ping every 60s
  if (cfg.heartbeatUrl) {
    setInterval(() => fetch(cfg.heartbeatUrl!).catch(() => {}), 60_000);
  }
})();
```

- [ ] **Step 2: Smoke test against a local anvil fork**

```bash
# Terminal 1: fork X Layer
anvil --fork-url https://rpc.xlayer.tech --port 8545

# Terminal 2: deploy stub provider locally (via Foundry script from Plan 4)
# then run fulfiller pointing at local anvil
XLAYER_RPC_URL=http://localhost:8545 npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add fulfiller/src/index.ts
git commit -m "feat(fulfiller): orchestrate event → run → pin → submit with refund fallback"
```

---

## Phase 7 — Integration smoke

### Task 7.1: End-to-end against local anvil fork

- [ ] **Step 1: Document the smoke procedure in `fulfiller/README.md`**

(Step-by-step: deploy contracts on local fork via Foundry script, make a `reason()` call from a mock consumer, watch fulfiller pick it up, confirm `fulfillReasoning` lands on-chain.)

- [ ] **Step 2: Commit**

```bash
git add fulfiller/README.md
git commit -m "docs(fulfiller): local anvil smoke procedure"
```

---

## Self-Review Checklist

**1. Spec coverage**

- §4.3 fulfiller architecture (watcher / runner / tools / pin / submit / persist / monitor) — covered ✓
- §4.4 IPFS trail format — populated in `processRequest` ✓
- §4.5 tools at launch (ave_token, onchain_read) — both implemented ✓
- §4.6 trust model — single-EOA FULFILLER documented; backup EOA env var present ✓
- Refund-on-failure path — wired in `processRequest` catch block ✓

**2. Placeholder scan**

- `callOnchainRead` returns "TODO" — needs full viem readContract implementation. Marking as gap.
- Anthropic SDK mock test in Phase 3 Task 3.1 is sketched, not complete.

**3. Type consistency**

- `requestId: bigint` used everywhere ✓
- `cid: string` returned by `pinTrail`, consumed by `submitFulfillReasoning` ✓
- `choice: number` (0/1/2) clamped to numOfChoices range ✓

---

## Execution Handoff

Same as Plan 1 — subagent-driven (recommended) or inline execution. The fulfiller plan benefits from subagent execution because each phase (persist / watcher / runner / pin / submit) is independently testable.
