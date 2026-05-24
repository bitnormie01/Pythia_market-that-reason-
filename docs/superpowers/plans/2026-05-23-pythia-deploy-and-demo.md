# Pythia Deploy + Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy all Pythia contracts to X Layer mainnet, seed 5 demo markets, source-verify on OKLink, record the 1–3 min demo video against an already-resolved hero market, and submit to the hackathon Google Form before May 28 23:59 UTC.

**Architecture:** Foundry deploy scripts execute the 8-step deployment sequence (multisig → provider → hook mining → hook → outcome master → periphery → seeded markets → verification). Pre-recorded demo eliminates AI/IPFS demo-day drama. Twitter presence baked in throughout.

**Tech Stack:** Foundry (forge scripts), Safe (admin multisig), OKLink (block explorer + verification), OBS / QuickTime (screen recording), CapCut / DaVinci (light editing).

**Source spec:** `docs/superpowers/specs/2026-05-23-pythia-prediction-market-hook-design.md` §6, §4.7

**Depends on:** Plan 1 (contracts), Plan 2 (fulfiller), Plan 3 (frontend) all complete.

**Time budget:** Day 4 afternoon (deploy + seed) + Day 5 (demo recording + submission). May 28 is Day 6 buffer.

---

## Phase 0 — Pre-deploy preparation

### Task 0.1: Provision keys and fund wallets

- [ ] **Step 1: Generate fresh EOAs for fulfiller (primary + backup)**

```bash
# Use cast wallet for ephemeral generation
cast wallet new
cast wallet new
```

Save outputs offline. These are NOT your main wallet — they hold only operational funds.

- [ ] **Step 2: Deploy admin Safe multisig on X Layer**

Use https://app.safe.global → "Create new Safe" → select X Layer → 2-of-3 signers (you + two trusted backup keys).

Record the Safe address.

- [ ] **Step 3: Fund all three EOAs with OKB**

| Address | Initial OKB | Purpose |
|---|---|---|
| Admin Safe | 1.0 OKB | Admin txs (rare) |
| Deployer EOA (you) | 2.0 OKB | Deployment + market seeding |
| Fulfiller EOA (primary) | 5.0 OKB | ~500 fulfillment txs worth |
| Fulfiller EOA (backup) | 1.0 OKB | Standby |

At current ~$45 OKB ≈ $400 total. Bridge from BSC via Orbiter or OKX bridge if needed.

- [ ] **Step 4: Acquire 100 USDT on X Layer for testing + market seeding**

5 seeded markets × (5 bond + 10 LP) = 75 USDT minimum. Buffer to 100.

- [ ] **Step 5: Get OKLink API key for verification**

Sign up at https://www.oklink.com → developer console → generate API key. Add to env.

- [ ] **Step 6: Save secrets to a local `.env.deploy` (NEVER COMMIT)**

```bash
# .env.deploy — git-ignored
DEPLOYER_PRIVATE_KEY=0x...
ADMIN_SAFE=0x...
FULFILLER_PRIMARY=0x...
FULFILLER_BACKUP=0x...
OKLINK_API_KEY=...
USDT_ADDRESS=0x...  # from DISCOVERY.md
```

Add `.env.deploy` to root `.gitignore` immediately.

- [ ] **Step 7: Commit gitignore update**

```bash
cd C:/xLayer-hackathon/uniswapV4Hackthon
echo ".env.deploy" >> .gitignore
echo "*.env.deploy" >> .gitignore
git add .gitignore
git commit -m "chore: ignore deployment env files"
```

---

## Phase 1 — Deployment scripts

### Task 1.1: Provider deploy script

**Files:**
- Create: `contracts/script/01_DeployProvider.s.sol`

- [ ] **Step 1: Write the script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {PythiaAIProvider} from "../src/PythiaAIProvider.sol";

