# Pythia Contracts

Foundry workspace for the Pythia X Layer prediction-market contracts.

## Dependencies

Install Solidity package dependencies through npm:

```shell
npm install
```

`@uniswap/permit2` is pinned as a GitHub tarball dependency because it is not published to npm.

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/<script>.s.sol --rpc-url xlayer --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
