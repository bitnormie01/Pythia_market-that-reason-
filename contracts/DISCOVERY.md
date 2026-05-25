# Day 1 Discovery - Pythia X Layer Deployment Facts

| Item | Value | Source / Verified |
|---|---|---|
| Chain ID | 196 | hardcoded |
| Bridged USDT address | `0x779ded0c9e1022225f8e0630b35a9b54be713736` | OKX OnchainOS supported currencies docs |
| USDT decimals | 6 | `cast call decimals()` on `https://rpc.xlayer.tech` |
| USDT ERC20 transfer return | `transfer(address,uint256)(bool)` returns `true` for a zero-value `eth_call` | `cast call 0x779ded0c9e1022225f8e0630b35a9b54be713736 "transfer(address,uint256)(bool)" 0x0000000000000000000000000000000000000001 0 --from 0x0000000000000000000000000000000000000001 --rpc-url https://rpc.xlayer.tech` |
| USDT/OKB routable liquidity | UR-compatible direct Uniswap V3 route confirmed: `10,000 USDT -> 120.313065446636224459 WOKB` via 0.30% USDT/WOKB pool `0x63d62734847e55a266fca4219a9ad0a02d5f6e02`; pool liquidity `263398676013757805`; OnchainOS reports `$1.91m` pool liquidity | `cast call` to X Layer QuoterV2 `0xd1b797d92d87b688193a2b976efc8d577d204343` and pool contract; Uniswap X Layer V3 deployments docs |
| V4 PoolManager | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | docs/superpowers/specs |
| V4 Quoter | `0x8928074ca1b241d8ec02815881c1af11e8bc5219` | docs/superpowers/specs |
| Universal Router 2.1.1 | `0x8b844f885672f333bc0042cb669255f93a4c1e6b` | docs/superpowers/specs |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | docs/superpowers/specs |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | docs/superpowers/specs |
| WOKB returned by UR/V3 routes | `0xe538905cf8410324e03a5a23c1c177a474d59b2b`, symbol `WOKB`, decimals `18`, `withdraw(uint256)` present | `cast call symbol()`, `decimals()`, and `withdraw(0)` on `https://rpc.xlayer.tech` |
| Tool name (Flap) | both `ave_token_tool` and `ave_token_info` whitelisted | `docs/flap-docs.md` line 188 and lines 445-451 |
| Solidity version (Flap BSC) | 0.8.x | `docs/flap-docs.md` line 222; deployed bytecode metadata still requires confirmation |

## Notes

- `forge install` / direct Git clones stalled in this environment, so Solidity dependencies are installed through npm instead.
- `@uniswap/permit2` is not published in the npm registry. It is tracked as a GitHub tarball dependency pinned to commit `cc56ad0f3439c502c246fc5cfcc3db92bb8b7219` in `package.json` / `package-lock.json` and remapped from `node_modules/@uniswap/permit2`.
- USDT -> OKB practical routing was also verified through OKX OnchainOS DEX quote: `10,000 USDT -> 120.304085331571362265 OKB`, price impact `-0.29%`, route split across Uniswap V3, Uniswap V4, CurveNG, PotatoSwap, QuickSwap V3, Revoswap V2, and OkieSwap V3 at context slot `60837191`.
- Universal Router path for the frontend "Get OKB -> Resolve" button should use the direct Uniswap V3 0.30% USDT/WOKB pool, not the broader OnchainOS aggregate route. The V4 vanilla USDT/WOKB pool keys checked at fee/tick spacing `(100,1)`, `(500,10)`, `(3000,60)`, and `(10000,200)` reverted with `PoolNotInitialized()`.
- The Uniswap V3/UR route returns WOKB, not native OKB. The frontend flow must unwrap WOKB before `hook.requestResolution{value: price}`. WOKB's `withdraw(uint256)` function is present, so UR `UNWRAP_WETH` should be viable.
- V4 1.0.2 `PoolManager.modifyLiquidity` records position ownership as `msg.sender`. Because `createMarket` seeds liquidity atomically through the hook's `unlockCallback`, the seed position is hook-owned, not creator-owned. Future remove-liquidity UX must be hook-mediated or use a separate position manager/periphery design; the original plan's `owner=creator` assumption does not match the installed API.
- Known v1 limitation: `PythiaAIProvider.getRequestsByConsumer` is an O(n) explorer view with a temporary array sized to total request count. This is acceptable for demo-scale traffic and should be indexed or paginated from a per-consumer request list before production-scale traffic.

## Final Contract Sweep - May 25, 2026

| Check | Result | Command / Note |
|---|---|---|
| Full Foundry suite | 98 passed, 0 failed, 0 skipped | `forge test -vv` |
| Invariant fuzz | 64 runs, 2048 calls, 0 reverts | `forge test --match-path test/invariant/CollateralInvariant.t.sol -vv`; asserts matched YES/NO supply and USDT collateral backing net of creator bond |
| X Layer fork smoke | 2 passed | `forge test --match-path test/fork/XLayerFork.t.sol -vv`; deploys provider and mined-address hook against real X Layer PoolManager + USDT |
| Gas report | Completed: 97 passed, 0 failed, 1 skipped | `forge test --gas-report`; clone gas smoke is skipped only under gas-report because Foundry instrumentation inflates `gasleft` snapshots |
| OutcomeToken clone deploy gas | 43,327 gas in normal test mode | `test_clone_deploy_under_50k_gas` |
| PythiaHook gas highlights | `createMarket` avg 907,163 / max 1,011,768; `mint` avg 97,423; `burn` avg 91,138; `redeem` avg 73,852 | Gas report includes full V4 pool initialize / clone / seed cost in `createMarket` |
| PythiaPeriphery gas highlights | `buyYes` avg 252,932; `buyNo` avg 252,926; `sellYes` avg 242,126; `sellNo` avg 242,124 | Approval-path periphery tests |
| Coverage: PythiaHook | 91.01% lines, 87.17% statements, 82.69% functions | `forge coverage --report summary` |
| Coverage: PythiaAIProvider | 76.67% lines, 61.59% statements, 85.00% functions | Provider is below the standalone 80% line target, but combined Hook+Provider line coverage is 87.39% |
| Coverage: Hook + Provider combined | 416/476 lines = 87.39% | Target met for core lifecycle + oracle surface |
| Coverage: PythiaPeriphery / OutcomeToken | 100.00% lines each | `forge coverage --report summary` |
