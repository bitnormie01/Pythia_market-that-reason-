// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/contracts/PoolManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/contracts/utils/HookMiner.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {PythiaHook} from "../../src/PythiaHook.sol";
import {PythiaAIProvider} from "../../src/PythiaAIProvider.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";
import {MockUSDT} from "./MockUSDT.sol";

contract PythiaFixture is Test {
    PoolManager public poolManager;
    PythiaHook public hook;
    PythiaAIProvider public provider;
    OutcomeToken public outcomeMaster;
    MockUSDT public usdt;

    address admin = makeAddr("admin");
    address fulfiller = makeAddr("fulfiller");
    address feeReceiver = makeAddr("feeReceiver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public virtual {
        poolManager = new PoolManager(admin);
        outcomeMaster = new OutcomeToken();
        usdt = new MockUSDT();

        vm.prank(admin);
        provider = new PythiaAIProvider(admin, fulfiller, feeReceiver);

        uint160 flags = uint160(Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG);
        (address hookAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(PythiaHook).creationCode,
            abi.encode(address(poolManager), address(usdt), address(provider), address(outcomeMaster), admin)
        );

        hook = new PythiaHook{salt: salt}(
            address(poolManager), address(usdt), address(provider), address(outcomeMaster), admin
        );
        require(address(hook) == hookAddr, "hook address mismatch");

        usdt.mint(alice, 1_000e6);
        usdt.mint(bob, 1_000e6);
    }
}
