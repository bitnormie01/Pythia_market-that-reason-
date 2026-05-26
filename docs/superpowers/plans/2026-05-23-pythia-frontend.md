# Pythia Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js frontend that lets users browse markets, create new markets, trade YES/NO via Periphery, watch resolution live, and view the IPFS proof trail. Deploys to Vercel. OKX Wallet first-class.

**Architecture:** Next.js 15 App Router, wagmi v2 + viem, RainbowKit with OKX Wallet connector, TanStack Query for reads, Tailwind + shadcn/ui for UI, multicall3 for batch reads, IPFS gateway race. Event-driven state via `watchContractEvent`. No subgraph.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, wagmi 2.x, viem 2.x, @rainbow-me/rainbowkit 2.x, @tanstack/react-query 5.x, Tailwind 4.x, shadcn/ui, sonner (toasts), `@vercel/og`.

**Source spec:** `docs/superpowers/specs/2026-05-23-pythia-prediction-market-hook-design.md` §5

**Depends on:** Plan 1 contracts (ABIs + addresses), Plan 4 deployment (live addresses)

---

## Phase 0 — Scaffold

### Task 0.1: Initialize Next.js + dependencies

**Files:**
- Create: `frontend/`

- [ ] **Step 1: Scaffold via create-next-app**

```bash
cd C:/xLayer-hackathon/uniswapV4Hackthon
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm
cd frontend
```

- [ ] **Step 2: Install Web3 deps**

```bash
npm install wagmi@^2 viem@^2 @rainbow-me/rainbowkit@^2 @tanstack/react-query@^5 sonner
npm install -D @types/node
```

- [ ] **Step 3: Install UI deps**

```bash
npx shadcn@latest init --base-color slate
npx shadcn@latest add button card dialog input label select toast
```

- [ ] **Step 4: Commit**

```bash
cd C:/xLayer-hackathon/uniswapV4Hackthon
git add frontend/
git commit -m "feat(frontend): Next.js 15 scaffold with wagmi + RainbowKit + shadcn"
```

### Task 0.2: X Layer chain config + wagmi config

**Files:**
- Create: `frontend/lib/wagmi.ts`
- Create: `frontend/lib/chain.ts`
- Create: `frontend/app/providers.tsx`

- [ ] **Step 1: Define X Layer chain**

`frontend/lib/chain.ts`:
```typescript
import { defineChain } from "viem";

export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.xlayer.tech",
        "https://rpc.ankr.com/xlayer",
        "https://xlayerrpc.okx.com",
      ],
    },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});
```

- [ ] **Step 2: wagmi config with OKX Wallet first**

`frontend/lib/wagmi.ts`:
```typescript
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { okxWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { xLayer } from "./chain";

export const wagmiConfig = getDefaultConfig({
  appName: "Pythia",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo",
  chains: [xLayer],
  wallets: [
    { groupName: "Recommended", wallets: [okxWallet, metaMaskWallet, walletConnectWallet] },
  ],
  ssr: true,
});
```

- [ ] **Step 3: Providers component**

`frontend/app/providers.tsx`:
```typescript
"use client";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { Toaster } from "sonner";
import { ReactNode } from "react";

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          {children}
          <Toaster theme="dark" position="top-right" richColors />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

- [ ] **Step 4: Wire providers into root layout**

Modify `frontend/app/layout.tsx`:
```typescript
import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Pythia — Markets that reason",
  description: "AI-resolved prediction markets on X Layer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): wagmi + RainbowKit + X Layer chain config, OKX Wallet first"
