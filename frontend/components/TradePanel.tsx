"use client";

import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { Spinner } from "@/components/ui";
import { OutcomeTokenAbi } from "@/lib/abi/OutcomeToken";
import { PythiaPeripheryAbi } from "@/lib/abi/PythiaPeriphery";
import { ADDRESSES, USDT_DECIMALS } from "@/lib/contracts";
import { statusLabel } from "@/lib/format";

type Side = "YES" | "NO";
type Mode = "BUY" | "SELL";

const SLIPPAGE_BPS = 5000n;

export default function TradePanel({
  marketId,
  yesToken,
  noToken,
  status,
  yesProb = null
}: {
  marketId: bigint;
  yesToken: `0x${string}`;
  noToken: `0x${string}`;
  status: number;
  yesProb?: number | null;
}) {
  const { address } = useAccount();
  const [side, setSide] = useState<Side>("YES");
  const [mode, setMode] = useState<Mode>("BUY");
  const [amount, setAmount] = useState("10");
  const [action, setAction] = useState<"idle" | "approving" | "trading">("idle");

  const usdtAllowance = useReadContract({
    address: ADDRESSES.usdt,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.periphery] : undefined,
    query: { enabled: !!address && mode === "BUY" }
  });

  const outcomeToken = side === "YES" ? yesToken : noToken;
  const outcomeAllowance = useReadContract({
    address: outcomeToken,
    abi: OutcomeTokenAbi,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.periphery] : undefined,
    query: { enabled: !!address && mode === "SELL" }
  });

  const outcomeBalance = useReadContract({
    address: outcomeToken,
    abi: OutcomeTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const { writeContract, isPending, data: pendingHash } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash });

  // Allowance/balance reads are cached and never refetch on their own after a tx mines,
  // which made the panel keep showing "Approve" forever. Refetch the relevant data the
  // instant a tx mines. The ref dedupes so a stale receipt (e.g. the approval receipt
  // still lingering for one render after the user clicks Buy) can't fire the wrong branch.
  const processedTx = useRef<`0x${string}` | undefined>(undefined);
  useEffect(() => {
    if (!receipt.isSuccess || !pendingHash || processedTx.current === pendingHash) return;
    processedTx.current = pendingHash;
    if (action === "approving") {
      if (mode === "BUY") void usdtAllowance.refetch();
      else void outcomeAllowance.refetch();
    } else if (action === "trading") {
      void outcomeBalance.refetch();
      setAction("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess, pendingHash]);

  function notify(label: string) {
    toast.success(`${label} submitted`);
  }

  function notifyError(err: unknown) {
    setAction("idle");
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(msg.slice(0, 240));
  }

  function approveUsdt() {
    if (!address) return;
    setAction("approving");
    writeContract(
      {
        address: ADDRESSES.usdt,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDRESSES.periphery, maxUint256]
      },
      {
        onSuccess: () => notify("USDT approval"),
        onError: notifyError
      }
    );
  }

  function approveOutcome() {
    if (!address) return;
    setAction("approving");
    writeContract(
      {
        address: outcomeToken,
        abi: OutcomeTokenAbi,
        functionName: "approve",
        args: [ADDRESSES.periphery, maxUint256]
      },
      {
        onSuccess: () => notify(`${side} approval`),
        onError: notifyError
      }
    );
  }

  function onBuy() {
    if (!address) {
      toast.error("Connect wallet");
      return;
    }
    let usdtIn: bigint;
    try {
      usdtIn = parseUnits(amount, USDT_DECIMALS);
    } catch {
      toast.error("Invalid amount");
      return;
    }
    if (usdtIn === 0n) {
      toast.error("Amount must be > 0");
      return;
    }
    const minOut = (usdtIn * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    setAction("trading");
    writeContract(
      {
        address: ADDRESSES.periphery,
        abi: PythiaPeripheryAbi,
        functionName: side === "YES" ? "buyYes" : "buyNo",
        args: [marketId, usdtIn, minOut]
      },
      {
        onSuccess: () => notify(`Buy ${side}`),
        onError: notifyError
      }
    );
  }

  function onSell() {
    if (!address) {
      toast.error("Connect wallet");
      return;
    }
    let outcomeIn: bigint;
    try {
      outcomeIn = parseUnits(amount, 18);
    } catch {
      toast.error("Invalid amount");
      return;
    }
    if (outcomeIn === 0n) {
      toast.error("Amount must be > 0");
      return;
    }
    setAction("trading");
    writeContract(
      {
        address: ADDRESSES.periphery,
        abi: PythiaPeripheryAbi,
        functionName: side === "YES" ? "sellYes" : "sellNo",
        args: [marketId, outcomeIn, 0n]
      },
      {
        onSuccess: () => notify(`Sell ${side}`),
        onError: notifyError
      }
    );
  }

  const needsUsdtApproval =
    mode === "BUY" &&
    !!address &&
    (() => {
      try {
        const need = parseUnits(amount || "0", USDT_DECIMALS);
        const have = (usdtAllowance.data as bigint | undefined) ?? 0n;
        return need > have;
      } catch {
        return false;
      }
    })();

  const needsOutcomeApproval =
    mode === "SELL" &&
    !!address &&
    (() => {
      try {
        const need = parseUnits(amount || "0", 18);
        const have = (outcomeAllowance.data as bigint | undefined) ?? 0n;
        return need > have;
      } catch {
        return false;
      }
    })();

  const needsApproval = mode === "BUY" ? needsUsdtApproval : needsOutcomeApproval;
  const approvalFetching = mode === "BUY" ? usdtAllowance.isFetching : outcomeAllowance.isFetching;
  const txConfirming = isPending || receipt.isLoading;
  // "approving" stays true through tx mining, the allowance refetch, and the brief window
  // where the receipt landed but the fresh allowance hasn't propagated yet.
  const approving =
    action === "approving" &&
    (txConfirming || approvalFetching || (receipt.isSuccess && needsApproval));
  const trading = action === "trading" && txConfirming;
  const busy = approving || trading;

  // Live price of the selected side and a pre-impact estimate of shares received. This is
  // what explains "1 USDT → 1.8 shares": a share priced at $0.55 means 1 USDT buys ~1.8 of
  // them, and each redeems for 1 USDT only if that side wins.
  const sidePrice = yesProb === null ? null : side === "YES" ? yesProb : 1 - yesProb;
  const amountNum = Number(amount);
  const estTokens =
    mode === "BUY" && sidePrice !== null && sidePrice > 0 && Number.isFinite(amountNum) && amountNum > 0
      ? amountNum / sidePrice
      : null;
  const heldBalance = outcomeBalance.data as bigint | undefined;

  if (status !== 0) {
    return (
      <section className="panel">
        <div className="panel__head"><span className="panel__title">Trade</span></div>
        <div className="panel__body">
          <div className="banner">Trading closed. Current status: {statusLabel(status)}.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">Trade outcome tokens</span>
        <span className="tag tag--info">MVP slippage 50%</span>
      </div>
      <div className="panel__body col gap-3">
        <div className="segmented" style={{ width: "100%" }}>
          <button className="segmented__btn" data-active={mode === "BUY"} onClick={() => setMode("BUY")}>Buy</button>
          <button className="segmented__btn" data-active={mode === "SELL"} onClick={() => setMode("SELL")}>Sell</button>
        </div>

        <div className="row gap-2">
          <button className={`btn btn--full ${side === "YES" ? "btn--yes" : ""}`} onClick={() => setSide("YES")}>YES</button>
          <button className={`btn btn--full ${side === "NO" ? "btn--no" : ""}`} onClick={() => setSide("NO")}>NO</button>
        </div>

        {yesProb !== null && (
          <div className="row between gap-2" style={{ fontSize: 12 }}>
            <span className="muted">Pool odds</span>
            <span className="font-mono">{`YES $${yesProb.toFixed(2)} · NO $${(1 - yesProb).toFixed(2)}`}</span>
          </div>
        )}

        <div className="field">
          <label className="field__label">
            <span>{mode === "BUY" ? "Spend (USDT)" : `Sell ${side} (units)`}</span>
          </label>
          <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {heldBalance !== undefined && (
            <div className="field__hint">You hold {Number(formatUnits(heldBalance, 18)).toFixed(3)} {side}</div>
          )}
          {estTokens !== null && (
            <div className="field__hint">≈ {estTokens.toFixed(3)} {side} before price impact · each {side} pays 1 USDT if it wins</div>
          )}
        </div>

        {approving && (
          <div className="banner banner--info">
            <Spinner size={14} />
            <span>
              {txConfirming
                ? "Approving — confirm in your wallet, then waiting for the transaction…"
                : "Approval confirmed — checking allowance…"}
            </span>
          </div>
        )}

        {needsApproval ? (
          <button
            onClick={mode === "BUY" ? approveUsdt : approveOutcome}
            disabled={busy}
            className="btn btn--primary btn--full btn--lg"
          >
            {approving ? (
              <><Spinner size={14} /> Approving {mode === "BUY" ? "USDT" : side}…</>
            ) : (
              `1) Approve ${mode === "BUY" ? "USDT" : side}`
            )}
          </button>
        ) : (
          <button
            onClick={mode === "BUY" ? onBuy : onSell}
            disabled={busy || !address}
            className="btn btn--primary btn--full btn--lg"
          >
            {trading ? (
              <><Spinner size={14} /> {mode === "BUY" ? "Buying" : "Selling"} {side}…</>
            ) : (
              `${mode === "BUY" ? "Buy" : "Sell"} ${side}`
            )}
          </button>
        )}

        <p className="field__hint">
          Buy mints a YES+NO pair (1 USDT) and swaps the unwanted leg through the v4 pool — so 1 USDT buys
          more than one share whenever a side trades below $1, and each winning share redeems for 1 USDT.
          Sell does the reverse via PythiaPeriphery. MVP slippage 50%.
        </p>
      </div>
    </section>
  );
}
