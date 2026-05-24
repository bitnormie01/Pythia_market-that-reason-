# Day 1 Discovery - Pythia X Layer Deployment Facts

| Item | Value | Source / Verified |
|---|---|---|
| Chain ID | 196 | hardcoded |
| Bridged USDT address | `0x779ded0c9e1022225f8e0630b35a9b54be713736` | OKX OnchainOS supported currencies docs |
| USDT decimals | 6 | `cast call decimals()` on `https://rpc.xlayer.tech` |
| USDT/OKB routable liquidity | Not verified in this pass | OKLink pool discovery still required |
| V4 PoolManager | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | docs/superpowers/specs |
| V4 Quoter | `0x8928074ca1b241d8ec02815881c1af11e8bc5219` | docs/superpowers/specs |
| Universal Router 2.1.1 | `0x8b844f885672f333bc0042cb669255f93a4c1e6b` | docs/superpowers/specs |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | docs/superpowers/specs |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | docs/superpowers/specs |
| Tool name (Flap) | both `ave_token_tool` and `ave_token_info` whitelisted | `docs/flap-docs.md` line 188 and lines 445-451 |
| Solidity version (Flap BSC) | 0.8.x | `docs/flap-docs.md` line 222; deployed bytecode metadata still requires confirmation |

## Notes

- External GitHub dependency cloning stalled during `forge install`, so Phase 0 dependency installation is incomplete.
- A minimal local OpenZeppelin-compatible `ERC20` and `Clones` shim is present only to unblock Phase 2 tests. Replace it with `forge install OpenZeppelin/openzeppelin-contracts@v5.0.2` once dependency cloning is healthy.
