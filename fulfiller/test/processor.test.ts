import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";
import { openDb, getRequest, recordRequest, listPending } from "../src/persist";
import { processRequest, replayPending, type ProcessorDeps } from "../src/processor";
import type { RequestMadeEvent } from "../src/watcher";

const cfg: Config = {
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

const sampleEvent: RequestMadeEvent = {
  requestId: 42n,
  consumer: "0x00000000000000000000000000000000000000c0",
  modelId: 0,
  numOfChoices: 3,
  prompt: "Will OKB > $50?"
};

let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(":memory:");
});

function deps(overrides: Partial<ProcessorDeps> = {}): ProcessorDeps {
  return {
    runWithTools: vi.fn(async () => ({
      choice: 1,
      steps: [{ type: "final_choice", choice: 1, label: "NO", rationale: "stub" }],
      modelUsed: "google/gemini-2.0-flash-lite-001"
    })),
    pinTrail: vi.fn(async () => ({ cid: "bafyCID", pins: ["https://gw/bafyCID"] })),
    submitFulfillReasoning: vi.fn(async () => "0xTXFUL" as `0x${string}`),
    submitRefund: vi.fn(async () => "0xTXREF" as `0x${string}`),
    ...overrides
  };
}

describe("processRequest", () => {
  it("happy path: records, runs, pins, submits, and marks fulfilled", async () => {
    const d = deps();
    await processRequest(cfg, db, sampleEvent, d);

    const row = getRequest(db, sampleEvent.requestId);
    expect(row?.status).toBe("fulfilled");
    expect(row?.choice).toBe(1);
    expect(row?.cid).toBe("bafyCID");
    expect(row?.txHash).toBe("0xTXFUL");

    expect(d.runWithTools).toHaveBeenCalledOnce();
    expect(d.pinTrail).toHaveBeenCalledOnce();
    expect(d.submitFulfillReasoning).toHaveBeenCalledWith(cfg, 42n, 1, "bafyCID");
    expect(d.submitRefund).not.toHaveBeenCalled();
  });

  it("skips already-fulfilled requests (idempotency)", async () => {
    recordRequest(db, sampleEvent.requestId, sampleEvent.consumer, sampleEvent.modelId, sampleEvent.numOfChoices, "h", Date.now());
    db.prepare("UPDATE requests SET status='fulfilled' WHERE request_id=?").run(sampleEvent.requestId.toString());

    const d = deps();
    await processRequest(cfg, db, sampleEvent, d);
    expect(d.runWithTools).not.toHaveBeenCalled();
    expect(d.submitFulfillReasoning).not.toHaveBeenCalled();
  });

  it("on pipeline failure: submits a refund and marks refunded", async () => {
    const d = deps({
      runWithTools: vi.fn(async () => {
        throw new Error("LLM exploded");
      })
    });

    await processRequest(cfg, db, sampleEvent, d);

    expect(d.submitRefund).toHaveBeenCalledWith(cfg, 42n);
    const row = getRequest(db, sampleEvent.requestId);
    expect(row?.status).toBe("refunded");
    expect(row?.txHash).toBe("0xTXREF");
  });

  it("on pipeline failure AND refund failure: marks failed and does not throw", async () => {
    const d = deps({
      pinTrail: vi.fn(async () => {
        throw new Error("ipfs down");
      }),
      submitRefund: vi.fn(async () => {
        throw new Error("refund tx reverted");
      })
    });

    await expect(processRequest(cfg, db, sampleEvent, d)).resolves.toBeUndefined();
    const row = getRequest(db, sampleEvent.requestId);
    expect(row?.status).toBe("failed");
  });

  it("re-records on replay: row stays pending until fulfilled", async () => {
    recordRequest(db, sampleEvent.requestId, sampleEvent.consumer, sampleEvent.modelId, sampleEvent.numOfChoices, "h", Date.now());
    expect(listPending(db).length).toBe(1);

    const d = deps();
    await processRequest(cfg, db, sampleEvent, d);

    expect(listPending(db).length).toBe(0);
    expect(getRequest(db, sampleEvent.requestId)?.status).toBe("fulfilled");
  });
});

describe("replayPending", () => {
  it("re-runs the pipeline for pending rows that still have their prompt", async () => {
    recordRequest(
      db,
      sampleEvent.requestId,
      sampleEvent.consumer,
      sampleEvent.modelId,
      sampleEvent.numOfChoices,
      "h",
      Date.now(),
      sampleEvent.prompt
    );
    const d = deps();
    await replayPending(cfg, db, d);
    expect(d.runWithTools).toHaveBeenCalledOnce();
    expect(getRequest(db, sampleEvent.requestId)?.status).toBe("fulfilled");
  });

  it("refunds legacy pending rows that lack a stored prompt", async () => {
    recordRequest(
      db,
      sampleEvent.requestId,
      sampleEvent.consumer,
      sampleEvent.modelId,
      sampleEvent.numOfChoices,
      "h",
      Date.now()
      // prompt omitted → null
    );
    const d = deps();
    await replayPending(cfg, db, d);
    expect(d.runWithTools).not.toHaveBeenCalled();
    expect(d.submitRefund).toHaveBeenCalledOnce();
    expect(getRequest(db, sampleEvent.requestId)?.status).toBe("refunded");
  });

  it("no-ops when there are no pending rows", async () => {
    const d = deps();
    await replayPending(cfg, db, d);
    expect(d.runWithTools).not.toHaveBeenCalled();
    expect(d.submitRefund).not.toHaveBeenCalled();
  });
});
