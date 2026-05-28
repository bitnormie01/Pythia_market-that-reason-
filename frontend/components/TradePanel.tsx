"use client";

import { useState } from "react";
import { erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { toast } from "sonner";

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
  status
}: {
  marketId: bigint;
  yesToken: `0x${string}`;
  noToken: `0x${string}`;
  status: number;
}) {
  const { address } = useAccount();
  const [side, setSide] = useState<Side>("YES");
  const [mode, setMode] = useState<Mode>("BUY");
  const [amount, setAmount] = useState("10");

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
    query: { enabled: !!address && mode === "SELL" }
  });

  const { writeContract, isPending, data: pendingHash } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash });

  function notify(action: string) {
    toast.success(`${action} submitted`);
  }

  function notifyError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(msg.slice(0, 240));
  }

  function approveUsdt() {
    if (!address) return;
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

  const isConfirming = isPending || receipt.isLoading;

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

        <div className="field">
          <label className="field__label">
            <span>{mode === "BUY" ? "Spend (USDT)" : `Sell ${side} (units)`}</span>
          </label>
          <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {mode === "SELL" && outcomeBalance.data !== undefined && (
            <div className="field__hint">Balance: {formatUnits((outcomeBalance.data as bigint) ?? 0n, 18)} {side}</div>
          )}
        </div>

        {mode === "BUY" && needsUsdtApproval && (
          <button onClick={approveUsdt} disabled={isConfirming} className="btn btn--full">
            {isConfirming ? "Confirming..." : "1) Approve USDT"}
          </button>
        )}

        {mode === "SELL" && needsOutcomeApproval && (
          <button onClick={approveOutcome} disabled={isConfirming} className="btn btn--full">
            {isConfirming ? "Confirming..." : `1) Approve ${side}`}
          </button>
        )}

        <button
          onClick={mode === "BUY" ? onBuy : onSell}
          disabled={isConfirming || !address || (mode === "BUY" ? needsUsdtApproval : needsOutcomeApproval)}
          className="btn btn--primary btn--full btn--lg"
        >
          {isConfirming ? "Confirming..." : `${mode === "BUY" ? "Buy" : "Sell"} ${side}`}
        </button>

        <p className="field__hint">
          Uses PythiaPeriphery for atomic mint/swap or swap/burn. Quoter-based slippage is deferred.
        </p>
      </div>
    </section>
  );
}
