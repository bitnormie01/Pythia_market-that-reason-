import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "../src/config";
import { getRequest, openDb } from "../src/persist";
import { processRequest, type ProcessorDeps } from "../src/processor";
import { MODEL_NAMES, SUPPORTED_MODEL_ID } from "../src/runner";
import { submitFulfillReasoning, submitRefund, xLayer } from "../src/submit";
import { startWatcher } from "../src/watcher";

const ANVIL_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const REQUEST_ID = 1n;
const REQUEST_STATUS_FULFILLED = 2;

type ProviderArtifact = {
  abi: unknown[];
  bytecode: { object: `0x${string}` };
};

function readProviderArtifact(): ProviderArtifact {
  const artifactPath = resolve(process.cwd(), "../contracts/out/PythiaAIProvider.sol/PythiaAIProvider.json");
  return JSON.parse(readFileSync(artifactPath, "utf8")) as ProviderArtifact;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when SMOKE_LIVE=1`);
  return value;
}

async function waitUntil<T>(fn: () => Promise<T | undefined> | T | undefined, timeoutMs = 20_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value !== undefined) return value;
    await new Promise((resolve_) => setTimeout(resolve_, 250));
  }
  throw new Error("timed out waiting for local smoke fulfillment");
}

async function main(): Promise<void> {
  const rpcUrl = process.env.SMOKE_RPC_URL ?? "http://127.0.0.1:8545";
  const live = process.env.SMOKE_LIVE === "1";
  const privateKey = (process.env.SMOKE_PRIVATE_KEY ?? ANVIL_KEY_0) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== xLayer.id) {
    throw new Error(`local smoke requires chain id ${xLayer.id}; restart anvil with --chain-id ${xLayer.id}`);
  }

  const walletClient = createWalletClient({ account, chain: xLayer, transport: http(rpcUrl) });
  const providerArtifact = readProviderArtifact();

  console.log(`Deploying PythiaAIProvider to ${rpcUrl} from ${account.address}`);
  const deployHash = await walletClient.deployContract({
    abi: providerArtifact.abi,
    bytecode: providerArtifact.bytecode.object,
    args: [account.address, account.address, account.address]
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const providerAddress = deployReceipt.contractAddress;
  if (!providerAddress) throw new Error("provider deploy receipt missing contractAddress");
  console.log(`Provider deployed: ${providerAddress}`);

  const dbPath = resolve(process.cwd(), ".tmp/local-smoke.sqlite");
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);

  const cfg: Config = {
    rpcUrl,
    providerAddress,
    hookAddress: ZERO_ADDRESS,
    fulfillerPrivateKey: privateKey,
    anthropicApiKey: live ? requireEnv("ANTHROPIC_API_KEY") : "local-smoke",
    aveBaseUrl: process.env.AVE_AI_BASE_URL ?? "https://api.ave.ai",
    pinataJwt: live ? requireEnv("PINATA_JWT") : "local-smoke"
  };

  const mockDeps: ProcessorDeps = {
    runWithTools: async (_cfg, modelId, prompt, numOfChoices) => {
      if (modelId !== SUPPORTED_MODEL_ID) throw new Error(`unexpected modelId ${modelId}`);
      if (numOfChoices !== 3) throw new Error(`unexpected numOfChoices ${numOfChoices}`);
      return {
        choice: 0,
        modelUsed: MODEL_NAMES[SUPPORTED_MODEL_ID],
        steps: [
          { type: "thought", text: `local smoke prompt length=${prompt.length}` },
          { type: "final_choice", choice: 0, label: "YES", rationale: "local smoke deterministic choice" }
        ]
      };
    },
    pinTrail: async () => ({
      cid: "bafylocalsmoke",
      pins: ["https://gateway.pinata.cloud/ipfs/bafylocalsmoke"]
    }),
    submitFulfillReasoning,
    submitRefund
  };

  const unwatch = startWatcher(cfg, async (ev) => {
    await processRequest(cfg, db, ev, live ? undefined : mockDeps);
  });

  try {
    const prompt =
      "Resolve this local smoke request. Respond with exactly one digit: 0=YES, 1=NO, 2=INVALID.";
    console.log("Submitting provider.reason request");
    const reasonHash = await walletClient.writeContract({
      address: providerAddress,
      abi: providerArtifact.abi,
      functionName: "reason",
      args: [BigInt(SUPPORTED_MODEL_ID), prompt, 3],
      value: parseEther("0.01"),
      chain: xLayer
    });
    await publicClient.waitForTransactionReceipt({ hash: reasonHash });

    const row = await waitUntil(() => {
      const found = getRequest(db, REQUEST_ID);
      return found?.status === "fulfilled" ? found : undefined;
    });

    const onchain = await publicClient.readContract({
      address: providerAddress,
      abi: providerArtifact.abi,
      functionName: "getRequest",
      args: [REQUEST_ID]
    });

    const status = Array.isArray(onchain) ? Number(onchain[6]) : Number((onchain as { status: number }).status);
    if (status !== REQUEST_STATUS_FULFILLED) {
      throw new Error(`expected on-chain status FULFILLED=${REQUEST_STATUS_FULFILLED}, got ${status}`);
    }

    console.log(`Local smoke passed: request ${REQUEST_ID} fulfilled with cid=${row.cid} tx=${row.txHash}`);
  } finally {
    unwatch();
    db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
