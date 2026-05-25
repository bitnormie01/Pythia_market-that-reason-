"use client";

import { useState } from "react";
import { erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import { toast } from "sonner";

import { OutcomeTokenAbi } from "@/lib/abi/OutcomeToken";
import { PythiaPeripheryAbi } from "@/lib/abi/PythiaPeriphery";
import { ADDRESSES, USDT_DECIMALS } from "@/lib/contracts";
import { statusLabel } from "@/lib/format";

type Side = "YES" | "NO";
type Mode = "BUY" | "SELL";

const SLIPPAGE_BPS = 5000n; // 50% — generous MVP slippage, tighten once Quoter wired

export default function TradePanel({
  marketId,
  yesToken,
  noToken,
  status,
  statusLabel: labelFromParent
}: {
  marketId: bigint;
  yesToken: `0x${string}`;
  noToken: `0x${string}`;
  status: number;
  statusLabel?: string;
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

  if (status !== 0) {
    return (
      <div className="border border-zinc-800 rounded p-4 text-zinc-500 text-sm">
        Trading closed (status: {labelFromParent ?? statusLabel(status)}).
      </div>
    );
  }

  function notify(action: string) {
    toast.success(`${action} submitted`);
  }

  function notifyError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(msg.slice(0, 240));
  }

  async function approveUsdt() {
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

  async function approveOutcome() {
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

  async function onBuy() {
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

  async function onSell() {
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

  return (
    <div className="border border-zinc-800 rounded p-4 space-y-4">
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setMode("BUY")}
          className={`flex-1 py-1.5 rounded ${mode === "BUY" ? "bg-zinc-800 text-zinc-100" : "bg-zinc-900 text-zinc-500"}`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode("SELL")}
          className={`flex-1 py-1.5 rounded ${mode === "SELL" ? "bg-zinc-800 text-zinc-100" : "bg-zinc-900 text-zinc-500"}`}
        >
          Sell
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSide("YES")}
          className={`flex-1 py-2 rounded font-semibold ${side === "YES" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-900 text-zinc-400"}`}
        >
          YES
        </button>
        <button
          onClick={() => setSide("NO")}
          className={`flex-1 py-2 rounded font-semibold ${side === "NO" ? "bg-rose-500 text-zinc-950" : "bg-zinc-900 text-zinc-400"}`}
        >
          NO
        </button>
      </div>

      <div>
        <label className="text-xs text-zinc-500 flex items-center justify-between">
          <span>{mode === "BUY" ? "Spend (USDT)" : `Sell ${side} (units)`}</span>
          {mode === "SELL" && outcomeBalance.data !== undefined && (
            <span>
              bal: {formatUnits((outcomeBalance.data as bigint) ?? 0n, 18)}
            </span>
          )}
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-zinc-900 rounded px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {mode === "BUY" && needsUsdtApproval && (
        <button
          onClick={approveUsdt}
          disabled={isConfirming}
          className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 py-2 rounded font-semibold disabled:opacity-50"
        >
          {isConfirming ? "Confirming…" : "1) Approve USDT"}
        </button>
      )}

      {mode === "SELL" && needsOutcomeApproval && (
        <button
          onClick={approveOutcome}
          disabled={isConfirming}
          className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 py-2 rounded font-semibold disabled:opacity-50"
        >
          {isConfirming ? "Confirming…" : `1) Approve ${side}`}
        </button>
      )}

      <button
        onClick={mode === "BUY" ? onBuy : onSell}
        disabled={isConfirming || !address || (mode === "BUY" ? needsUsdtApproval : needsOutcomeApproval)}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-2 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConfirming ? "Confirming…" : `${mode === "BUY" ? "Buy" : "Sell"} ${side}`}
      </button>

      <div className="text-xs text-zinc-500 space-y-1">
        <p>Slippage tolerance: 50% (MVP). Tighten once Quoter is wired.</p>
        {mode === "SELL" && (
          <p className="text-amber-400/80">
            Note: selling in a skewed pool may return USDT plus a leftover outcome-token balance. Track your{" "}
            {side} balance after the trade.
          </p>
        )}
      </div>
    </div>
  );
}
