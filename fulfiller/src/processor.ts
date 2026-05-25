import { keccak256, sha256, toBytes } from "viem";
import type { Config } from "./config";
import { logger } from "./logger";
import {
  getRequest,
  listPending,
  markFailed,
  markFulfilled,
  markRefunded,
  recordRequest,
  type PythiaDb
} from "./persist";
import { pinTrail as defaultPinTrail } from "./pin";
import { runWithTools as defaultRunWithTools, type RunResult } from "./runner";
import {
  submitFulfillReasoning as defaultSubmitFulfillReasoning,
  submitRefund as defaultSubmitRefund
} from "./submit";
import type { RequestMadeEvent } from "./watcher";

export type ProcessorDeps = {
  runWithTools: (cfg: Config, modelId: number, prompt: string, numOfChoices: number) => Promise<RunResult>;
  pinTrail: (cfg: Config, trail: unknown) => Promise<{ cid: string; pins: string[] }>;
  submitFulfillReasoning: (cfg: Config, requestId: bigint, choice: number, cid: string) => Promise<`0x${string}`>;
  submitRefund: (cfg: Config, requestId: bigint) => Promise<`0x${string}`>;
};

const defaultDeps: ProcessorDeps = {
  runWithTools: defaultRunWithTools,
  pinTrail: defaultPinTrail,
  submitFulfillReasoning: defaultSubmitFulfillReasoning,
  submitRefund: defaultSubmitRefund
};

export async function processRequest(
  cfg: Config,
  db: PythiaDb,
  ev: RequestMadeEvent,
  deps: ProcessorDeps = defaultDeps
): Promise<void> {
  const existing = getRequest(db, ev.requestId);
  if (existing && existing.status !== "pending") {
    logger.info({ requestId: ev.requestId.toString(), status: existing.status }, "skip non-pending request");
    return;
  }
  if (!existing) {
    const promptHash = keccak256(toBytes(ev.prompt));
    recordRequest(db, ev.requestId, ev.consumer, ev.modelId, ev.numOfChoices, promptHash, Date.now(), ev.prompt);
  }

  try {
    const run = await deps.runWithTools(cfg, ev.modelId, ev.prompt, ev.numOfChoices);

    const trail = {
      version: "1",
      chainId: 196,
      providerAddress: cfg.providerAddress,
      requestId: ev.requestId.toString(),
      consumer: ev.consumer,
      modelId: ev.modelId,
      modelName: run.modelUsed,
      numOfChoices: ev.numOfChoices,
      promptKeccak: keccak256(toBytes(ev.prompt)),
      promptSha256: sha256(toBytes(ev.prompt)),
      fulfilledAt: new Date().toISOString(),
      steps: run.steps,
      pins: [] as string[]
    };

    const { cid, pins } = await deps.pinTrail(cfg, trail);
    trail.pins = pins;

    const txHash = await deps.submitFulfillReasoning(cfg, ev.requestId, run.choice, cid);
    markFulfilled(db, ev.requestId, run.choice, cid, txHash);
    logger.info(
      { requestId: ev.requestId.toString(), choice: run.choice, cid, txHash, pins },
      "request fulfilled"
    );
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), requestId: ev.requestId.toString() },
      "pipeline failed; attempting refund"
    );
    try {
      const refundTx = await deps.submitRefund(cfg, ev.requestId);
      markRefunded(db, ev.requestId, refundTx);
      logger.info({ requestId: ev.requestId.toString(), refundTx }, "refunded after pipeline failure");
    } catch (refundErr) {
      logger.error(
        {
          refundErr: refundErr instanceof Error ? refundErr.message : String(refundErr),
          requestId: ev.requestId.toString()
        },
        "refund also failed — manual intervention required"
      );
      markFailed(db, ev.requestId);
    }
  }
}

export async function replayPending(
  cfg: Config,
  db: PythiaDb,
  deps: ProcessorDeps = defaultDeps
): Promise<void> {
  const rows = listPending(db);
  if (rows.length === 0) return;
  logger.info({ count: rows.length }, "replaying pending requests on startup");
  for (const row of rows) {
    if (!row.prompt) {
      // Legacy rows from earlier runs that did not persist the prompt text. Refund and move on.
      logger.warn({ requestId: row.requestId.toString() }, "replay: row lacks prompt; refunding");
      try {
        const refundTx = await deps.submitRefund(cfg, row.requestId);
        markRefunded(db, row.requestId, refundTx);
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err), requestId: row.requestId.toString() },
          "replay refund failed"
        );
        markFailed(db, row.requestId);
      }
      continue;
    }
    await processRequest(
      cfg,
      db,
      {
        requestId: row.requestId,
        consumer: row.consumer as `0x${string}`,
        modelId: row.modelId,
        numOfChoices: row.numOfChoices,
        prompt: row.prompt
      },
      deps
    );
  }
}
