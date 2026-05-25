# Pythia Frontend

Next.js 15 / React 19 frontend for the Pythia AI-resolved prediction market on X Layer.

## Quick start

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_HOOK_ADDRESS, NEXT_PUBLIC_PROVIDER_ADDRESS,
# NEXT_PUBLIC_PERIPHERY_ADDRESS, NEXT_PUBLIC_OUTCOME_MASTER_ADDRESS, and
# (optional) NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

npm install
npm run dev
```

The dev server defaults to <http://localhost:3000>.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Hero + recent markets |
| `/markets` | Full market grid with multicall reads |
| `/markets/[id]` | Detail view: status, trade panel, resolve CTA, proof link |
| `/markets/create` | Create a new market (question + expiry + model + LP + bond) |
| `/proofs/[cid]` | Reasoning trail viewer (IPFS gateway race) |

## Wallet

`getDefaultConfig` from RainbowKit, with OKX Wallet listed first in the
recommended group, then MetaMask + WalletConnect.

## OKB acquisition flow

`PythiaAIProvider.reason` is payable, so users need native OKB to trigger
resolution. The current `ResolveButton` links out to the OKX DEX swap when
the user's OKB balance is below the model fee. Per `contracts/DISCOVERY.md`,
the long-term automatic path is `Universal Router` calldata that combines
`V3_SWAP_EXACT_OUT` on the `0x63d62734...` USDT/WOKB 0.30 % pool with
`UNWRAP_WETH` against WOKB (`0xe538905c...`), then submits
`hook.requestResolution{value: price}` as the second tx. Permit2 is deferred
post-MVP.

## Trade flow

`TradePanel` uses approve-then-call against `PythiaPeriphery.buyYes` /
`buyNo` / `sellYes` / `sellNo`. Slippage is set to 50 % for MVP and should
be tightened once a V4 Quoter integration lands.

The sell path surfaces the known UX caveat that selling in a skewed pool
returns USDT *plus* a leftover outcome-token balance — users should expect
to still hold some YES/NO after a sell.

## Build & typecheck

```bash
npm run typecheck   # tsc --noEmit
npm run build       # next build
```

## Deployment

Push to GitHub then import in Vercel. Required env vars match
`.env.local.example`. The repo root contains the `frontend/` directory; in
Vercel set the project root to `frontend/`.
