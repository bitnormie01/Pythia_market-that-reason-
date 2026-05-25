import { loadConfig } from "./config";
import { logger } from "./logger";
import { openDb } from "./persist";
import { processRequest, replayPending } from "./processor";
import { startWatcher } from "./watcher";

const HEARTBEAT_INTERVAL_MS = 60_000;
const DB_PATH = process.env.PYTHIA_DB_PATH ?? "./pythia-fulfiller.sqlite";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const db = openDb(DB_PATH);

  logger.info(
    {
      providerAddress: cfg.providerAddress,
      hookAddress: cfg.hookAddress,
      rpcUrl: cfg.rpcUrl,
      rpcBackup: cfg.rpcBackup,
      dbPath: DB_PATH
    },
    "Pythia fulfiller starting"
  );

  await replayPending(cfg, db);

  const unwatch = startWatcher(cfg, async (ev) => {
    await processRequest(cfg, db, ev);
  });
  logger.info("event watcher started");

  let heartbeatTimer: NodeJS.Timeout | undefined;
  if (cfg.heartbeatUrl) {
    const ping = async () => {
      try {
        await fetch(cfg.heartbeatUrl!);
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, "heartbeat ping failed");
      }
    };
    heartbeatTimer = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    void ping();
    logger.info({ heartbeatUrl: cfg.heartbeatUrl }, "heartbeat enabled");
  }

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutdown requested");
    try {
      unwatch();
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "unwatch threw");
    }
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try {
      db.close();
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "db close threw");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err: err instanceof Error ? err.message : String(err) }, "fatal error in main");
  process.exit(1);
});
