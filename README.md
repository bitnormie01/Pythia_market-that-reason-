# Pythia

Pythia is an AI-resolved prediction-market hook for Uniswap v4 on X Layer.

## Deployment

Plan A for the hackathon submission deploys infrastructure contracts on X Layer
mainnet and intentionally stops before seeding markets. The demo video is
recorded against a local Anvil fork, while the live frontend points at the
mainnet contracts and lets users create markets on demand.

Mainnet broadcast sequence:

```bash
cd contracts
source ../.env.deploy

forge script script/01_DeployProvider.s.sol --rpc-url xlayer --broadcast --slow -vvvv
forge script script/02_MineAndDeployHook.s.sol --rpc-url xlayer --broadcast --slow -vvvv
forge script script/03_DeployPeriphery.s.sol --rpc-url xlayer --broadcast --slow -vvvv
```

Record the deployed provider, hook, outcome-token master, and periphery
addresses from the script logs, then populate the frontend environment variables
before deploying the web app.

`script/04_SeedMarkets.s.sol` remains available as an optional post-launch step.
It is skipped for the hackathon submission and should only be broadcast if
seeding mainnet markets with creator-side USDT capital is desired.