contract DeployProvider is Script {
    function run() external returns (PythiaAIProvider provider) {
        address admin = vm.envAddress("ADMIN_SAFE");
        address fulfiller = vm.envAddress("FULFILLER_PRIMARY");
        address backupFulfiller = vm.envAddress("FULFILLER_BACKUP");
        address feeReceiver = admin; // admin Safe receives fees

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        provider = new PythiaAIProvider(admin, fulfiller, feeReceiver);

        // Grant FULFILLER_ROLE to backup as well
        bytes32 fulfillerRole = provider.FULFILLER_ROLE();
        provider.grantRole(fulfillerRole, backupFulfiller);

        vm.stopBroadcast();

        console.log("PythiaAIProvider deployed to:", address(provider));
        console.log("Admin Safe:", admin);
        console.log("Primary fulfiller:", fulfiller);
        console.log("Backup fulfiller:", backupFulfiller);
    }
}
```

- [ ] **Step 2: Dry-run on a fork**

```bash
cd contracts
source ../.env.deploy
forge script script/01_DeployProvider.s.sol --rpc-url xlayer -vvvv
```

Expected: simulated deploy, no broadcast.

- [ ] **Step 3: Commit**

```bash
git add contracts/script/01_DeployProvider.s.sol
git commit -m "feat(deploy): provider deployment script with admin Safe + dual fulfiller"
```

### Task 1.2: Hook address mining + deploy script

**Files:**
- Create: `contracts/script/02_MineAndDeployHook.s.sol`

- [ ] **Step 1: Write mining + deploy script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/contracts/utils/HookMiner.sol";
import {PythiaHook} from "../src/PythiaHook.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

contract MineAndDeployHook is Script {
    address constant POOL_MANAGER = 0x360e68faccca8ca495c1b759fd9eee466db9fb32;
    // Per-Foundry CREATE2 deployer (same on all chains)
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external returns (PythiaHook hook, OutcomeToken master) {
        address admin = vm.envAddress("ADMIN_SAFE");
        address provider = vm.envAddress("PROVIDER_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // 1. Deploy OutcomeToken master (no special address needed)
        master = new OutcomeToken();
        console.log("OutcomeToken master:", address(master));

        // 2. Mine the hook address
        uint160 flags = uint160(Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG);
        (address hookAddr, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(PythiaHook).creationCode,
            abi.encode(POOL_MANAGER, usdt, provider, address(master), admin)
        );
        console.log("Mined hook address:", hookAddr);
        console.log("Salt:", uint256(salt));

        // 3. Deploy via CREATE2
        hook = new PythiaHook{salt: salt}(POOL_MANAGER, usdt, provider, address(master), admin);
        require(address(hook) == hookAddr, "hook address mismatch");
        console.log("PythiaHook deployed to:", address(hook));

        vm.stopBroadcast();
    }
}
```

- [ ] **Step 2: Dry-run**

```bash
PROVIDER_ADDRESS=0x... forge script script/02_MineAndDeployHook.s.sol --rpc-url xlayer -vvvv
```

Expected: mining succeeds in seconds (BEFORE_ADD_LIQUIDITY + BEFORE_SWAP = bits 7 and 9, ~1/1024 chance per attempt). Address ends in the right bit pattern.

- [ ] **Step 3: Commit**

```bash
git add contracts/script/02_MineAndDeployHook.s.sol
git commit -m "feat(deploy): hook mining + CREATE2 deploy script"
```

### Task 1.3: Periphery deploy script

**Files:**
- Create: `contracts/script/03_DeployPeriphery.s.sol`

- [ ] **Step 1: Write script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {PythiaPeriphery} from "../src/PythiaPeriphery.sol";

