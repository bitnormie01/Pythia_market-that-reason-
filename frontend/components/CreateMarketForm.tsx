"use client";

import { useState } from "react";
import { erc20Abi, keccak256, maxUint256, parseUnits, toBytes } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from "wagmi";
import { toast } from "sonner";

import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { ADDRESSES, USDT_DECIMALS } from "@/lib/contracts";

const TOOL_HASHES = [keccak256(toBytes("ave_token_tool")), keccak256(toBytes("onchain_read_tool"))] as const;
const QUESTION_FORBIDDEN = /[<>[\]{}]/; // basic prompt-injection guard, matches on-chain Hook check

export default function CreateMarketForm() {
  const { address } = useAccount();
  const [question, setQuestion] = useState("");
  const [expiry, setExpiry] = useState("");
  const [modelId, setModelId] = useState(1);
  const [initialLp, setInitialLp] = useState("10");
  const { writeContract, isPending, data: pendingHash } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash });

  const creatorBond = useReadContract({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    functionName: "CREATOR_BOND"
  });

  const usdtAllowance = useReadContract({
    address: ADDRESSES.usdt,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, ADDRESSES.hook] : undefined,
    query: { enabled: !!address }
  });

  const initialUsdt = (() => {
    try {
      return parseUnits(initialLp || "0", USDT_DECIMALS);
    } catch {
      return 0n;
    }
  })();
  const bondValue = (creatorBond.data as bigint | undefined) ?? 0n;
  const totalUsdtNeeded = initialUsdt + bondValue;
  const allowanceValue = (usdtAllowance.data as bigint | undefined) ?? 0n;
  const needsApproval = !!address && totalUsdtNeeded > allowanceValue;
  const isConfirming = isPending || receipt.isLoading;

  function approveUsdt() {
    writeContract(
      {
        address: ADDRESSES.usdt,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDRESSES.hook, maxUint256]
      },
      {
        onSuccess: () => toast.success("USDT approval submitted"),
        onError: (err) => toast.error(err.message.slice(0, 240))
      }
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) {
      toast.error("Connect wallet");
      return;
    }
    if (!question.trim()) {
      toast.error("Question required");
      return;
    }
    if (question.length > 280) {
      toast.error("Question max 280 chars");
      return;
    }
    if (QUESTION_FORBIDDEN.test(question)) {
      toast.error("Question contains forbidden characters (< > [ ] { })");
      return;
    }
    if (!expiry) {
      toast.error("Expiry required");
      return;
    }
    const expiryTs = Math.floor(new Date(expiry).getTime() / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiryTs <= nowSec + 3600) {
      toast.error("Expiry must be at least 1 hour from now");
      return;
    }
    if (initialUsdt === 0n) {
      toast.error("Initial USDT liquidity required");
      return;
    }
    writeContract(
      {
        address: ADDRESSES.hook,
        abi: PythiaHookAbi,
        functionName: "createMarket",
        args: [question, BigInt(expiryTs), TOOL_HASHES as unknown as `0x${string}`[], modelId, initialUsdt]
      },
      {
        onSuccess: () => toast.success("Market submitted!"),
        onError: (err) => toast.error(err.message.slice(0, 240))
      }
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div>
        <label className="text-sm text-zinc-400">Question (≤280 chars)</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Will OKB close above $50 by 2026-12-31 23:59 UTC?"
          className="w-full bg-zinc-900 rounded p-3 mt-1 outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-xs text-zinc-500 mt-1">
          {question.length} / 280 — characters {"< > [ ] { }"} are blocked (prompt-injection guard).
        </p>
      </div>
      <div>
        <label className="text-sm text-zinc-400">Expiry (local time)</label>
        <input
          type="datetime-local"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="w-full bg-zinc-900 rounded p-3 mt-1 outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="text-sm text-zinc-400">Model</label>
        <select
          value={modelId}
          onChange={(e) => setModelId(parseInt(e.target.value, 10))}
          className="w-full bg-zinc-900 rounded p-3 mt-1"
        >
          <option value={1}>Claude Sonnet 4.6 (model #1)</option>
          <option value={2}>Claude Haiku 4.5 (model #2)</option>
        </select>
      </div>
      <div>
        <label className="text-sm text-zinc-400">Initial USDT liquidity</label>
        <input
          type="number"
          min="1"
          step="0.01"
          value={initialLp}
          onChange={(e) => setInitialLp(e.target.value)}
          className="w-full bg-zinc-900 rounded p-3 mt-1"
        />
      </div>
      <p className="text-xs text-zinc-500">
        Total USDT to spend: <span className="font-mono text-zinc-300">
          {(Number(totalUsdtNeeded) / 10 ** USDT_DECIMALS).toFixed(2)}
        </span>{" "}
        ={" "}
        <span className="font-mono">
          {Number(initialUsdt) / 10 ** USDT_DECIMALS}
        </span>{" "}
        liquidity + <span className="font-mono">{Number(bondValue) / 10 ** USDT_DECIMALS}</span> creator bond
        (returned on YES/NO; burned on INVALID).
      </p>
      {needsApproval && (
        <button
          type="button"
          onClick={approveUsdt}
          disabled={isConfirming}
          className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 py-2 rounded font-semibold disabled:opacity-50"
        >
          {isConfirming ? "Confirming…" : "1) Approve USDT"}
        </button>
      )}
      <button
        type="submit"
        disabled={isConfirming || !address || needsApproval}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-3 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConfirming ? "Deploying market…" : "Create market"}
      </button>
    </form>
  );
}
