# Pythia

**AI-resolved prediction markets, native to Uniswap v4 on X Layer.**

Pythia turns a Uniswap v4 pool into a self-settling prediction market. When a market expires, anyone can pay a small OKB fee to request resolution. An off-chain AI worker reads the question, calls whitelisted on-chain and price tools, decides YES / NO / INVALID, pins the full reasoning trail to IPFS, and submits the result back through an oracle contract that triggers the hook's payout logic. Traders redeem winning outcome tokens 1:1 for USDT.

No centralized oracle. No vote aggregation. Every resolution ships with a CID that contains every tool call the model made, every byte of evidence it considered, and the final reasoning text.

---

## Try it

- 📹 **Demo video** (2 min) — Pending
- 🌐 **Live frontend** — https://pythia-uniswapv4.vercel.app/
- ⛓️ **Deployed contracts on X Layer mainnet:**
  - PythiaHook — [`0xB5370e00d486a39eb3654e41F8b8425b24D94880`](https://www.oklink.com/xlayer/address/0xB5370e00d486a39eb3654e41F8b8425b24D94880)
  - PythiaAIProvider — [`0x68B343fd826e2837Fc8B69f418C0612116ca807B`](https://www.oklink.com/xlayer/address/0x68B343fd826e2837Fc8B69f418C0612116ca807B)
  - PythiaPeriphery — [`0x9443e94449eD090BACf996c199B3aA18362170C3`](https://www.oklink.com/xlayer/address/0x9443e94449eD090BACf996c199B3aA18362170C3)
  - OutcomeToken master — [`0xe8Af06794f0E8AEB5E5eD6fB2D3cfbaDCB70082A`](https://www.oklink.com/xlayer/address/0xe8Af06794f0E8AEB5E5eD6fB2D3cfbaDCB70082A)

The deployed contracts accept market creation from any address. Anyone with USDT on X Layer can create a market through the live frontend right now.

---

## Why this is interesting

Prediction markets have historically depended on either centralized oracles (slow, opaque, expensive) or token-curated registries (subject to whale capture). Pythia takes a third path: a replaceable AI model committed to an on-chain registry, with full reasoning provenance pinned to IPFS for every resolution.

**Three properties that fall out of the design:**

1. **Auditable.** Every resolution emits an IPFS CID. The trail JSON contains the prompt, every tool call with its raw response SHA-256, the model's reasoning, and the final choice. You can disagree with the model — but you can verify exactly what it saw.
2. **Composable.** The provider implements `IFlapAIProvider`, so the same hook works with any ABI-compatible AI oracle. When Flap AI launches on X Layer, Pythia migrates with a one-line swap.
3. **Failure-safe.** If the off-chain worker fails to pin or the AI errors out, the provider auto-refunds and the hook resets the market to `TRADING` with all bookkeeping cleared. No funds stranded, no admin intervention needed.

---

## Architecture

```
                          ┌──────────────────────────────┐
   User ── create  ──────▶│       PythiaHook (V4)        │
        ── trade   ──────▶│  ─ createMarket              │
        ── redeem  ──────▶│  ─ requestResolution{OKB}    │
                          │  ─ mintFor / burnFor / redeem│
                          └──────────┬───────────────────┘
                                     │ unlock() + swap/modifyLiquidity
                                     ▼
                          ┌──────────────────────────────┐
                          │  Uniswap v4 PoolManager      │
                          │  YES/USDT + NO/USDT pools    │
                          └──────────────────────────────┘
                                     ▲
                                     │ reason{value: 0.005 OKB}
                                     │
                          ┌──────────────────────────────┐
                          │     PythiaAIProvider         │◀───┐
                          │  ─ IFlapAIProvider-compatible│    │
                          │  ─ FULFILLER_ROLE gated      │    │
                          │  ─ try/catch consumer cb     │    │
                          └──────────┬───────────────────┘    │
                                     │ RequestMade event       │
                                     ▼                         │
                          ┌──────────────────────────────┐    │
                          │   Off-chain fulfiller        │    │
                          │  ─ viem event watcher        │    │
                          │  ─ DGrid Gemini chat loop    │    │
                          │  ─ ave_token_tool            │    │
                          │  ─ onchain_read_tool         │    │
                          │  ─ Pinata IPFS pin (JSON)    │    │
                          └──────────┬───────────────────┘    │
                                     │ fulfillReasoning(...)   │
                                     └─────────────────────────┘
```

The hook owns the V4 position lifecycle per market: it mints matched YES + NO outcome tokens for every USDT deposit via EIP-1167 clones, seeds initial 50/50 liquidity at creation, gates `beforeAddLiquidity` and `beforeSwap` against the market state machine (`TRADING → EXPIRED → RESOLVING → RESOLVED`), and routes the resolution callback into a payout function whose math depends on the AI's choice.

---

## Features

- **V4-native, single-hook design.** Address mined via `HookMiner` to encode `BEFORE_ADD_LIQUIDITY_FLAG | BEFORE_SWAP_FLAG` in its bytecode. Integrates with the canonical X Layer V4 PoolManager at `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32`.
- **ABI-compatible AI provider.** `PythiaAIProvider` implements the same interface as Flap AI Oracle. Today: Google Gemini 2.5 Flash Lite via DGrid (~$0.005 OKB per resolution). Tomorrow: any model registered in the on-chain registry.
- **Atomic trading wrapper.** `PythiaPeriphery` lets users buy YES (or NO) in a single transaction: mint a matched pair, swap the unwanted leg through the V4 pool, take the winning leg. No 2-step approvals, no leftover dust.
- **Creator-staked bond.** 5 USDT per market, returned on a definitive YES/NO resolution, burned to `0xdEaD` on INVALID. Disincentivizes ambiguous or unanswerable questions.
- **Reasoning-trail provenance.** Every resolution emits an IPFS CID. Trail JSON contains: prompt, every tool call with raw response SHA-256 hash, reasoning text, final choice and label. Mirrored across Pinata + Cloudflare gateways.
- **Refund cascade on off-chain failure.** Validated in production: when Pinata fails or DGrid errors, the fulfiller submits `refundRequest`; the provider transitions to `REFUNDED`; the hook resets the market to `TRADING`; `marketLastRequestId` and `pendingRequestCount` clear. No stuck markets.
- **Stale-bond claim path.** Admin escape hatch after 7 days for markets that never resolve. Pre-defined recovery, not ad-hoc.

---

## Tech stack

| Layer | Stack |
|-------|-------|
| Contracts | Solidity 0.8.26, Foundry, Uniswap v4-core/periphery 1.0.x, OpenZeppelin 5.x, EIP-1167 clones for OutcomeToken |
| AI | DGrid OpenAI-compatible router → Google Gemini 2.5 Flash Lite. 5-iteration tool-call loop, INVALID fallback |
| IPFS | Pinata `pinJSONToIPFS`; trail mirrored on Cloudflare IPFS gateway |
| Off-chain worker | Node 20+, viem 2.x, SQLite (WAL) for crash-safe persistence, Pino structured logging |
| Frontend | Next.js 15 (App Router), wagmi 2.x, RainbowKit, Tailwind, OKX Wallet first-class |
| Tooling | Foundry forge/cast/anvil, Vitest |

---

## Repository structure

```
contracts/      Foundry workspace: Solidity sources, 96 passing tests, deploy scripts
fulfiller/      Off-chain TypeScript worker: event watcher, AI runner, IPFS pin, tx submit
frontend/       Next.js 15 app: market browser, trading panel, market creation, IPFS trail viewer
docs/           Design spec, implementation plans, discovery notes
```

---

## Quick start

```bash
# Contracts
cd contracts && npm ci && forge build && forge test -vv
# Expected: 96 tests, 0 failed

# Off-chain worker
cd ../fulfiller && npm ci && npm test
# Expected: 30 tests across 7 files

# Frontend
cd ../frontend && npm ci && npm run dev
```

For a full local end-to-end against a forked X Layer mainnet, see `docs/superpowers/plans/2026-05-23-pythia-deploy-and-demo.md`.

---

## Validation history

- **96 / 96** Solidity unit tests passing under `forge test`
- **30 / 30** TypeScript unit tests passing under `vitest`
- **Fork E2E on X Layer mainnet state** (May 26 2026): deploy → request → DGrid resolve → Pinata pin → fulfill → `RESOLVED` → redeem math verified
- **Failure-mode E2E** validated separately: with intentionally-misconfigured Pinata, the full refund cascade fired correctly and left the market in a clean `TRADING` state with all counters reset

---

## Deployment

Plan A for the hackathon submission deploys infrastructure contracts on X Layer mainnet and intentionally stops before seeding markets — the demo video is recorded against a local Anvil fork so creator-bond economics don't influence judging. The live frontend points at the mainnet contracts; users create markets on demand by funding their own bond + seed.

```bash
cd contracts
source ../.env.deploy

forge script script/01_DeployProvider.s.sol     --rpc-url xlayer --broadcast --slow -vvvv
forge script script/02_MineAndDeployHook.s.sol  --rpc-url xlayer --broadcast --slow -vvvv
forge script script/03_DeployPeriphery.s.sol    --rpc-url xlayer --broadcast --slow -vvvv
```

`script/04_SeedMarkets.s.sol` remains available for post-launch seeding when creator-side USDT capital is allocated.

---

## What's next

- Swap `PythiaAIProvider` for **Flap AI Oracle** when it deploys on X Layer (ABI already compatible — one-line config change)
- **Multi-model arbitration:** re-run the same question across 2–3 model registries, surface disagreement for admin-vetoable status
- **Permit2** for USDT approvals (deferred for hackathon)
- On-chain **`previewClaim`** view function (currently computed client-side)
- Indexer + per-consumer request list to bring `PythiaAIProvider.getRequestsByConsumer` to O(1) for explorer use

---

## License

MIT.

---

Built for the **X Layer "Hook the Future" hackathon** (May 2026).
