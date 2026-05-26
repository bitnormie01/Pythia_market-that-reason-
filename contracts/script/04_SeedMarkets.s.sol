// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PythiaHook} from "../src/PythiaHook.sol";

contract SeedMarkets is Script {
    uint16 constant CHEAP_DGRID_MODEL_ID = 0;
    uint256 constant SEED_LIQUIDITY = 5e6;   // 5 USDT — equal to the hook's MIN_INITIAL_LIQUIDITY
    uint256 constant MARKETS_TO_SEED = 2;    // hero + backup; reduces mainnet capital requirement to ~20 USDT

    function run() external {
        address hook = vm.envAddress("HOOK_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");

        bytes32[] memory toolsAve = new bytes32[](1);
        toolsAve[0] = keccak256("ave_token_tool");

        bytes32[] memory toolsBoth = new bytes32[](2);
        toolsBoth[0] = keccak256("ave_token_tool");
        toolsBoth[1] = keccak256("onchain_read_tool");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        IERC20(usdt).approve(hook, MARKETS_TO_SEED * (PythiaHook(payable(hook)).CREATOR_BOND() + SEED_LIQUIDITY));

        // Market 1 (hero, demo-day live resolution target):
        PythiaHook(payable(hook)).createMarket(
            "Is OKB spot price above $40 at this market's expiry timestamp?",
            uint64(block.timestamp + 75 minutes),
            toolsBoth,
            CHEAP_DGRID_MODEL_ID,
            SEED_LIQUIDITY
        );

        // Market 2 (backup, fixed absolute expiry at hackathon deadline):
        PythiaHook(payable(hook)).createMarket(
            "Will OKB close above $40 at 2026-05-28 23:59 UTC?",
            1780012740,
            toolsAve,
            CHEAP_DGRID_MODEL_ID,
            SEED_LIQUIDITY
        );

        vm.stopBroadcast();
    }
}
