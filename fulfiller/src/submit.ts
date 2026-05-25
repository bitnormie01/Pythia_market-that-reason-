import { createPublicClient, createWalletClient, defineChain, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PythiaAIProviderAbi } from "../abi/PythiaAIProvider";
import type { Config } from "./config";
import { logger } from "./logger";

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } }
});

type WalletLike = { writeContract: (args: any) => Promise<`0x${string}`> };
type PubLike = { waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{ status: string }> };

export type SubmitDeps = {
  wallet?: WalletLike;
  pub?: PubLike;
};

function buildClients(cfg: Config) {
  const account = privateKeyToAccount(cfg.fulfillerPrivateKey);
  const transport = cfg.rpcBackup ? fallback([http(cfg.rpcUrl), http(cfg.rpcBackup)]) : http(cfg.rpcUrl);
  const wallet = createWalletClient({ chain: xLayer, account, transport });
  const pub = createPublicClient({ chain: xLayer, transport });
  return { wallet, pub };
}

export async function submitFulfillReasoning(
  cfg: Config,
  requestId: bigint,
  choice: number,
  cid: string,
  deps: SubmitDeps = {}
): Promise<`0x${string}`> {
  const { wallet, pub } = deps.wallet && deps.pub ? (deps as { wallet: WalletLike; pub: PubLike }) : buildClients(cfg);

  const hash = await wallet.writeContract({
    address: cfg.providerAddress,
    abi: PythiaAIProviderAbi,
    functionName: "fulfillReasoning",
    args: [requestId, choice, cid],
    chain: xLayer
  });
  logger.info({ requestId: requestId.toString(), choice, cid, hash }, "fulfillReasoning tx submitted");

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`fulfillReasoning tx reverted: ${hash}`);
  }
  logger.info({ requestId: requestId.toString(), hash }, "fulfillReasoning tx confirmed");
  return hash;
}

export async function submitRefund(
  cfg: Config,
  requestId: bigint,
  deps: SubmitDeps = {}
): Promise<`0x${string}`> {
  const { wallet, pub } = deps.wallet && deps.pub ? (deps as { wallet: WalletLike; pub: PubLike }) : buildClients(cfg);

  const hash = await wallet.writeContract({
    address: cfg.providerAddress,
    abi: PythiaAIProviderAbi,
    functionName: "refundRequest",
    args: [requestId],
    chain: xLayer
  });
  logger.info({ requestId: requestId.toString(), hash }, "refundRequest tx submitted");

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`refundRequest tx reverted: ${hash}`);
  }
  logger.info({ requestId: requestId.toString(), hash }, "refundRequest tx confirmed");
  return hash;
}
