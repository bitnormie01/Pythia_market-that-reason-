"use client";

import { useMemo, useState } from "react";
import { erc20Abi, keccak256, maxUint256, parseUnits, toBytes } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { toast } from "sonner";

import { Icon, Tag } from "@/components/ui";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { ADDRESSES, USDT_DECIMALS } from "@/lib/contracts";

const TOOL_NAMES = ["ave_token_tool", "onchain_read_tool"] as const;
const TOOL_HASH_BY_NAME = {
  ave_token_tool: keccak256(toBytes("ave_token_tool")),
  onchain_read_tool: keccak256(toBytes("onchain_read_tool"))
} as const;
const QUESTION_FORBIDDEN = /[<>[\]{}]/;
const SUPPORTED_MODEL_ID = 0;

export default function CreateMarketForm() {
  const { address } = useAccount();
  const [step, setStep] = useState<1 | 2>(1);
  const [question, setQuestion] = useState("");
  const [expiry, setExpiry] = useState("");
  const [modelId, setModelId] = useState(0);
  const [initialLp, setInitialLp] = useState("5");
  const [tools, setTools] = useState<Record<(typeof TOOL_NAMES)[number], boolean>>({
    ave_token_tool: true,
    onchain_read_tool: true
  });
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

  const selectedTools = useMemo(() => TOOL_NAMES.filter((name) => tools[name]), [tools]);
  const toolHashes = selectedTools.map((name) => TOOL_HASH_BY_NAME[name]);
  const hasForbidden = QUESTION_FORBIDDEN.test(question);
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

  function validate(): number | null {
    if (!address) {
      toast.error("Connect wallet");
      return null;
    }
    if (!question.trim()) {
      toast.error("Question required");
      return null;
    }
    if (question.length > 280) {
      toast.error("Question max 280 chars");
      return null;
    }
    if (hasForbidden) {
      toast.error("Question contains forbidden characters (< > [ ] { })");
      return null;
    }
    if (!expiry) {
      toast.error("Expiry required");
      return null;
    }
    const expiryTs = Math.floor(new Date(expiry).getTime() / 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    if (expiryTs <= nowSec + 3600) {
      toast.error("Expiry must be at least 1 hour from now");
      return null;
    }
    if (initialUsdt === 0n) {
      toast.error("Initial USDT liquidity required");
      return null;
    }
    if (modelId !== SUPPORTED_MODEL_ID) {
      toast.error("Only model #0 is enabled for cheap DGrid mode");
      return null;
    }
    if (toolHashes.length === 0) {
      toast.error("Select at least one resolver tool");
      return null;
    }
    return expiryTs;
  }

  function continueToReview(e: React.FormEvent) {
    e.preventDefault();
    if (validate() !== null) setStep(2);
  }

  function submitMarket() {
    const expiryTs = validate();
    if (expiryTs === null) return;
    writeContract(
      {
        address: ADDRESSES.hook,
        abi: PythiaHookAbi,
        functionName: "createMarket",
        args: [question, BigInt(expiryTs), toolHashes as unknown as `0x${string}`[], modelId, initialUsdt]
      },
      {
        onSuccess: () => toast.success("Market submitted"),
        onError: (err) => toast.error(err.message.slice(0, 240))
      }
    );
  }

  if (step === 2) {
    return (
      <div className="col gap-4">
        <div className="row between gap-3">
          <div className="col gap-1">
            <Tag variant="info">Step 2 of 2 · Review</Tag>
            <h2 className="page-title">Review market</h2>
          </div>
          <button className="btn" onClick={() => setStep(1)}><Icon name="arrowLeft" size={13} /> Edit</button>
        </div>

        <section className="panel">
          <div className="panel__body col gap-3">
            <div>
              <div className="field__label">Question</div>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.4 }}>{question}</p>
            </div>
            <div className="two-col">
              <Summary label="Expiry" value={new Date(expiry).toLocaleString()} />
              <Summary label="Model" value="#0 · DGrid Gemini 2.5 Flash Lite" />
              <Summary label="Tools" value={selectedTools.join(", ")} />
              <Summary label="Initial liquidity" value={`${Number(initialUsdt) / 10 ** USDT_DECIMALS} USDT`} />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="three-col">
            <div className="stat">
              <div className="stat__label">Initial liquidity</div>
              <div className="stat__value">{(Number(initialUsdt) / 10 ** USDT_DECIMALS).toFixed(2)}</div>
              <div className="stat__sub">USDT</div>
            </div>
            <div className="stat">
              <div className="stat__label">Creator bond</div>
              <div className="stat__value">{(Number(bondValue) / 10 ** USDT_DECIMALS).toFixed(2)}</div>
              <div className="stat__sub">returned on YES/NO</div>
            </div>
            <div className="stat">
              <div className="stat__label">Total approval</div>
              <div className="stat__value">{(Number(totalUsdtNeeded) / 10 ** USDT_DECIMALS).toFixed(2)}</div>
              <div className="stat__sub">USDT</div>
            </div>
          </div>
        </section>

        {needsApproval && (
          <button type="button" onClick={approveUsdt} disabled={isConfirming} className="btn btn--full">
            {isConfirming ? "Confirming..." : "1) Approve USDT"}
          </button>
        )}
        <button type="button" onClick={submitMarket} disabled={isConfirming || !address || needsApproval} className="btn btn--primary btn--full btn--lg">
          {isConfirming ? "Deploying market..." : "Create market"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={continueToReview} className="col gap-4">
      <div className="row between gap-3">
        <div className="col gap-1">
          <Tag variant="info">Step 1 of 2 · Compose</Tag>
          <h2 className="page-title">Create market</h2>
        </div>
      </div>

      <section className="panel">
        <div className="panel__body col gap-4">
          <div className="field">
            <div className="row between gap-2">
              <label className="field__label" style={{ margin: 0 }}>Question</label>
              <span className="font-mono" style={{ fontSize: 11, color: hasForbidden ? "var(--no)" : question.length > 240 ? "var(--warn)" : "var(--text-tertiary)" }}>
                {question.length} / 280
              </span>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="Will OKB close above $50 on the OKX spot daily candle for 2026-12-31?"
              className="textarea"
            />
            <div className="field__hint">
              {hasForbidden ? "Characters < > [ ] { } are blocked." : "Write a single, verifiable outcome. Vague questions risk INVALID."}
            </div>
          </div>

          <div className="two-col">
            <div className="field">
              <label className="field__label">Expiry (local time)</label>
              <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="input font-mono" />
              <div className="field__hint">Must be at least 1 hour from now.</div>
            </div>
            <div className="field">
              <label className="field__label">Resolution model</label>
              <select value={modelId} onChange={(e) => setModelId(parseInt(e.target.value, 10))} className="select">
                <option value={0}>#0 · DGrid Gemini 2.5 Flash Lite</option>
              </select>
              <div className="field__hint">Fee: 0.005 OKB per request.</div>
            </div>
          </div>

          <div className="field">
            <label className="field__label">Whitelisted tools</label>
            <div className="col gap-2">
              {TOOL_NAMES.map((name) => (
                <label key={name} className="banner" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={tools[name]} onChange={(e) => setTools({ ...tools, [name]: e.target.checked })} />
                  <span>
                    <span className="font-mono">{name}</span>
                    <span className="field__hint" style={{ display: "block", marginTop: 2 }}>
                      {name === "ave_token_tool" ? "Token and market data for resolver evidence." : "Public EVM reads for resolver evidence."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label">Initial liquidity (USDT)</label>
            <input type="number" min="5" step="0.01" value={initialLp} onChange={(e) => setInitialLp(e.target.value)} className="input font-mono" />
            <div className="row gap-1" style={{ marginTop: 6 }}>
              {["5", "10", "50", "100"].map((v) => (
                <button key={v} type="button" className="btn btn--sm" style={{ flex: 1 }} onClick={() => setInitialLp(v)}>{v}</button>
              ))}
            </div>
            <div className="field__hint">Seeds the v4 pool 50/50 YES/NO at creation. Contract minimum is 5 USDT.</div>
          </div>
        </div>
      </section>

      <div className="banner banner--info">
        <Icon name="lock" size={14} />
        Total required is initial liquidity plus the 5 USDT creator bond. The bond returns on YES/NO and burns on INVALID.
      </div>

      <button type="submit" className="btn btn--primary btn--lg" disabled={!address}>
        Continue to review <Icon name="arrow" size={14} />
      </button>
    </form>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="field__label">{label}</div>
      <div style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
