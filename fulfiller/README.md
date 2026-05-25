# Pythia Fulfiller

Off-chain worker that resolves Pythia prediction-market `reason()` requests on X Layer.

**Pipeline:** `FlapAIProviderRequestMade` event → Anthropic Claude (with tool calls) → IPFS pin → `fulfillReasoning(requestId, choice, cid)`.

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
| `pin.ts` | Dual IPFS pin (Pinata + web3.storage) via `Promise.allSettled` |
| `submit.ts` | viem `walletClient` → `fulfillReasoning` / `refundRequest` + receipt check |
| `processor.ts` | event → run → pin → submit; refund-on-failure; startup replay |
| `index.ts` | wires the loop, optional Better Stack heartbeat, graceful shutdown |

## Local anvil smoke procedure

1. **Terminal 1 — fork X Layer**

   ```bash
   anvil --fork-url https://rpc.xlayer.tech --port 8545
   ```

2. **Terminal 2 — deploy contracts onto the fork**

   Use the Foundry script from Plan 4 (`script/Deploy.s.sol`) pointed at the local anvil RPC. Capture the deployed `PythiaAIProvider` address.

3. **Terminal 3 — start the fulfiller against the fork**

   ```bash
   XLAYER_RPC_URL=http://localhost:8545 \
   PYTHIA_AI_PROVIDER_ADDRESS=0x... \
   PYTHIA_HOOK_ADDRESS=0x... \
   FULFILLER_PRIVATE_KEY=0x<anvil-default-key-0> \
   ANTHROPIC_API_KEY=sk-ant-... \
   PINATA_JWT=... \
   npm run dev
   ```

4. **Trigger a request**

   From a mock consumer (or `cast send`), invoke `reason()` on the provider with `feePaid`, a prompt, and `numOfChoices=3`. The fulfiller log should show:
   - `FlapAIProviderRequestMade` log received
   - Anthropic tool-use loop (one or more `tool_call` lines)
   - `fulfillReasoning tx submitted` then `fulfillReasoning tx confirmed`

5. **Inspect the trail**

   The fulfilled row in `pythia-fulfiller.sqlite` carries the CID. Fetch the trail JSON from any of: `gateway.pinata.cloud/ipfs/<cid>`, `w3s.link/ipfs/<cid>`, `cloudflare-ipfs.com/ipfs/<cid>`.

## Crash recovery

On restart, `replayPending` walks `requests WHERE status='pending'`:
- Rows with a saved `prompt` are re-driven through the full pipeline (idempotent via `INSERT OR IGNORE`).
- Legacy rows missing `prompt` are refunded.

## Security deferrals (hackathon scope)

`npm install` reports vulnerabilities in `@pinata/sdk@2.1.0` and `web3.storage@4.5.5` transitive dependencies. These were knowingly accepted by the mastermind:

- The fulfiller is a server-side daemon making outbound calls to known IPFS endpoints.
- Attack vector is "Pinata/web3.storage themselves compromised" — low risk for a week-long demo.
- Replacements would push the milestone into the deploy window.

Track upstream patches; revisit before mainnet promotion.
