import { createPublicClient, fallback, http } from "viem";
import { PythiaAIProviderAbi } from "../abi/PythiaAIProvider";
import type { Config } from "./config";
import { logger } from "./logger";

export type RequestMadeEvent = {
  requestId: bigint;
  consumer: `0x${string}`;
  modelId: number;
  numOfChoices: number;
  prompt: string;
};

type RequestMadeLog = {
  args: {
    requestId?: bigint;
    consumer?: `0x${string}`;
    modelId?: bigint | number;
    prompt?: string;
    numOfChoices?: bigint | number;
  };
};

export async function onRequestMade(
  log: RequestMadeLog,
  handler: (event: RequestMadeEvent) => void | Promise<void>
): Promise<void> {
  if (
    log.args.requestId === undefined ||
    log.args.consumer === undefined ||
    log.args.modelId === undefined ||
    log.args.prompt === undefined ||
    log.args.numOfChoices === undefined
  ) {
    throw new Error("FlapAIProviderRequestMade log is missing args");
  }

  await handler({
    requestId: log.args.requestId,
    consumer: log.args.consumer,
    modelId: Number(log.args.modelId),
    numOfChoices: Number(log.args.numOfChoices),
    prompt: log.args.prompt
  });
}

const POLL_INTERVAL_MS = 5000;
const BLOCK_BATCH_LIMIT = 1000n;

export function startWatcher(cfg: Config, handler: (event: RequestMadeEvent) => Promise<void>): () => void {
  const transport = cfg.rpcBackup ? fallback([http(cfg.rpcUrl), http(cfg.rpcBackup)]) : http(cfg.rpcUrl);
  const client = createPublicClient({ transport });

  let lastScannedBlock: bigint | null = null;
  let stopped = false;
  let inFlight = false;

  async function poll(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const tipBlock = await client.getBlockNumber();

      if (lastScannedBlock === null) {
        // First poll: bootstrap from current tip minus 1 to catch any
        // event at exactly the current block.
        lastScannedBlock = tipBlock > 0n ? tipBlock - 1n : 0n;
        logger.info({ tipBlock: tipBlock.toString() }, "watcher bootstrap");
      }

      if (tipBlock <= lastScannedBlock) return;

      const fromBlock = lastScannedBlock + 1n;
      const toBlock =
        tipBlock - lastScannedBlock > BLOCK_BATCH_LIMIT
          ? lastScannedBlock + BLOCK_BATCH_LIMIT
          : tipBlock;

      const logs = await client.getContractEvents({
        address: cfg.providerAddress,
        abi: PythiaAIProviderAbi,
        eventName: "FlapAIProviderRequestMade",
        fromBlock,
        toBlock
      });

      for (const log of logs) {
        try {
          await onRequestMade(log as unknown as RequestMadeLog, handler);
        } catch (err) {
          logger.error({ err, log }, "request handler failed");
        }
      }

      lastScannedBlock = toBlock;
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "watcher poll failed"
      );
    } finally {
      inFlight = false;
    }
  }

  // Run an initial poll immediately, then on a 5s interval.
  void poll();
  const handle = setInterval(() => void poll(), POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