contract DeployPeriphery is Script {
    address constant POOL_MANAGER = 0x360e68faccca8ca495c1b759fd9eee466db9fb32;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external returns (PythiaPeriphery periphery) {
        address hook = vm.envAddress("HOOK_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        periphery = new PythiaPeriphery(hook, POOL_MANAGER, PERMIT2, usdt);
        vm.stopBroadcast();
        console.log("PythiaPeriphery deployed to:", address(periphery));
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add contracts/script/03_DeployPeriphery.s.sol
git commit -m "feat(deploy): periphery deployment script"
```

### Task 1.4: Seed markets script

**Files:**
- Create: `contracts/script/04_SeedMarkets.s.sol`

- [ ] **Step 1: Write script that creates the 5 seeded markets from spec §6.4**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PythiaHook} from "../src/PythiaHook.sol";

contract SeedMarkets is Script {
    function run() external {
        address hook = vm.envAddress("HOOK_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");

        bytes32[] memory toolsAve = new bytes32[](1);
        toolsAve[0] = keccak256("ave_token_tool");

        bytes32[] memory toolsBoth = new bytes32[](2);
        toolsBoth[0] = keccak256("ave_token_tool");
        toolsBoth[1] = keccak256("onchain_read_tool");

        bytes32[] memory noTools = new bytes32[](0);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        // Approve USDT for hook (5 markets × (5 + 10) = 75 USDT)
        IERC20(usdt).approve(hook, 75e6);

        // Market 1: Hero demo market — already-expired by recording time
        //   Set expiry to 30 minutes from broadcast time. By the time we record demo on Day 5,
        //   this will be ~24 hours expired and resolved.
        PythiaHook(payable(hook)).createMarket(
            "Is OKB spot price above $40 at 2026-05-26T18:00:00Z?",
            uint64(block.timestamp + 30 minutes),
            toolsBoth,
            1, // Sonnet 4.6
            10e6
        );

        // Market 2: Submission-deadline market — auditable by judges
        PythiaHook(payable(hook)).createMarket(
            "Will OKB close above $40 at 2026-05-28 23:59 UTC?",
            uint64(1748476740), // May 28 23:59 UTC = unix 1748476740
            toolsAve,
            1,
            10e6
        );

        // Market 3: V4 TVL on X Layer
        PythiaHook(payable(hook)).createMarket(
            "Will V4 TVL on X Layer exceed $500K at 2026-05-27 00:00 UTC?",
            uint64(1748304000),
            toolsBoth,
            1,
            10e6
        );

        // Market 4: Social market — demonstrates INVALID path
        PythiaHook(payable(hook)).createMarket(
            "Will @XLayerOfficial post about hooks before 2026-05-28?",
            uint64(1748390400),
            noTools, // no tools → AI returns INVALID honestly
            1,
            10e6
        );

        // Market 5: Self-referential
        PythiaHook(payable(hook)).createMarket(
            "Will the @PythiaMarkets account exceed 100 followers by 2026-05-28 12:00 UTC?",
            uint64(1748433600),
            noTools,
            1,
            10e6
        );

        vm.stopBroadcast();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add contracts/script/04_SeedMarkets.s.sol
git commit -m "feat(deploy): script to seed 5 demo markets per spec §6.4"
```

---

## Phase 2 — Mainnet deploy (Day 4 afternoon)

### Task 2.1: Run the deployment sequence

- [ ] **Step 1: Final pre-flight check**

```bash
# Verify env vars
echo "Deployer: $(cast wallet address $DEPLOYER_PRIVATE_KEY)"
echo "Admin Safe: $ADMIN_SAFE"
echo "Fulfiller primary: $FULFILLER_PRIMARY"

# Verify OKB balances
cast balance $(cast wallet address $DEPLOYER_PRIVATE_KEY) --rpc-url xlayer
cast balance $ADMIN_SAFE --rpc-url xlayer
cast balance $FULFILLER_PRIMARY --rpc-url xlayer

# Verify USDT balance on deployer
cast call $USDT_ADDRESS "balanceOf(address)(uint256)" $(cast wallet address $DEPLOYER_PRIVATE_KEY) --rpc-url xlayer
```

Expected: ≥2 OKB deployer, ≥75 USDT deployer.

- [ ] **Step 2: Deploy provider**

```bash
forge script script/01_DeployProvider.s.sol --rpc-url xlayer --broadcast --slow -vvvv
```

Record the deployed address. Update `.env.deploy`:
```bash
echo "PROVIDER_ADDRESS=0x..." >> .env.deploy
```

- [ ] **Step 3: Mine + deploy hook**

```bash
source .env.deploy  # reload with PROVIDER_ADDRESS
forge script script/02_MineAndDeployHook.s.sol --rpc-url xlayer --broadcast --slow -vvvv
```

Record `HOOK_ADDRESS` and `OUTCOME_MASTER_ADDRESS` from logs. Update `.env.deploy`.

- [ ] **Step 4: Deploy periphery**

```bash
source .env.deploy
forge script script/03_DeployPeriphery.s.sol --rpc-url xlayer --broadcast --slow -vvvv
```

Record `PERIPHERY_ADDRESS`. Update `.env.deploy`.

- [ ] **Step 5: Update spec address book + commit**

Edit `docs/superpowers/specs/2026-05-23-pythia-prediction-market-hook-design.md` §8 with the real addresses. Replace each `0x_______________` with the actual deployed address.

```bash
git add docs/superpowers/specs/2026-05-23-pythia-prediction-market-hook-design.md
git commit -m "docs(spec): populate address book with mainnet deployment addresses"
```

### Task 2.2: Source-verify on OKLink

- [ ] **Step 1: Verify each contract**

```bash
forge verify-contract --chain 196 --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code \
  --etherscan-api-key $OKLINK_API_KEY \
  $PROVIDER_ADDRESS src/PythiaAIProvider.sol:PythiaAIProvider

forge verify-contract --chain 196 --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code \
  --etherscan-api-key $OKLINK_API_KEY \
  $OUTCOME_MASTER_ADDRESS src/OutcomeToken.sol:OutcomeToken

forge verify-contract --chain 196 --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code \
  --etherscan-api-key $OKLINK_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,address)" \
    $POOL_MANAGER $USDT_ADDRESS $PROVIDER_ADDRESS $OUTCOME_MASTER_ADDRESS $ADMIN_SAFE) \
  $HOOK_ADDRESS src/PythiaHook.sol:PythiaHook

forge verify-contract --chain 196 --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code \
  --etherscan-api-key $OKLINK_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address)" \
    $HOOK_ADDRESS $POOL_MANAGER $PERMIT2 $USDT_ADDRESS) \
  $PERIPHERY_ADDRESS src/PythiaPeriphery.sol:PythiaPeriphery
```

If OKLink verification fails (auto-verifier may not support all addresses), use the manual web UI: paste source + ABI at https://www.oklink.com/xlayer/address/$ADDRESS#verify.

- [ ] **Step 2: Confirm green checkmarks on OKLink for all 4 contracts**

Visit:
- `https://www.oklink.com/xlayer/address/$PROVIDER_ADDRESS`
- `https://www.oklink.com/xlayer/address/$HOOK_ADDRESS`
- `https://www.oklink.com/xlayer/address/$OUTCOME_MASTER_ADDRESS`
- `https://www.oklink.com/xlayer/address/$PERIPHERY_ADDRESS`

Expected: each shows source code + "Contract verified" badge.

- [ ] **Step 3: Commit verification confirmation**

Append to DISCOVERY.md:
```markdown
## Deployment — verified on OKLink
- PythiaAIProvider: <link>
- PythiaHook: <link>
- OutcomeToken master: <link>
- PythiaPeriphery: <link>
```

```bash
git add contracts/DISCOVERY.md
git commit -m "docs(deploy): contracts source-verified on OKLink"
```

### Task 2.3: Seed the 5 demo markets

- [ ] **Step 1: Run seed script**

```bash
source .env.deploy
forge script script/04_SeedMarkets.s.sol --rpc-url xlayer --broadcast --slow -vvvv
```

Expected: 5 `MarketCreated` events. Total spend: 75 USDT + ~$0.50 OKB gas.

- [ ] **Step 2: Verify markets on-chain**

```bash
cast call $HOOK_ADDRESS "getMarkets(uint256,uint256)(uint256[])" 0 50 --rpc-url xlayer
```

Expected: array of 5 marketIds (newest first).

- [ ] **Step 3: Trigger resolution on the hero demo market (Market 1) after its 30-min expiry**

Wait until 30 minutes past broadcast. Then:
```bash
# Fetch model 1 price
PRICE=$(cast call $PROVIDER_ADDRESS "getModel(uint256)((string,uint256,bool))" 1 --rpc-url xlayer | head -1)

cast send $HOOK_ADDRESS "requestResolution(uint256)" 1 --value 0.01ether --private-key $DEPLOYER_PRIVATE_KEY --rpc-url xlayer
```

The fulfiller (running from Plan 2) should pick up the event and submit `fulfillReasoning` within ~30s.

- [ ] **Step 4: Verify hero market resolved**

```bash
cast call $HOOK_ADDRESS "marketView(uint256)((address,address,bool,uint64,uint8,address,uint16))" 1 --rpc-url xlayer
```

Expected: status field = 2 (RESOLVED).

```bash
cast call $PROVIDER_ADDRESS "getRequest(uint256)((uint256,address,uint16,uint8,uint64,uint128,uint8,uint8,string))" $(cast call $HOOK_ADDRESS "marketLastRequestId(uint256)(uint256)" 1 --rpc-url xlayer) --rpc-url xlayer
```

Expected: returns the IPFS CID. Open in browser: `https://w3s.link/ipfs/<CID>` — should render JSON trail.

- [ ] **Step 5: Commit deployment artifacts**

```bash
mkdir -p contracts/deployments
cat > contracts/deployments/xlayer-mainnet.json <<EOF
{
  "chainId": 196,
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "PythiaAIProvider": "$PROVIDER_ADDRESS",
  "PythiaHook": "$HOOK_ADDRESS",
  "OutcomeTokenMaster": "$OUTCOME_MASTER_ADDRESS",
  "PythiaPeriphery": "$PERIPHERY_ADDRESS",
  "AdminSafe": "$ADMIN_SAFE",
  "FulfillerPrimary": "$FULFILLER_PRIMARY",
  "FulfillerBackup": "$FULFILLER_BACKUP",
  "seededMarkets": [1, 2, 3, 4, 5]
}
EOF

git add contracts/deployments/
git commit -m "feat(deploy): record X Layer mainnet deployment addresses"
```

---

## Phase 3 — Frontend deployment + fulfiller hosting

### Task 3.1: Deploy fulfiller to a VPS

- [ ] **Step 1: Provision VPS**

Options (any works for hackathon):
- Fly.io machine: `fly launch --no-deploy` + Dockerfile (recommended)
- Hetzner CX22: ~$5/month, SSH in
- Render background worker

Pick one. Document choice in `fulfiller/README.md`.

- [ ] **Step 2: Set environment vars on the VPS**

All vars from `fulfiller/.env.example` (real values).

- [ ] **Step 3: Start the worker**

```bash
# On VPS
cd fulfiller
npm install --production
npm run start
```

For Fly.io: `fly deploy`. For systemd:
```ini
# /etc/systemd/system/pythia-fulfiller.service
[Unit]
Description=Pythia Fulfiller
After=network.target

[Service]
Type=simple
User=pythia
WorkingDirectory=/opt/pythia-fulfiller
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
EnvironmentFile=/opt/pythia-fulfiller/.env

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Confirm uptime via heartbeat**

If `BETTERSTACK_HEARTBEAT_URL` set, verify the monitor shows green.

- [ ] **Step 5: Commit hosting docs**

```bash
git add fulfiller/README.md fulfiller/fly.toml  # if using Fly.io
git commit -m "docs(fulfiller): VPS hosting setup + systemd service file"
```

### Task 3.2: Deploy frontend to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Import in Vercel**

In Vercel dashboard:
- Import the repo
- Set root directory: `frontend`
- Set framework: Next.js (auto-detected)
- Set env vars from `frontend/.env.local.example` (real deployed addresses)
- Deploy

- [ ] **Step 3: Custom domain (optional but recommended)**

Buy `pythia.markets` or similar via Vercel domains. Point at the Vercel deployment.

- [ ] **Step 4: Smoke test live deployment**

Visit live URL:
- Connect with OKX Wallet
- See all 5 seeded markets
- Click hero market → see resolved status + IPFS proof viewer renders
- Try to buy YES on a still-trading market → tx confirms

- [ ] **Step 5: Commit deployment URL to README**

```bash
echo "Live: https://pythia.markets" >> README.md
git add README.md
git commit -m "docs: live deployment URL"
```

---

## Phase 4 — Demo video (Day 5)

### Task 4.1: Pre-recording prep

- [ ] **Step 1: 30 minutes before recording, do a full dry run**

Walk through the exact recording path twice — once silent (camera off) to nail timing, once with narration to check pacing.

Recording path:
1. Open landing page → click "Browse markets"
2. Scroll markets, click Market #1 (hero, already RESOLVED)
3. Show the resolved status + outcome
4. Click "View AI reasoning →"
5. Walk through the IPFS proof: tool call to `ave_token_tool`, thought, final_choice with rationale
6. Back to market, click Redeem (with a wallet that holds YES tokens from earlier)
7. Wallet confirms, USDT lands, toast appears
8. (Optional) Cut to Market 3 to show creation form + trading panel

Target: 2 minutes for primary path, 30s buffer for narration.

- [ ] **Step 2: Confirm fulfiller is running and the hero market is resolved with a valid CID**

```bash
cast call $HOOK_ADDRESS "marketView(uint256)((address,address,bool,uint64,uint8,address,uint16))" 1 --rpc-url xlayer
# Expected status: 2 (RESOLVED)
```

Open the proof CID URL in a browser tab. Confirm it renders without errors.

- [ ] **Step 3: Record**

Use OBS Studio (free, cross-platform) or QuickTime. Settings:
- 1920×1080, 30 fps
- System audio off (focus on narration)
- Microphone test before recording

Record one full take. Don't perfect each take — record 3-5 takes total, pick the best one.

- [ ] **Step 4: Edit lightly**

CapCut or DaVinci Resolve (both free):
- Cut dead time (loading spinners, hesitation)
- Add minimal lower-thirds: "Pythia — AI-resolved prediction markets" intro card, sponsor tags at end
- No music (clean narration only) or very quiet ambient
- Export 1080p, MP4 H.264, ~10-30 MB

- [ ] **Step 5: Upload to YouTube as unlisted**

This gives a stable URL for the submission. Make the video unlisted (not public yet — public after submission).

- [ ] **Step 6: Commit video artifacts**

```bash
mkdir -p demo
# Don't commit the MP4 — too large. Just commit the script + link.
cat > demo/SCRIPT.md <<'EOF'
# Pythia Demo Script (2 min target)

[00:00] Hi, I'm shipping Pythia for the X Layer Hook the Future hackathon.

[00:05] Pythia is a Uniswap V4 hook that IS a prediction market —
the hook itself handles minting, trading, AI resolution, and redemption.

[00:15] Let me show you a market that just resolved.
[click into Market #1]

[00:25] The question was: "Is OKB spot price above $40 at <time>?"
The AI resolved it as YES.

[00:35] Let's see how. [click "View AI reasoning →"]

[00:40] This is pinned to IPFS. You can audit it forever.

[00:45] First, the AI called ave_token_tool to fetch live OKB market data...
[expand tool_call block]

[01:00] Then it called onchain_read_tool to cross-reference.
The two oracles agreed, so it returned YES.

[01:15] Back to the market. Click Redeem.
[wallet confirms]

[01:25] USDT lands in my wallet. 1 YES = 1 USDT.

[01:35] What's novel: every Pythia market gets a verifiable
chain-of-thought on IPFS. The hook is the entire protocol —
not a wrapper around CTF.

[01:55] Built for the Flap ecosystem. ABI-compatible with their
AI Oracle — when Flap deploys on X Layer, our stub goes away
in one line.

[02:05] Thanks for watching. Source on GitHub.

[end]
EOF

cat > demo/VIDEO_URL.md <<'EOF'
Demo video: https://youtube.com/watch?v=YOUR_VIDEO_ID
EOF

git add demo/
git commit -m "docs(demo): video script + URL"
```

---

## Phase 5 — Twitter + submission (Day 5 evening)

### Task 5.1: Twitter content throughout the week

- [ ] **Step 1: Day 1 launch tweet** (already posted on Day 1 per Plan 1)

Verify: "Building @PythiaMarkets for #XLayer Hook the Future hackathon. AI-resolved prediction markets on @Uniswap V4. @XLayerOfficial @flapdotsh @Uniswap" + link to GitHub.

- [ ] **Step 2: Mid-week build-in-public tweets** (Day 2-4)

Post 1-2 per day:
- Day 2: "Just deployed our IFlapAIProvider stub on X Layer mainnet. One-line swap to real Flap when they ship."
- Day 3: "First on-chain AI resolution on X Layer. IPFS reasoning trail attached: <CID>"
- Day 4: "5 demo markets live now. Try them: pythia.markets"

Each tweet: tag `@XLayerOfficial @Uniswap @flapdotsh`. Include screenshot when possible.

- [ ] **Step 3: Day 5 submission announcement tweet**

```
Pythia is live for the @XLayerOfficial Hook the Future hackathon.

→ V4 hook IS the prediction market (mint/trade/resolve/redeem)
→ AI resolves via @flapdotsh-compatible oracle on X Layer
→ Every resolution: verifiable IPFS reasoning trail
→ Live: pythia.markets
→ Demo: <youtube link>

@Uniswap @flapdotsh
```

### Task 5.2: Hackathon Google Form submission

- [ ] **Step 1: Gather submission materials**

Required fields (per hackathon page):
- Project name: Pythia
- Brief description (≤500 chars)
- GitHub repo URL
- Demo video URL (YouTube)
- Deployed contract addresses on X Layer (paste all 4)
- Twitter handle (@PythiaMarkets)
- Team contact (email/Telegram)
- Tagline / one-line pitch

- [ ] **Step 2: Submit**

Submit via the Google Form linked from the hackathon page. **Submit by Day 5 evening (May 27 ~22:00 UTC), NOT at the deadline** — Day 6 is buffer for any issues.

- [ ] **Step 3: Final commit + push**

```bash
cd C:/xLayer-hackathon/uniswapV4Hackthon
git add -A
git commit -m "feat: hackathon submission complete"
git push origin main
```

- [ ] **Step 4: Public-release the YouTube video**

Switch from unlisted → public. Promotes to YouTube algorithm + makes link more shareable.

- [ ] **Step 5: Tag sponsors in submission tweet quote/reply**

Reply to the announcement tweet (Step 3 of Task 5.1) with: "Submitted! @XLayerOfficial @Uniswap @flapdotsh"

---

## Phase 6 — Day 6 (May 28) — buffer + final polish

### Task 6.1: Monitor + final touches

- [ ] **Step 1: Monitor fulfiller, fix any issues**

Check heartbeat. If down, restart on VPS:
```bash
ssh vps "sudo systemctl restart pythia-fulfiller"
```

- [ ] **Step 2: Resolve the May 28 deadline market**

Market #2 expires at 23:59 UTC. After 23:59 + 60s grace, anyone (including you) can call `requestResolution`. Do this — gives judges a freshly-resolved market on submission day.

```bash
cast send $HOOK_ADDRESS "requestResolution(uint256)" 2 --value 0.01ether \
  --private-key $DEPLOYER_PRIVATE_KEY --rpc-url xlayer
```

- [ ] **Step 3: Final social push**

One last tweet thread:
- T1: "Final markets resolving now — @PythiaMarkets is live on X Layer..."
- T2: Screenshots of resolved markets + IPFS proofs
- T3: Thanks to @XLayerOfficial @Uniswap @flapdotsh

- [ ] **Step 4: Sleep**

Hackathon ends 23:59 UTC. Don't fix things at midnight.

---

## Self-Review Checklist

**1. Spec coverage**

- §6.1 Foundry tests — covered by Plan 1
- §6.2 deploy sequence (admin Safe + fulfiller EOAs + provider + hook mining + clones + periphery) — Tasks 1.1–1.3, 2.1 ✓
- §6.3 5-day timeline — Day 4 deploy (Task 2.1), Day 5 demo (Task 4.1), Day 6 buffer (Task 6.1) ✓
- §6.4 seeded markets — Task 1.4 (5 markets matching spec exactly) ✓
- §6.5 risk register — embedded as buffer day + dry-run + heartbeat monitoring ✓
- §1.2 hackathon submission requirements — Task 5.2 ✓
- Twitter presence — Task 5.1 (Day 1 launch + mid-week + announcement) ✓

**2. Placeholder scan**

- `1748476740` and other unix timestamps for seeded market expiries are explicit; verify exact values before broadcasting
- `pythia.markets` domain is aspirational — fall back to Vercel default URL if not purchased
- "Resolve hero market" timing in Task 2.3 Step 3 assumes 30 min has elapsed; executor must wait or set expiry earlier

**3. Type consistency**

- Contract addresses are populated via env vars consistently across all scripts ✓
- Foundry script signatures match contract constructors ✓
- Deployment artifact JSON schema matches frontend `lib/contracts.ts` keys ✓

---

## Execution Handoff

**Plans 1-4 complete.** All four files saved under `docs/superpowers/plans/`:

1. `2026-05-23-pythia-contracts.md` — Smart contracts + Foundry tests
2. `2026-05-23-pythia-fulfiller.md` — Off-chain Node/TS worker
3. `2026-05-23-pythia-frontend.md` — Next.js + wagmi UI
4. `2026-05-23-pythia-deploy-and-demo.md` — Mainnet deploy + demo video + submission

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch fresh subagent per task or per phase. Each plan is independent enough that you can pipeline: contracts subagent runs Day 1-2 while fulfiller plan starts. Frontend subagent can start once Plan 1's ABIs are stable.

**2. Inline Execution** — Execute each plan in sequence in this session.

**Which approach?**
