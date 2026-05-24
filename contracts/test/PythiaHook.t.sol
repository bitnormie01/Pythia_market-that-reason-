// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {PythiaHook} from "../src/PythiaHook.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

contract PythiaHookTest is Test {
    PythiaHook hook;
    OutcomeToken outcomeMaster;

    function setUp() public {
        outcomeMaster = new OutcomeToken();
        hook = new PythiaHook(address(0x1000), address(0x2000), address(0x3000), address(outcomeMaster), address(this));
    }

    function test_scaffold_constants() public view {
        assertEq(hook.POOL_FEE(), 10_000);
        assertEq(hook.TICK_SPACING(), 200);
        assertEq(hook.RESOLUTION_GRACE(), 60);
        assertEq(hook.CHOICE_YES(), 0);
        assertEq(hook.CHOICE_NO(), 1);
        assertEq(hook.CHOICE_INVALID(), 2);
        assertEq(hook.NUM_OF_CHOICES(), 3);
        assertEq(hook.CREATOR_BOND(), 5e6);
        assertEq(hook.MIN_INITIAL_LIQUIDITY(), 5e6);
        assertEq(hook.FORCE_RESOLVE_DELAY(), 7 days);
    }

    function test_hook_permissions_are_before_add_liquidity_and_before_swap_only() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();
        assertFalse(permissions.beforeInitialize);
        assertFalse(permissions.afterInitialize);
        assertTrue(permissions.beforeAddLiquidity);
        assertFalse(permissions.afterAddLiquidity);
        assertFalse(permissions.beforeRemoveLiquidity);
        assertFalse(permissions.afterRemoveLiquidity);
        assertTrue(permissions.beforeSwap);
        assertFalse(permissions.afterSwap);
        assertFalse(permissions.beforeDonate);
        assertFalse(permissions.afterDonate);
        assertFalse(permissions.beforeSwapReturnDelta);
        assertFalse(permissions.afterSwapReturnDelta);
        assertFalse(permissions.afterAddLiquidityReturnDelta);
        assertFalse(permissions.afterRemoveLiquidityReturnDelta);
    }

    function test_lastRequestId_is_zero_for_multi_market_consumer() public view {
        assertEq(hook.lastRequestId(), 0);
    }
}
