import { z } from "zod";

const ConfigSchema = z.object({
  XLAYER_RPC_URL: z.string().url(),
  XLAYER_RPC_BACKUP: z.string().url().optional(),
  PYTHIA_AI_PROVIDER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  PYTHIA_HOOK_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  FULFILLER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  FULFILLER_BACKUP_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  AVE_AI_API_KEY: z.string().optional(),
  AVE_AI_BASE_URL: z.string().url().default("https://api.ave.ai"),
  PINATA_JWT: z.string().min(1),
  BETTERSTACK_HEARTBEAT_URL: z.string().url().optional()
});

export type Config = {
  rpcUrl: string;
  rpcBackup?: string;
  providerAddress: `0x${string}`;
  hookAddress: `0x${string}`;
  fulfillerPrivateKey: `0x${string}`;
  fulfillerBackupPrivateKey?: `0x${string}`;
  anthropicApiKey: string;
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
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    aveApiKey: parsed.AVE_AI_API_KEY,
    aveBaseUrl: parsed.AVE_AI_BASE_URL,
    pinataJwt: parsed.PINATA_JWT,
    heartbeatUrl: parsed.BETTERSTACK_HEARTBEAT_URL
  };
}
