// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./utils/PythiaFixture.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/contracts/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/contracts/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/contracts/libraries/StateLibrary.sol";
import {PythiaHook} from "../src/PythiaHook.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

contract PythiaHookTest is PythiaFixture {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for PoolManager;

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

    function test_createMarket_pulls_bond_and_seed_and_deploys_clones() public {
        bytes32[] memory tools = _tools();
        uint256 bondAndSeed = 5e6 + 10e6;

        vm.startPrank(alice);
        usdt.approve(address(hook), bondAndSeed);
        uint256 marketId = hook.createMarket(
            "Will OKB > $42 by 2026-05-25 23:59 UTC?", uint64(block.timestamp + 1 days), tools, 1, 10e6
        );
        vm.stopPrank();

        assertEq(marketId, 1);
        assertEq(usdt.balanceOf(alice), 1_000e6 - bondAndSeed);
        assertEq(hook.bond(marketId), 5e6);

        (address yes, address no, bool yesIsCurrency0,,,,) = hook.marketView(marketId);
        assertTrue(yes != address(0) && no != address(0));
        assertTrue(yes != no);
        if (yes < no) assertTrue(yesIsCurrency0);
        else assertFalse(yesIsCurrency0);

        assertEq(OutcomeToken(yes).totalSupply(), 10e6);
        assertEq(OutcomeToken(no).totalSupply(), 10e6);
    }

    function test_createMarket_rejects_long_question() public {
        bytes32[] memory tools = _tools();
        vm.startPrank(alice);
        usdt.approve(address(hook), 100e6);
        string memory tooLong = string(new bytes(281));
        vm.expectRevert(PythiaHook.QuestionTooLong.selector);
        hook.createMarket(tooLong, uint64(block.timestamp + 1 days), tools, 1, 10e6);
        vm.stopPrank();
    }

    function test_createMarket_rejects_unwhitelisted_tool() public {
        bytes32[] memory tools = new bytes32[](1);
        tools[0] = keccak256("not_in_whitelist");

        vm.startPrank(alice);
        usdt.approve(address(hook), 100e6);
        vm.expectRevert(PythiaHook.ToolNotWhitelisted.selector);
        hook.createMarket("q?", uint64(block.timestamp + 1 days), tools, 1, 10e6);
        vm.stopPrank();
    }

    function test_createMarket_rejects_insufficient_initial_liquidity() public {
        bytes32[] memory tools = _tools();
        vm.startPrank(alice);
        usdt.approve(address(hook), 100e6);
        vm.expectRevert(PythiaHook.InsufficientInitialLiquidity.selector);
        hook.createMarket("q?", uint64(block.timestamp + 1 days), tools, 1, 4e6);
        vm.stopPrank();
    }

    function test_admin_can_whitelist_tools_at_deploy() public view {
        assertTrue(hook.allowedTools(keccak256("ave_token_tool")));
        assertTrue(hook.allowedTools(keccak256("ave_token_info")));
        assertTrue(hook.allowedTools(keccak256("onchain_read_tool")));
    }

    function test_pool_liquidity_after_seed() public {
        bytes32[] memory tools = _tools();

        vm.startPrank(alice);
        usdt.approve(address(hook), 15e6);
        uint256 marketId = hook.createMarket("test", uint64(block.timestamp + 1 days), tools, 1, 10e6);
        vm.stopPrank();

        PoolKey memory key = hook.poolKey(marketId);
        PoolId pid = key.toId();
        uint128 liq = StateLibrary.getLiquidity(poolManager, pid);
        assertGt(liq, 0, "pool should have liquidity after seed");
    }

    function _tools() internal pure returns (bytes32[] memory tools) {
        tools = new bytes32[](1);
        tools[0] = keccak256("ave_token_tool");
    }
}
