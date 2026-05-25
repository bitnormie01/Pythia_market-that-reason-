# Pythia Fulfiller

Off-chain worker that resolves Pythia prediction-market `reason()` requests on X Layer.

**Pipeline:** `FlapAIProviderRequestMade` event → Anthropic Claude Sonnet (with tool calls) → Pinata IPFS pin → `fulfillReasoning(requestId, choice, cid)`.

## Demo Model Support

The on-chain provider registry keeps the Flap-compatible model IDs, but this hackathon fulfiller intentionally services only `modelId=1` (`anthropic/claude-sonnet-4.6`). The Anthropic API call is pinned to `claude-sonnet-4-20250514`. Seed scripts and the frontend create-market form must use model #1; requests for model IDs `0`, `2`, or `3` are rejected by the worker.

## Quick start

```bash
cp .env.example .env
# populate ANTHROPIC_API_KEY, PINATA_JWT, FULFILLER_PRIVATE_KEY,
# PYTHIA_AI_PROVIDER_ADDRESS, PYTHIA_HOOK_ADDRESS
npm install
npm test
npm run start
```

## Architecture

| Module | Responsibility |
| --- | --- |
| `config.ts` | Zod-validated env loader |
| `persist.ts` | SQLite WAL store with idempotent `recordRequest` |
| `watcher.ts` | viem `watchContractEvent` over `FlapAIProviderRequestMade` |
| `runner.ts` | Anthropic SDK tool-call loop (max 5 iterations, fallback `choice=2 INVALID`) |
| `tools/aveToken.ts` | `ave_token_tool`: fetches live token metrics from ave.ai |
| `tools/onchainRead.ts` | `onchain_read_tool`: `parseAbi` + `readContract` on X Layer |
| `pin.ts` | Pinata IPFS pin plus public gateway URLs |
| `submit.ts` | viem `walletClient` → `fulfillReasoning` / `refundRequest` + receipt check |
| `processor.ts` | event → run → pin → submit; refund-on-failure; startup replay |
| `index.ts` | wires the loop, optional Better Stack heartbeat, graceful shutdown |

## Local Anvil Smoke Procedure

1. **Terminal 1 — start anvil with X Layer chain ID**

   ```bash
   anvil --chain-id 196 --port 8545
   ```

2. **Terminal 2 — run the deterministic smoke**

   ```bash
   npm run smoke:local
   ```

   The script deploys `PythiaAIProvider`, starts the real event watcher, submits a `reason()` request, processes it with mocked LLM/IPFS dependencies, sends a real `fulfillReasoning` transaction, and verifies the request is `FULFILLED` on-chain.

3. **Optional live-provider mode**

   ```bash
   ANTHROPIC_API_KEY=sk-ant-... \
   PINATA_JWT=... \
   SMOKE_LIVE=1 \
   npm run smoke:local
   ```

   Live mode uses the same local chain path but calls Anthropic and Pinata instead of the deterministic mocks.

4. **Inspect the trail**

   The fulfilled row in `.tmp/local-smoke.sqlite` carries the CID. In live mode, fetch the trail JSON from either `gateway.pinata.cloud/ipfs/<cid>` or `cloudflare-ipfs.com/ipfs/<cid>`.

## Crash recovery

On restart, `replayPending` walks `requests WHERE status='pending'`:
- Rows with a saved `prompt` are re-driven through the full pipeline (idempotent via `INSERT OR IGNORE`).
- Legacy rows missing `prompt` are refunded.

## Security deferrals (hackathon scope)

`npm install` reports vulnerabilities in `@pinata/sdk@2.1.0` transitive dependencies. These were knowingly accepted by the mastermind:

- The fulfiller is a server-side daemon making outbound calls to known IPFS endpoints.
- Attack vector is "Pinata itself compromised" — low risk for a week-long demo.
- Replacements would push the milestone into the deploy window.

Track upstream patches; revisit before mainnet promotion.