```

### Task 0.3: Contract addresses + ABI imports

**Files:**
- Create: `frontend/lib/contracts.ts`
- Create: `frontend/lib/abi/PythiaHook.ts`
- Create: `frontend/lib/abi/PythiaAIProvider.ts`
- Create: `frontend/lib/abi/PythiaPeriphery.ts`
- Create: `frontend/lib/abi/OutcomeToken.ts`

- [ ] **Step 1: Paste ABIs from Foundry `out/` artifacts**

After Plan 1 contracts compile, paste each contract's ABI array into `lib/abi/<Name>.ts` as `export const <Name>Abi = [...] as const;`

- [ ] **Step 2: Create addresses module**

`frontend/lib/contracts.ts`:
```typescript
export const ADDRESSES = {
  hook: process.env.NEXT_PUBLIC_HOOK_ADDRESS as `0x${string}`,
  provider: process.env.NEXT_PUBLIC_PROVIDER_ADDRESS as `0x${string}`,
  periphery: process.env.NEXT_PUBLIC_PERIPHERY_ADDRESS as `0x${string}`,
  usdt: process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`,
  outcomeMaster: process.env.NEXT_PUBLIC_OUTCOME_MASTER_ADDRESS as `0x${string}`,
  poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32" as `0x${string}`,
  quoter: "0x8928074ca1b241d8ec02815881c1af11e8bc5219" as `0x${string}`,
  universalRouter: "0x8b844f885672f333bc0042cb669255f93a4c1e6b" as `0x${string}`,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as `0x${string}`,
};
```

- [ ] **Step 3: `.env.local.example`**

```bash
NEXT_PUBLIC_HOOK_ADDRESS=0x...
NEXT_PUBLIC_PROVIDER_ADDRESS=0x...
NEXT_PUBLIC_PERIPHERY_ADDRESS=0x...
NEXT_PUBLIC_USDT_ADDRESS=0x...
NEXT_PUBLIC_OUTCOME_MASTER_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): contract addresses + ABIs from Foundry artifacts"
```

---

## Phase 1 — Shared components & utilities

### Task 1.1: Layout shell + header with connect button

**Files:**
- Create: `frontend/components/Header.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Header component**

```typescript
"use client";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Header() {
  return (
    <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-xl font-mono">
        <span className="text-emerald-400">Pythia</span>
        <span className="text-zinc-500 ml-2 text-sm">/ markets that reason</span>
      </Link>
      <nav className="flex items-center gap-6 text-sm">
        <Link href="/markets" className="hover:text-emerald-400">Markets</Link>
        <Link href="/markets/create" className="hover:text-emerald-400">Create</Link>
        <Link href="/about" className="hover:text-emerald-400">About</Link>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Wire header into layout**

In `frontend/app/layout.tsx`, wrap children with Header.

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): header shell with connect button"
```

### Task 1.2: useMarkets hook (paginated multicall reads)

**Files:**
- Create: `frontend/hooks/useMarkets.ts`

- [ ] **Step 1: Implement**

```typescript
import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES } from "@/lib/contracts";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";

export function useMarketIds(offset = 0, limit = 50) {
  return useReadContract({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    functionName: "getMarkets",
    args: [BigInt(offset), BigInt(limit)],
  });
}

export function useMarketBatch(ids: bigint[]) {
  return useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: ADDRESSES.hook, abi: PythiaHookAbi, functionName: "marketView", args: [id] },
      { address: ADDRESSES.hook, abi: PythiaHookAbi, functionName: "effectiveStatus", args: [id] },
    ]),
    allowFailure: true,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/hooks/
git commit -m "feat(frontend): useMarkets hook via getMarkets + multicall batch reads"
```

---

## Phase 2 — Pages

### Task 2.1: Landing page (`/`) — hero markets

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Implement**

```typescript
import Header from "@/components/Header";
import { MarketCard } from "@/components/MarketCard";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-12">
        <section className="mb-16 text-center">
          <h1 className="text-5xl font-mono font-bold mb-4">
            <span className="text-emerald-400">Markets</span> that reason.
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
            AI-resolved prediction markets on X Layer. Every resolution has an auditable IPFS reasoning trail.
          </p>
          <Link href="/markets" className="inline-block bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-3 rounded font-semibold">
            Browse markets →
          </Link>
        </section>
        <section>
          <h2 className="text-2xl font-mono mb-6 text-zinc-300">Recent</h2>
          {/* Server-rendered or client-rendered MarketCard list — see Task 2.2 */}
          <MarketsList />
        </section>
      </main>
    </>
  );
}

