// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PythiaHook} from "../src/PythiaHook.sol";

contract SeedMarkets is Script {
    uint16 constant SONNET_MODEL_ID = 1;
    uint256 constant SEED_LIQUIDITY = 10e6;
    uint256 constant MARKETS_TO_SEED = 5;

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

        IERC20(usdt).approve(hook, MARKETS_TO_SEED * (PythiaHook(payable(hook)).CREATOR_BOND() + SEED_LIQUIDITY));

        PythiaHook(payable(hook)).createMarket(
            "Is OKB spot price above $40 at this market's expiry timestamp?",
            uint64(block.timestamp + 75 minutes),
            toolsBoth,
            SONNET_MODEL_ID,
            SEED_LIQUIDITY
        );

        PythiaHook(payable(hook)).createMarket(
            "Will OKB close above $40 at 2026-05-28 23:59 UTC?",
            1780012740,
            toolsAve,
            SONNET_MODEL_ID,
            SEED_LIQUIDITY
        );

        PythiaHook(payable(hook)).createMarket(
            "Will V4 TVL on X Layer exceed $500K at 2026-05-27 00:00 UTC?",
            1779840000,
            toolsBoth,
            SONNET_MODEL_ID,
            SEED_LIQUIDITY
        );

        PythiaHook(payable(hook)).createMarket(
            "Will @XLayerOfficial post about hooks before 2026-05-28?",
            1779926400,
            noTools,
            SONNET_MODEL_ID,
            SEED_LIQUIDITY
        );

        PythiaHook(payable(hook)).createMarket(
            "Will the @PythiaMarkets account exceed 100 followers by 2026-05-28 12:00 UTC?",
            1779969600,
            noTools,
            SONNET_MODEL_ID,
            SEED_LIQUIDITY
        );

        vm.stopBroadcast();
    }
}
