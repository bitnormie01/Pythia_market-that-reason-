"use client";

import { formatEther } from "viem";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { PythiaAIProviderAbi } from "@/lib/abi/PythiaAIProvider";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { ADDRESSES } from "@/lib/contracts";

const OKX_SWAP_URL = "https://www.okx.com/web3/dex-swap?inputChain=196&inputCurrency=0x779ded0c9e1022225f8e0630b35a9b54be713736&outputChain=196&outputCurrency=OKB";

export default function ResolveButton({ marketId, modelId }: { marketId: bigint; modelId: number }) {
  const { address } = useAccount();
  const balance = useBalance({ address });

  const modelQuery = useReadContract({
    address: ADDRESSES.provider,
    abi: PythiaAIProviderAbi,
    functionName: "getModel",
    args: [BigInt(modelId)]
  });

  const { writeContract, isPending } = useWriteContract();
  const model = modelQuery.data as { name: string; price: bigint; enabled: boolean } | undefined;
  const price = model?.price;
  const balanceValue = balance.data?.value ?? 0n;
  const hasEnoughOkb = !!price && balanceValue >= price;

  function onResolve() {
    if (!address) {
      toast.error("Connect wallet");
      return;
    }
    if (!price) {
      toast.error("Model price not loaded yet");
      return;
    }
    writeContract(
      {
        address: ADDRESSES.hook,
        abi: PythiaHookAbi,
        functionName: "requestResolution",
        args: [marketId],
        value: price
      },
      {
        onSuccess: () => toast.success("Resolution requested. AI is reasoning…"),
        onError: (err) => toast.error(err.message.slice(0, 240))
      }
    );
  }

  return (
    <div className="border border-amber-700 rounded p-4 bg-amber-950/30 space-y-3">
      <p className="text-sm">
        This market has expired. Pay the AI fee to trigger resolution.{" "}
        <span className="text-zinc-500">(Anyone can poke — fees are reimbursed if the AI returns INVALID.)</span>
      </p>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-mono text-amber-400">
          {price ? `${formatEther(price)} OKB` : "Loading fee…"}
        </span>
        <span className="text-zinc-500 text-xs">
          your balance: {balance.data ? formatEther(balanceValue) : "—"} OKB
        </span>
      </div>
      {hasEnoughOkb ? (
        <button
          onClick={onResolve}
          disabled={isPending}
          className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded font-semibold disabled:opacity-50"
        >
          {isPending ? "Confirming…" : "Resolve"}
        </button>
      ) : (
        <div className="space-y-2">
          <a
            href={OKX_SWAP_URL}
            target="_blank"
            rel="noreferrer"
            className="block text-center bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded font-semibold"
          >
            1) Get OKB on OKX DEX ↗
          </a>
          <button
            onClick={onResolve}
            disabled
            className="w-full border border-zinc-700 text-zinc-500 px-4 py-2 rounded font-semibold"
          >
            2) Resolve (after you have OKB)
          </button>
          <p className="text-xs text-zinc-500">
            Universal Router path: <code className="text-zinc-300">USDT → WOKB (V3 0.3%)</code> → unwrap WOKB →
            send native OKB. Build this combined route on-deploy; for now use the OKX swap widget.
          </p>
        </div>
      )}
    </div>
  );
}