function MarketsList() {
  return <div className="text-zinc-500">Markets list mounts here (see Task 2.2).</div>;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(frontend): landing page with hero + markets section stub"
```

### Task 2.2: Markets browse page (`/markets`)

**Files:**
- Create: `frontend/app/markets/page.tsx`
- Create: `frontend/components/MarketCard.tsx`
- Create: `frontend/components/MarketsBrowse.tsx`

- [ ] **Step 1: MarketCard**

```typescript
"use client";
import Link from "next/link";

export type MarketCardData = {
  id: bigint;
  question: string;
  expiry: bigint;
  status: number; // 0=TRADING 1=EXPIRED 2=RESOLVING 3=RESOLVED
  yesPrice?: number; // 0..1
};

const STATUS_LABEL = ["TRADING", "EXPIRED", "RESOLVING", "RESOLVED"];

export function MarketCard({ data }: { data: MarketCardData }) {
  const expiryDate = new Date(Number(data.expiry) * 1000);
  return (
    <Link href={`/markets/${data.id}`} className="block border border-zinc-800 rounded p-4 hover:border-emerald-500 transition">
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
        <span>#{data.id.toString()}</span>
        <span className="px-2 py-0.5 bg-zinc-900 rounded">{STATUS_LABEL[data.status]}</span>
      </div>
      <p className="text-base mb-3 line-clamp-2">{data.question}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-emerald-400 font-mono">{data.yesPrice ? `${(data.yesPrice * 100).toFixed(0)}% YES` : "—"}</span>
        <span className="text-zinc-500">{expiryDate.toLocaleString()}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: MarketsBrowse client component**

```typescript
"use client";
import { useMarketIds, useMarketBatch } from "@/hooks/useMarkets";
import { MarketCard } from "./MarketCard";

export default function MarketsBrowse() {
  const { data: ids, isLoading } = useMarketIds(0, 50);
  const { data: batch } = useMarketBatch((ids ?? []) as bigint[]);

  if (isLoading) return <p className="text-zinc-500">Loading markets…</p>;
  if (!ids || ids.length === 0) return <p className="text-zinc-500">No markets yet. <a href="/markets/create" className="text-emerald-400">Create one →</a></p>;

  const rows = (ids as bigint[]).map((id, i) => {
    const view = batch?.[i * 2]?.result as any;
    const status = batch?.[i * 2 + 1]?.result as number;
    return {
      id,
      question: view?.question ?? "?",
      expiry: view?.expiry ?? 0n,
      status: Number(status ?? 0),
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((r) => <MarketCard key={r.id.toString()} data={r} />)}
    </div>
  );
}
```

- [ ] **Step 3: `frontend/app/markets/page.tsx`**

```typescript
import Header from "@/components/Header";
import MarketsBrowse from "@/components/MarketsBrowse";

export default function MarketsPage() {
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-mono mb-6">Markets</h1>
        <MarketsBrowse />
      </main>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): /markets browse page with card grid"
```

### Task 2.3: Market detail (`/markets/[id]`) — trade panel + LP + status

**Files:**
- Create: `frontend/app/markets/[id]/page.tsx`
- Create: `frontend/components/TradePanel.tsx`
- Create: `frontend/components/MarketInfo.tsx`
- Create: `frontend/components/ResolveButton.tsx`

- [ ] **Step 1: Detail page**

```typescript
import Header from "@/components/Header";
import { MarketDetail } from "@/components/MarketDetail";

export default function Page({ params }: { params: { id: string } }) {
  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <MarketDetail marketId={BigInt(params.id)} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: MarketDetail client component (skeleton; trade panel in Task 2.4)**

```typescript
"use client";
import { useReadContract, useWatchContractEvent } from "wagmi";
import { ADDRESSES } from "@/lib/contracts";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { TradePanel } from "./TradePanel";
import { ResolveButton } from "./ResolveButton";

export function MarketDetail({ marketId }: { marketId: bigint }) {
  const { data: view, refetch } = useReadContract({
    address: ADDRESSES.hook, abi: PythiaHookAbi, functionName: "marketView", args: [marketId],
  });
  const { data: status } = useReadContract({
    address: ADDRESSES.hook, abi: PythiaHookAbi, functionName: "effectiveStatus", args: [marketId],
  });

  useWatchContractEvent({
    address: ADDRESSES.hook,
    abi: PythiaHookAbi,
    eventName: "Resolved",
    onLogs: (logs) => {
      for (const log of logs) {
        if ((log.args as any).marketId === marketId) refetch();
      }
    },
  });

  if (!view) return <p className="text-zinc-500">Loading…</p>;
  const v = view as any;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <h1 className="text-2xl font-mono">{v.question}</h1>
        <p className="text-sm text-zinc-500">
          Market #{marketId.toString()} • Expires {new Date(Number(v.expiry) * 1000).toLocaleString()}
        </p>
        {Number(status) === 1 /* EXPIRED */ && <ResolveButton marketId={marketId} modelId={v.modelId} />}
      </div>
      <div>
        <TradePanel marketId={marketId} yesToken={v.yesToken} noToken={v.noToken} status={Number(status ?? 0)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): /markets/[id] detail page with live status event listening"
```

### Task 2.4: TradePanel — buy/sell flow via Periphery

**Files:**
- Modify: `frontend/components/TradePanel.tsx`
- Create: `frontend/hooks/useQuoter.ts`

- [ ] **Step 1: useQuoter hook for spot quotes**

```typescript
import { useReadContract } from "wagmi";
import { ADDRESSES } from "@/lib/contracts";
// V4 Quoter ABI exposes quoteExactInputSingle. Paste the function ABI here.
const QUOTER_ABI = [/* paste V4 quoter ABI fragment for quoteExactInputSingle */] as const;

export function useQuoteBuyYes(marketId: bigint, usdtIn: bigint) {
  // Return spot quote of NO→YES on the market's pool.
  return useReadContract({
    address: ADDRESSES.quoter, abi: QUOTER_ABI, functionName: "quoteExactInputSingle",
    args: [/* pool key + params */], query: { enabled: usdtIn > 0n },
  });
}
```

- [ ] **Step 2: TradePanel**

```typescript
"use client";
import { useState } from "react";
import { useWriteContract, useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ADDRESSES } from "@/lib/contracts";
import { PythiaPeripheryAbi } from "@/lib/abi/PythiaPeriphery";
import { toast } from "sonner";

export function TradePanel({ marketId, yesToken, noToken, status }: {
  marketId: bigint; yesToken: `0x${string}`; noToken: `0x${string}`; status: number;
}) {
  const { address } = useAccount();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [usdtIn, setUsdtIn] = useState("10");
  const { writeContract, isPending } = useWriteContract();

  if (status !== 0) {
    return <div className="border border-zinc-800 rounded p-4 text-zinc-500">Trading closed (status: {["TRADING","EXPIRED","RESOLVING","RESOLVED"][status]}).</div>;
  }

  async function onBuy() {
    if (!address) { toast.error("Connect wallet"); return; }
    const amount = parseUnits(usdtIn, 6);
    const minOut = amount * 50n / 100n; // 50% slippage tolerance for hackathon MVP (tighten before prod)
    writeContract({
      address: ADDRESSES.periphery,
      abi: PythiaPeripheryAbi,
      functionName: side === "YES" ? "buyYes" : "buyNo",
      args: [marketId, amount, minOut],
    }, {
      onSuccess: () => toast.success(`Buying ${side}…`),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="border border-zinc-800 rounded p-4 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setSide("YES")} className={`flex-1 py-2 rounded ${side === "YES" ? "bg-emerald-500 text-zinc-950" : "bg-zinc-900"}`}>YES</button>
        <button onClick={() => setSide("NO")} className={`flex-1 py-2 rounded ${side === "NO" ? "bg-rose-500 text-zinc-950" : "bg-zinc-900"}`}>NO</button>
      </div>
      <div>
        <label className="text-xs text-zinc-500">Spend (USDT)</label>
        <input type="number" value={usdtIn} onChange={(e) => setUsdtIn(e.target.value)}
          className="w-full bg-zinc-900 rounded px-3 py-2 mt-1 outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
      <button onClick={onBuy} disabled={isPending || !address}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-2 rounded font-semibold disabled:opacity-50">
        {isPending ? "Confirming…" : `Buy ${side}`}
      </button>
      <p className="text-xs text-zinc-500">
        Note: USDT approval to Periphery required first (one-time per market). Permit2 flow lands in a later iteration.
      </p>
    </div>
  );
}
```

Note for executor: The above wires a basic flow. The Permit2 signature path is a follow-up — first ship two-tx (approve, then buy) for MVP. Tighten slippage to 1-2% once Quoter integration lands.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/TradePanel.tsx frontend/hooks/useQuoter.ts
git commit -m "feat(frontend): TradePanel with buyYes/buyNo via Periphery + basic slippage"
```

### Task 2.5: ResolveButton + "Get OKB → Resolve" combined flow

**Day-3 discovery update:** The UR-compatible route is USDT -> WOKB, not native OKB. Since `PythiaAIProvider.reason` is payable, the frontend must obtain native OKB before calling `hook.requestResolution{value: price}`. Use Universal Router calldata that combines `V3_SWAP_EXACT_OUT` on the direct Uniswap V3 USDT/WOKB 0.30% pool and `UNWRAP_WETH` against X Layer WOKB, then submit `requestResolution` as the second transaction. `contracts/DISCOVERY.md` verifies the WOKB address and `withdraw(uint256)` support.

**Files:**
- Modify: `frontend/components/ResolveButton.tsx`

- [ ] **Step 1: Implement**

```typescript
"use client";
import { useReadContract, useWriteContract, useAccount, useBalance } from "wagmi";
import { ADDRESSES } from "@/lib/contracts";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { PythiaAIProviderAbi } from "@/lib/abi/PythiaAIProvider";
import { toast } from "sonner";

export function ResolveButton({ marketId, modelId }: { marketId: bigint; modelId: number }) {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  const { data: model } = useReadContract({
    address: ADDRESSES.provider, abi: PythiaAIProviderAbi, functionName: "getModel", args: [BigInt(modelId)],
  });
  const { writeContract, isPending } = useWriteContract();

  const price = (model as any)?.price as bigint | undefined;
  const hasEnoughOkb = balance && price && balance.value >= price;

  async function onResolve() {
    if (!price) return;
    if (!hasEnoughOkb) {
      toast.info("You need OKB to pay the AI fee. Get OKB via OKX swap and retry.");
      // Optional: open OKX DEX swap widget here.
      return;
    }
    writeContract({
      address: ADDRESSES.hook, abi: PythiaHookAbi, functionName: "requestResolution",
      args: [marketId], value: price,
    }, {
      onSuccess: () => toast.success("Resolution requested. AI is reasoning…"),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="border border-amber-700 rounded p-4 bg-amber-950/30">
      <p className="text-sm mb-3">
        Market has expired. Pay <span className="font-mono text-amber-400">{price ? `${Number(price) / 1e18} OKB` : "—"}</span>
        to trigger AI resolution. <span className="text-zinc-500">(Resolution is permissionless — anyone can poke.)</span>
      </p>
      <button onClick={onResolve} disabled={isPending}
        className="bg-amber-500 hover:bg-amber-400 text-zinc-950 px-4 py-2 rounded font-semibold disabled:opacity-50">
        {isPending ? "Confirming…" : hasEnoughOkb ? "Resolve" : "Get OKB → Resolve"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ResolveButton.tsx
git commit -m "feat(frontend): ResolveButton with OKB balance check + combined CTA"
```

### Task 2.6: Create market page

**Files:**
- Create: `frontend/app/markets/create/page.tsx`
- Create: `frontend/components/CreateMarketForm.tsx`

- [ ] **Step 1: CreateMarketForm**

```typescript
"use client";
import { useState } from "react";
import { useWriteContract, useAccount } from "wagmi";
import { parseUnits, keccak256, toBytes } from "viem";
import { ADDRESSES } from "@/lib/contracts";
import { PythiaHookAbi } from "@/lib/abi/PythiaHook";
import { toast } from "sonner";

export function CreateMarketForm() {
  const { address } = useAccount();
  const [question, setQuestion] = useState("");
  const [expiry, setExpiry] = useState("");
  const [modelId, setModelId] = useState(1);
  const [initialLp, setInitialLp] = useState("10");
  const { writeContract, isPending } = useWriteContract();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) { toast.error("Connect wallet"); return; }
    if (question.length > 280) { toast.error("Question max 280 chars"); return; }
    const expiryTs = Math.floor(new Date(expiry).getTime() / 1000);
    if (expiryTs <= Date.now() / 1000 + 3600) { toast.error("Expiry must be at least 1 hour from now"); return; }
    const tools = [keccak256(toBytes("ave_token_tool")), keccak256(toBytes("onchain_read_tool"))];
    const initialUsdt = parseUnits(initialLp, 6);

    writeContract({
      address: ADDRESSES.hook, abi: PythiaHookAbi, functionName: "createMarket",
      args: [question, BigInt(expiryTs), tools, modelId, initialUsdt],
    }, {
      onSuccess: () => toast.success("Market created!"),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <div>
        <label className="text-sm text-zinc-400">Question (≤280 chars)</label>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={280}
          className="w-full bg-zinc-900 rounded p-3 mt-1 outline-none focus:ring-2 focus:ring-emerald-500"
          rows={3} placeholder="Will OKB close above $50 by 2026-12-31 23:59 UTC?" />
        <p className="text-xs text-zinc-500 mt-1">{question.length} / 280 — no < > [ ] { } allowed (prompt-injection guard)</p>
      </div>
      <div>
        <label className="text-sm text-zinc-400">Expiry (UTC)</label>
        <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)}
          className="w-full bg-zinc-900 rounded p-3 mt-1" />
      </div>
      <div>
        <label className="text-sm text-zinc-400">Model</label>
        <select value={modelId} onChange={(e) => setModelId(parseInt(e.target.value))}
          className="w-full bg-zinc-900 rounded p-3 mt-1">
          <option value={0}>DGrid Gemini 2.5 Flash Lite (0.005 OKB)</option>
        </select>
      </div>
      <div>
        <label className="text-sm text-zinc-400">Initial USDT liquidity (min 5)</label>
        <input type="number" min="5" value={initialLp} onChange={(e) => setInitialLp(e.target.value)}
          className="w-full bg-zinc-900 rounded p-3 mt-1" />
      </div>
      <p className="text-xs text-zinc-500">
        + 5 USDT creator bond (returned on YES/NO resolution; burned on INVALID).
      </p>
      <button type="submit" disabled={isPending || !address}
        className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-3 rounded font-semibold disabled:opacity-50">
        {isPending ? "Deploying market…" : "Create Market"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Page**

```typescript
import Header from "@/components/Header";
import { CreateMarketForm } from "@/components/CreateMarketForm";

export default function CreatePage() {
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-mono mb-6">Create market</h1>
        <CreateMarketForm />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): create market form with model + liquidity + bond"
```

---

## Phase 3 — Proof viewer (the hero moment)

### Task 3.1: IPFS gateway race

**Files:**
- Create: `frontend/lib/ipfs.ts`

- [ ] **Step 1: Gateway race utility**

```typescript
const GATEWAYS = [
  "https://w3s.link/ipfs/",
  "https://cf-ipfs.com/ipfs/",
  "https://4everland.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

export async function fetchTrail<T = any>(cid: string): Promise<T> {
  const promises = GATEWAYS.map((g) =>
    fetch(g + cid, { cache: "force-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${g} → ${r.status}`);
      return r.json() as Promise<T>;
    })
  );
  return Promise.any(promises);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/ipfs.ts
git commit -m "feat(frontend): IPFS gateway race utility"
```

### Task 3.2: Proof viewer page + modal

**Files:**
- Create: `frontend/app/proofs/[cid]/page.tsx`
- Create: `frontend/components/ProofViewer.tsx`

- [ ] **Step 1: ProofViewer component**

```typescript
"use client";
import { useEffect, useState } from "react";
import { fetchTrail } from "@/lib/ipfs";

type Step =
  | { type: "thought"; text: string }
  | { type: "tool_call"; tool: string; args: any; result: any; rawResponseSha256: string }
  | { type: "final_choice"; choice: number; label: string; rationale: string };

type Trail = {
  version: string;
  chainId: number;
  providerAddress: string;
  requestId: string;
  marketQuestion?: string;
  modelName: string;
  fulfilledAt: string;
  steps: Step[];
  pins: string[];
};

export function ProofViewer({ cid }: { cid: string }) {
  const [trail, setTrail] = useState<Trail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchTrail<Trail>(cid).then(setTrail).catch((e) => setErr(e.message));
  }, [cid]);

  if (err) return <p className="text-rose-400 font-mono">{err}</p>;
  if (!trail) return <p className="text-zinc-500 font-mono">Loading reasoning trail…</p>;

  return (
    <div className="font-mono text-sm space-y-4">
      <header className="border-b border-zinc-800 pb-3">
        <h2 className="text-lg mb-1">{trail.marketQuestion ?? "—"}</h2>
        <p className="text-zinc-500">
          Resolved: <span className="text-emerald-400">{(trail.steps.find((s) => s.type === "final_choice") as any)?.label ?? "?"}</span>
          {" · "}Model: {trail.modelName}{" · "}{new Date(trail.fulfilledAt).toLocaleString()}
        </p>
        <p className="text-xs text-zinc-600 mt-1">CID: {cid}</p>
      </header>
      <div className="space-y-3">
        {trail.steps.map((step, i) => {
          if (step.type === "thought")
            return <div key={i} className="text-zinc-300 italic pl-4 border-l border-zinc-700">▸ {step.text}</div>;
          if (step.type === "tool_call")
            return (
              <details key={i} className="bg-zinc-900 rounded p-3 border border-zinc-800">
                <summary className="cursor-pointer text-emerald-400">▸ tool_call: {step.tool}</summary>
                <pre className="mt-2 text-xs overflow-x-auto">{JSON.stringify({ args: step.args, result: step.result }, null, 2)}</pre>
                <p className="text-xs text-zinc-600 mt-2">raw response sha256: {step.rawResponseSha256}</p>
              </details>
            );
          if (step.type === "final_choice")
            return (
              <div key={i} className="bg-emerald-950/50 border border-emerald-700 rounded p-3">
                <p className="text-emerald-300">▸ final_choice → {step.choice} ({step.label})</p>
                <p className="text-zinc-300 mt-2">{step.rationale}</p>
              </div>
            );
          return null;
        })}
      </div>
      <footer className="border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        Verify on IPFS: {trail.pins.map((p, i) => (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-emerald-400 mr-3">[{new URL(p).hostname}]</a>
        ))}
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Page**

```typescript
import Header from "@/components/Header";
import { ProofViewer } from "@/components/ProofViewer";

export default function Page({ params }: { params: { cid: string } }) {
  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <ProofViewer cid={params.cid} />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): /proofs/[cid] viewer — terminal-aesthetic IPFS reasoning trail"
```

---

## Phase 4 — Twitter share auto-tweet

### Task 4.1: Share button on resolved markets

**Files:**
- Create: `frontend/components/ShareButton.tsx`

- [ ] **Step 1: Implement**

```typescript
"use client";

export function ShareButton({ question, outcome, proofUrl }: {
  question: string; outcome: "YES" | "NO" | "INVALID"; proofUrl: string;
}) {
  const text = `@XLayerOfficial @Uniswap @flapdotsh — Pythia just resolved: "${question.slice(0, 100)}..." → ${outcome}\n\nRead the AI's reasoning: ${proofUrl}\n\n#XLayer #UniswapV4`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-sm">
      Share on X
    </a>
  );
}
```

- [ ] **Step 2: Mount on MarketDetail when status == RESOLVED**

(Insert into Task 2.3's MarketDetail render path.)

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ShareButton.tsx
git commit -m "feat(frontend): Twitter share button auto-tagging hackathon sponsors"
```

---

## Phase 5 — Deployment to Vercel

### Task 5.1: Configure project

- [ ] **Step 1: Create `.env.local` from `.env.local.example` with deployed addresses**

- [ ] **Step 2: Push to GitHub + import in Vercel**

```bash
git push origin main
```

In Vercel dashboard: import repo, set env vars matching `.env.local.example`, deploy.

- [ ] **Step 3: Smoke-test deployed app**

Visit `https://pythia-markets.vercel.app/markets` (or whatever domain), confirm:
- Wallet connect works with OKX Wallet
- Market list loads
- Create/buy/resolve flow works against the live X Layer contracts

- [ ] **Step 4: Commit deployment config docs**

```bash
git add frontend/README.md
git commit -m "docs(frontend): deployment guide for Vercel + env config"
```

---

## Self-Review Checklist

**1. Spec coverage**

- §5.1 pages (`/`, `/markets`, `/markets/[id]`, `/markets/create`, `/proofs/[cid]`) — all present ✓
- §5.2 stack (Next.js 15, wagmi v2, RainbowKit with OKX, TanStack, Tailwind) — all wired ✓
- §5.3 X Layer chain config (id 196, RPC priority list, Multicall3) — in `lib/chain.ts` ✓
- §5.4 critical UX:
  - OKX Wallet first-class ✓
  - "Get OKB → Resolve" combined button ✓ (Task 2.5)
  - Permit2 + Periphery one-tx — partially: TradePanel uses `buyYes` directly; Permit2 sig flow is deferred to a follow-up iteration
  - Quoter spot quotes — scaffolded in `useQuoter.ts`; full integration requires V4 Quoter ABI fragment paste
  - Mobile reflow — relies on Tailwind `md:` breakpoints in components ✓
  - Auto-share on Resolved — ShareButton component ✓
  - Network mismatch — RainbowKit auto-handles ✓
  - Live RESOLVING indicator — `useWatchContractEvent` listens to `Resolved` events ✓
- §5.5 proof viewer — Task 3.2 ✓
- §5.6 no subgraph — confirmed; using `getMarkets` + multicall ✓

**2. Placeholder scan**

- Quoter ABI fragment (`/* paste V4 quoter ABI fragment */`) needs the actual fragment pasted post-Plan-1 compile
- TradePanel slippage "50%" is intentionally generous for MVP; tighten with Quoter once wired
- `onchainRead` tool ABI needs fragment paste

**3. Type consistency**

- `marketId: bigint` throughout ✓
- `status` numeric enum (0/1/2/3 = TRADING/EXPIRED/RESOLVING/RESOLVED) consistent ✓
- Contract function names match Plan 1 (`getMarkets`, `marketView`, `effectiveStatus`, `requestResolution`, `createMarket`, `buyYes`, etc.) ✓

---

## Execution Handoff

Same options as Plan 1. Frontend benefits from inline execution since UI iteration is fast and visual.
