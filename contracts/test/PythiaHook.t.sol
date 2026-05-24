// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./utils/PythiaFixture.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/contracts/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/contracts/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/contracts/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/contracts/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/contracts/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/contracts/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/contracts/libraries/StateLibrary.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/contracts/libraries/TransientStateLibrary.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PythiaHook} from "../src/PythiaHook.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

contract PythiaHookTest is PythiaFixture {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for PoolManager;
    using TransientStateLibrary for PoolManager;

    struct SwapCallbackData {
        address sender;
        PoolKey key;
        SwapParams params;
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

    function test_mint_pulls_usdt_and_issues_matched_pair() public {
        (uint256 marketId, address yesT, address noT) = _createDefaultMarket();

        vm.startPrank(bob);
        usdt.approve(address(hook), 50e6);
        hook.mint(marketId, 50e6);
        vm.stopPrank();

        assertEq(OutcomeToken(yesT).balanceOf(bob), 50e6);
        assertEq(OutcomeToken(noT).balanceOf(bob), 50e6);
        assertEq(usdt.balanceOf(bob), 950e6);
    }

    function test_mintFor_routes_to_third_party() public {
        (uint256 marketId, address yesT, address noT) = _createDefaultMarket();
        address recipient = makeAddr("recipient");

        vm.startPrank(bob);
        usdt.approve(address(hook), 30e6);
        hook.mintFor(marketId, recipient, 30e6);
        vm.stopPrank();

        assertEq(OutcomeToken(yesT).balanceOf(recipient), 30e6);
        assertEq(OutcomeToken(noT).balanceOf(recipient), 30e6);
        assertEq(OutcomeToken(yesT).balanceOf(bob), 0);
        assertEq(OutcomeToken(noT).balanceOf(bob), 0);
    }

    function test_mint_reverts_after_expiry_grace() public {
        (uint256 marketId,,) = _createDefaultMarket();
        vm.warp(block.timestamp + 2 days);

        vm.startPrank(bob);
        usdt.approve(address(hook), 10e6);
        vm.expectRevert(PythiaHook.MarketNotTrading.selector);
        hook.mint(marketId, 10e6);
        vm.stopPrank();
    }

    function test_burn_returns_usdt_for_matched_pair() public {
        (uint256 marketId, address yesT, address noT) = _createDefaultMarket();

        vm.startPrank(bob);
        usdt.approve(address(hook), 50e6);
        hook.mint(marketId, 50e6);
        uint256 balBefore = usdt.balanceOf(bob);
        hook.burn(marketId, 20e6);
        vm.stopPrank();

        assertEq(usdt.balanceOf(bob) - balBefore, 20e6);
        assertEq(OutcomeToken(yesT).balanceOf(bob), 30e6);
        assertEq(OutcomeToken(noT).balanceOf(bob), 30e6);
    }

    function test_burn_allowed_after_expiry_before_resolution() public {
        (uint256 marketId, address yesT, address noT) = _createDefaultMarket();

        vm.startPrank(bob);
        usdt.approve(address(hook), 20e6);
        hook.mint(marketId, 20e6);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);

        vm.prank(bob);
        hook.burn(marketId, 7e6);

        assertEq(OutcomeToken(yesT).balanceOf(bob), 13e6);
        assertEq(OutcomeToken(noT).balanceOf(bob), 13e6);
    }

    function test_burn_reverts_after_resolution() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _mintToBob(marketId, 10e6);
        _setResolved(marketId, hook.CHOICE_YES());

        vm.prank(bob);
        vm.expectRevert(PythiaHook.AlreadyResolved.selector);
        hook.burn(marketId, 1e6);
    }

    function test_redeem_yes_returns_usdt_and_creator_bond_once() public {
        (uint256 marketId, address yesT,) = _createDefaultMarket();
        _mintToBob(marketId, 50e6);
        _setResolved(marketId, hook.CHOICE_YES());

        uint256 bobBefore = usdt.balanceOf(bob);
        uint256 aliceBefore = usdt.balanceOf(alice);

        vm.prank(bob);
        hook.redeem(marketId, 20e6);

        assertEq(usdt.balanceOf(bob) - bobBefore, 20e6);
        assertEq(usdt.balanceOf(alice) - aliceBefore, hook.CREATOR_BOND());
        assertEq(hook.bond(marketId), 0);
        assertEq(OutcomeToken(yesT).balanceOf(bob), 30e6);

        vm.prank(bob);
        hook.redeem(marketId, 10e6);

        assertEq(usdt.balanceOf(alice), aliceBefore + hook.CREATOR_BOND());
    }

    function test_redeem_no_returns_usdt() public {
        (uint256 marketId,, address noT) = _createDefaultMarket();
        _mintToBob(marketId, 30e6);
        _setResolved(marketId, hook.CHOICE_NO());

        uint256 bobBefore = usdt.balanceOf(bob);

        vm.prank(bob);
        hook.redeem(marketId, 7e6);

        assertEq(usdt.balanceOf(bob) - bobBefore, 7e6);
        assertEq(OutcomeToken(noT).balanceOf(bob), 23e6);
    }

    function test_redeem_invalid_pays_half_and_forfeits_creator_bond() public {
        (uint256 marketId, address yesT,) = _createDefaultMarket();
        _mintToBob(marketId, 30e6);
        _setResolved(marketId, hook.CHOICE_INVALID());

        uint256 bobBefore = usdt.balanceOf(bob);
        uint256 sinkBefore = usdt.balanceOf(hook.BOND_BURN_SINK());

        vm.prank(bob);
        hook.redeem(marketId, 10e6);

        assertEq(usdt.balanceOf(bob) - bobBefore, 5e6);
        assertEq(usdt.balanceOf(hook.BOND_BURN_SINK()) - sinkBefore, hook.CREATOR_BOND());
        assertEq(hook.bond(marketId), 0);
        assertEq(OutcomeToken(yesT).balanceOf(bob), 20e6);
    }

    function test_redeem_reverts_before_resolution() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _mintToBob(marketId, 10e6);

        vm.prank(bob);
        vm.expectRevert(PythiaHook.MarketNotResolved.selector);
        hook.redeem(marketId, 1e6);
    }

    function test_effectiveStatus_returns_expired_after_grace() public {
        (uint256 marketId,,) = _createDefaultMarket();
        vm.warp(block.timestamp + 1 days + hook.RESOLUTION_GRACE() + 1);

        assertEq(uint8(hook.effectiveStatus(marketId)), uint8(PythiaHook.ExtendedStatus.EXPIRED));
    }

    function test_creator_can_withdraw_seed_after_market_resolved() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _setResolved(marketId, hook.CHOICE_YES());

        uint256 aliceBefore = usdt.balanceOf(alice);

        vm.prank(alice);
        hook.creatorWithdrawSeed(marketId, 1e6);

        assertGt(usdt.balanceOf(alice), aliceBefore);
    }

    function test_creator_withdraw_returns_excess_outcome_tokens_when_pool_skewed() public {
        (uint256 marketId, address yesT, address noT) = _createDefaultMarket();
        _mintToBob(marketId, 50e6);

        PoolKey memory key = hook.poolKey(marketId);
        bool noForYes = Currency.unwrap(key.currency0) == noT;

        vm.prank(bob);
        OutcomeToken(noT).approve(address(this), 5e6);
        _swapExactInput(bob, key, noForYes, 5e6);

        _setResolved(marketId, hook.CHOICE_NO());

        uint256 aliceBefore = usdt.balanceOf(alice);

        vm.prank(alice);
        hook.creatorWithdrawSeed(marketId, 10e6);

        uint256 excessNo = OutcomeToken(noT).balanceOf(alice);
        assertGt(excessNo, 0, "creator should receive excess winning NO");
        assertEq(OutcomeToken(yesT).balanceOf(address(hook)), 0, "hook should not retain YES");
        assertEq(OutcomeToken(noT).balanceOf(address(hook)), 0, "hook should not retain NO");

        uint256 aliceBeforeRedeem = usdt.balanceOf(alice);

        vm.prank(alice);
        hook.redeem(marketId, excessNo);

        assertEq(usdt.balanceOf(alice) - aliceBeforeRedeem, excessNo + hook.CREATOR_BOND());
        assertGt(usdt.balanceOf(alice), aliceBefore);
    }

    function test_non_creator_cannot_withdraw_seed() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _setResolved(marketId, hook.CHOICE_YES());

        vm.prank(bob);
        vm.expectRevert(bytes("only creator"));
        hook.creatorWithdrawSeed(marketId, 1e6);
    }

    function test_creator_cannot_withdraw_seed_before_resolution() public {
        (uint256 marketId,,) = _createDefaultMarket();

        vm.prank(alice);
        vm.expectRevert(PythiaHook.MarketNotResolved.selector);
        hook.creatorWithdrawSeed(marketId, 1e6);
    }

    function _createDefaultMarket() internal returns (uint256 marketId, address yesT, address noT) {
        vm.startPrank(alice);
        usdt.approve(address(hook), 15e6);
        marketId = hook.createMarket("test", uint64(block.timestamp + 1 days), _tools(), 1, 10e6);
        vm.stopPrank();

        (yesT, noT,,,,,) = hook.marketView(marketId);
    }

    function _mintToBob(uint256 marketId, uint256 amount) internal {
        vm.startPrank(bob);
        usdt.approve(address(hook), amount);
        hook.mint(marketId, amount);
        vm.stopPrank();
    }

    function _swapExactInput(address sender, PoolKey memory key, bool zeroForOne, uint256 amountIn) internal {
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        poolManager.unlock(
            abi.encode(
                SwapCallbackData({
                    sender: sender,
                    key: key,
                    params: SwapParams({
                        zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: limit
                    })
                })
            )
        );
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only PoolManager");
        SwapCallbackData memory data = abi.decode(rawData, (SwapCallbackData));
        Currency input = data.params.zeroForOne ? data.key.currency0 : data.key.currency1;
        Currency output = data.params.zeroForOne ? data.key.currency1 : data.key.currency0;
        uint256 amountIn = uint256(-data.params.amountSpecified);

        poolManager.sync(input);
        require(IERC20(Currency.unwrap(input)).transferFrom(data.sender, address(poolManager), amountIn), "swap pay");
        poolManager.settle();

        BalanceDelta delta = poolManager.swap(data.key, data.params, "");
        _takeCredit(output, data.sender);
        _takeCredit(input, data.sender);

        return abi.encode(delta);
    }

    function _takeCredit(Currency currency, address to) internal {
        int256 credit = poolManager.currencyDelta(address(this), currency);
        if (credit > 0) poolManager.take(currency, to, uint256(credit));
    }

    function _setResolved(uint256 marketId, uint8 choice) internal {
        bytes32 base = keccak256(abi.encode(marketId, uint256(2)));

        bytes32 statusSlot = bytes32(uint256(base) + 3);
        uint256 packedStatus = uint256(vm.load(address(hook), statusSlot));
        packedStatus =
            (packedStatus & ~(uint256(0xff) << 16)) | (uint256(uint8(PythiaHook.MarketStatus.RESOLVED)) << 16);
        vm.store(address(hook), statusSlot, bytes32(packedStatus));

        bytes32 choiceSlot = bytes32(uint256(base) + 8);
        uint256 packedChoice = uint256(vm.load(address(hook), choiceSlot));
        packedChoice = (packedChoice & ~(uint256(0xff) << 160)) | (uint256(choice) << 160);
        vm.store(address(hook), choiceSlot, bytes32(packedChoice));
    }

    function _tools() internal pure returns (bytes32[] memory tools) {
        tools = new bytes32[](1);
        tools[0] = keccak256("ave_token_tool");
    }
}
