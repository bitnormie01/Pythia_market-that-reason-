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

export function startWatcher(cfg: Config, handler: (event: RequestMadeEvent) => Promise<void>): () => void {
  const transport = cfg.rpcBackup ? fallback([http(cfg.rpcUrl), http(cfg.rpcBackup)]) : http(cfg.rpcUrl);
  const client = createPublicClient({ transport });

  return client.watchContractEvent({
    address: cfg.providerAddress,
    abi: PythiaAIProviderAbi,
    eventName: "FlapAIProviderRequestMade",
    onLogs: async (logs) => {
      for (const log of logs) {
        try {
          await onRequestMade(log as RequestMadeLog, handler);
        } catch (err) {
          logger.error({ err, log }, "request handler failed");
        }
      }
    },
    onError: (err) => logger.error({ err }, "watcher error")
  });
}
