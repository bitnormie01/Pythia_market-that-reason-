"use client";

import { formatEther } from "viem";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { Icon, Tag } from "@/components/ui";
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
        onSuccess: () => toast.success("Resolution requested. AI is reasoning..."),
        onError: (err) => toast.error(err.message.slice(0, 240))
      }
    );
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">Resolution request</span>
        <Tag variant="warn"><Icon name="lock" size={11} /> expired</Tag>
      </div>
      <div className="panel__body col gap-3">
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>
          Anyone can pay the model fee to request AI resolution. If the off-chain worker fails, the provider refund path resets the market.
        </p>
        <div className="panel" style={{ background: "var(--surface-2)" }}>
          <div className="three-col">
            <div className="stat">
              <div className="stat__label">Model</div>
              <div className="stat__value" style={{ fontSize: 13 }}>{model?.name ?? `#${modelId}`}</div>
              <div className="stat__sub">registry id #{modelId}</div>
            </div>
            <div className="stat">
              <div className="stat__label">Fee</div>
              <div className="stat__value">{price ? formatEther(price) : "—"}</div>
              <div className="stat__sub">OKB</div>
            </div>
            <div className="stat">
              <div className="stat__label">Your balance</div>
              <div className="stat__value">{balance.data ? Number(formatEther(balanceValue)).toFixed(4) : "—"}</div>
              <div className="stat__sub">OKB</div>
            </div>
          </div>
        </div>

        {hasEnoughOkb ? (
          <button onClick={onResolve} disabled={isPending} className="btn btn--primary btn--full btn--lg">
            {isPending ? "Confirming..." : "Request AI resolution"}
          </button>
        ) : (
          <div className="col gap-2">
            <a href={OKX_SWAP_URL} target="_blank" rel="noreferrer" className="btn btn--primary btn--full">
              <Icon name="external" size={13} /> Get OKB on OKX DEX
            </a>
            <button onClick={onResolve} disabled className="btn btn--full">
              Resolve after wallet has OKB
            </button>
            <p className="field__hint">
              Current MVP uses the OKX swap widget for USDT → OKB. In-app Universal Router unwrap flow is deferred.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
