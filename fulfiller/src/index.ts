import { loadConfig } from "./config";
import { logger } from "./logger";

const cfg = loadConfig();
logger.info({ providerAddress: cfg.providerAddress, hookAddress: cfg.hookAddress }, "pythia fulfiller configured");
