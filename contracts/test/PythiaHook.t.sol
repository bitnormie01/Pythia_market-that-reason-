// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./utils/PythiaFixture.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/contracts/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/contracts/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/contracts/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/contracts/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/contracts/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/contracts/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/contracts/libraries/StateLibrary.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/contracts/libraries/TransientStateLibrary.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PythiaHook} from "../src/PythiaHook.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {IFlapAIProvider} from "../src/interfaces/IFlapAIProvider.sol";

contract PythiaHookTest is PythiaFixture {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for PoolManager;
    using TransientStateLibrary for PoolManager;

    uint8 private constant TEST_OP_SWAP = 1;
    uint8 private constant TEST_OP_ADD_LIQUIDITY = 2;

    struct SwapCallbackData {
        address sender;
        PoolKey key;
        SwapParams params;
    }

    struct ModifyLiquidityCallbackData {
        address sender;
        PoolKey key;
        ModifyLiquidityParams params;
    }

    event ResolutionRequested(uint256 indexed marketId, uint256 indexed requestId, address indexed requester);
    event Resolved(uint256 indexed marketId, uint8 choice, string reasoningCid);
    event RefundEscrowed(uint256 indexed requestId, address indexed requester, uint256 amount);
    event OrphanRefundDelivered(uint256 indexed requestId, address indexed requester, uint256 amount);
    event ForceResolved(uint256 indexed marketId, uint8 choice, address indexed admin);
    event StaleBondClaimed(uint256 indexed marketId, address indexed creator, uint256 amount);

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

    function test_createMarket_rejects_disabled_model() public {
        IFlapAIProvider.Model memory disabled =
            IFlapAIProvider.Model({name: "disabled", price: 0.01 ether, enabled: false});
        vm.mockCall(
            address(provider),
            abi.encodeWithSelector(IFlapAIProvider.getModel.selector, uint256(1)),
            abi.encode(disabled)
        );

        vm.startPrank(alice);
        usdt.approve(address(hook), 15e6);
        vm.expectRevert(bytes("model disabled"));
        hook.createMarket("q?", uint64(block.timestamp + 1 days), _tools(), 1, 10e6);
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

    function test_seed_succeeds_inside_creator_lp_window() public {
        uint256 startBlock = block.number;
        (uint256 marketId,,) = _createDefaultMarket();

        assertEq(hook._creatorLpWindowEnd(marketId), startBlock + 60);
        PoolKey memory key = hook.poolKey(marketId);
        assertGt(StateLibrary.getLiquidity(poolManager, key.toId()), 0, "seed should bypass creator-only window");
    }

    function test_poolIdToMarketId_tracks_created_market() public {
        (uint256 marketId,,) = _createDefaultMarket();
        PoolKey memory key = hook.poolKey(marketId);

        assertEq(hook.poolIdToMarketId(key.toId()), marketId);
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

    function test_redeem_invalid_auto_splits_yes_and_no_balances() public {
        (uint256 marketId, address yesT, address noT) = _createDefaultMarket();
        _mintToBob(marketId, 30e6);
        _setResolved(marketId, hook.CHOICE_INVALID());

        vm.prank(bob);
        OutcomeToken(yesT).transfer(alice, 20e6);

        uint256 bobBefore = usdt.balanceOf(bob);

        vm.prank(bob);
        hook.redeem(marketId, 20e6);

        assertEq(usdt.balanceOf(bob) - bobBefore, 10e6);
        assertEq(OutcomeToken(yesT).balanceOf(bob), 0);
        assertEq(OutcomeToken(noT).balanceOf(bob), 20e6);
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

    function test_beforeSwap_reverts_post_expiry() public {
        (uint256 marketId,, address noT) = _createDefaultMarket();
        _mintToBob(marketId, 10e6);
        PoolKey memory key = hook.poolKey(marketId);
        bool noForYes = Currency.unwrap(key.currency0) == noT;

        vm.warp(block.timestamp + 1 days + hook.RESOLUTION_GRACE() + 1);

        vm.prank(bob);
        OutcomeToken(noT).approve(address(this), 1e6);
        vm.expectRevert();
        _swapExactInput(bob, key, noForYes, 1e6);
    }

    function test_beforeAddLiquidity_reverts_post_expiry() public {
        (uint256 marketId,,) = _createDefaultMarket();
        PoolKey memory key = hook.poolKey(marketId);
        _mintToThis(marketId, 20e6);

        vm.warp(block.timestamp + 1 days + hook.RESOLUTION_GRACE() + 1);

        vm.expectRevert();
        _addLiquidity(address(this), key, 1e6, bytes32(uint256(1001)));
    }

    function test_beforeAddLiquidity_blocks_non_creator_during_window() public {
        (uint256 marketId,,) = _createDefaultMarket();
        PoolKey memory key = hook.poolKey(marketId);
        _mintToThis(marketId, 20e6);

        vm.expectRevert();
        _addLiquidity(address(this), key, 1e6, bytes32(uint256(1002)));
    }

    function test_beforeAddLiquidity_allows_creator_during_window() public {
        (uint256 marketId,,) = _createMarketFromThis();
        PoolKey memory key = hook.poolKey(marketId);
        _mintToThis(marketId, 20e6);
        uint128 beforeLiq = StateLibrary.getLiquidity(poolManager, key.toId());

        _addLiquidity(address(this), key, 1e6, bytes32(uint256(1003)));

        assertGt(StateLibrary.getLiquidity(poolManager, key.toId()), beforeLiq);
    }

    function test_beforeAddLiquidity_allows_anyone_after_window() public {
        (uint256 marketId,,) = _createDefaultMarket();
        PoolKey memory key = hook.poolKey(marketId);
        _mintToThis(marketId, 20e6);
        uint128 beforeLiq = StateLibrary.getLiquidity(poolManager, key.toId());

        vm.roll(block.number + 60);
        _addLiquidity(address(this), key, 1e6, bytes32(uint256(1004)));

        assertGt(StateLibrary.getLiquidity(poolManager, key.toId()), beforeLiq);
    }

    function test_requestResolution_reverts_before_expiry_plus_grace() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 price = _modelPrice();
        vm.deal(bob, price);

        vm.prank(bob);
        vm.expectRevert(PythiaHook.NotYetExpired.selector);
        hook.requestResolution{value: price}(marketId);
    }

    function test_requestResolution_reverts_with_insufficient_okb() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _warpExpired();
        uint256 price = _modelPrice();
        vm.deal(bob, price - 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PythiaHook.InsufficientResolutionFee.selector, price - 1, price));
        hook.requestResolution{value: price - 1}(marketId);
    }

    function test_requestResolution_creates_provider_request_after_expiry() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 price = _modelPrice();
        _warpExpired();
        vm.deal(bob, price);

        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(hook));
        emit ResolutionRequested(marketId, 1, bob);
        uint256 requestId = hook.requestResolution{value: price}(marketId);

        assertEq(requestId, 1);
        assertEq(hook.requestIdToMarketId(requestId), marketId);
        assertEq(hook.requestIdToRequester(requestId), bob);
        assertEq(hook.marketLastRequestId(marketId), requestId);
        assertEq(hook.pendingRequestCount(), 1);
        uint256[] memory pending = hook.pendingRequestIds();
        assertEq(pending.length, 1);
        assertEq(pending[0], requestId);

        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.RESOLVING));

        IFlapAIProvider.RequestView memory req = provider.getRequest(requestId);
        assertEq(req.consumer, address(hook));
        assertEq(req.modelId, 1);
        assertEq(req.numOfChoices, hook.NUM_OF_CHOICES());
        assertEq(uint8(req.status), uint8(IFlapAIProvider.RequestStatus.PENDING));
        assertEq(req.feePaid, price);
    }

    function test_requestResolution_refunds_excess_okb() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 price = _modelPrice();
        uint256 sent = price + 1 ether;
        _warpExpired();
        vm.deal(bob, sent);

        vm.prank(bob);
        hook.requestResolution{value: sent}(marketId);

        assertEq(bob.balance, sent - price);
        assertEq(address(hook).balance, 0);
        assertEq(address(provider).balance, price);
    }

    function test_fulfillReasoning_marks_market_RESOLVED_and_stores_cid_in_event() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 requestId = _requestResolutionFrom(bob, marketId, _modelPrice());
        string memory cid = "ipfs://reasoning-cid";
        uint8 choice = hook.CHOICE_YES();

        vm.expectEmit(true, false, false, true, address(hook));
        emit Resolved(marketId, choice, cid);
        vm.prank(fulfiller);
        provider.fulfillReasoning(requestId, choice, cid);

        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.RESOLVED));
        assertEq(hook.requestIdToMarketId(requestId), 0);
        assertEq(hook.requestIdToRequester(requestId), address(0));
        assertEq(hook.marketLastRequestId(marketId), requestId);
        assertEq(hook.pendingRequestCount(), 0);

        IFlapAIProvider.RequestView memory req = provider.getRequest(requestId);
        assertEq(uint8(req.status), uint8(IFlapAIProvider.RequestStatus.FULFILLED));
        assertEq(req.choice, choice);
        assertEq(req.reasoningCid, cid);
    }

    function test_fulfillReasoning_does_not_revert_even_if_internal_logic_throws() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 requestId = _requestResolutionFrom(bob, marketId, _modelPrice());

        vm.prank(address(provider));
        hook.fulfillReasoning(requestId, 99);

        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.RESOLVING));
        assertEq(hook.requestIdToMarketId(requestId), marketId);
        assertEq(hook.pendingRequestCount(), 1);
    }

    function test_onFlapAIRequestRefunded_resets_to_TRADING_and_routes_okb() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 price = _modelPrice();
        uint256 requestId = _requestResolutionFrom(bob, marketId, price);
        uint256 bobBefore = bob.balance;

        vm.prank(fulfiller);
        provider.refundRequest(requestId);

        assertEq(bob.balance - bobBefore, price);
        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.TRADING));
        assertEq(hook.requestIdToMarketId(requestId), 0);
        assertEq(hook.requestIdToRequester(requestId), address(0));
        assertEq(hook.marketLastRequestId(marketId), 0);
        assertEq(hook.pendingRequestCount(), 0);
        IFlapAIProvider.RequestView memory req = provider.getRequest(requestId);
        assertEq(uint8(req.status), uint8(IFlapAIProvider.RequestStatus.REFUNDED));
    }

    function test_onFlapAIRequestRefunded_escrows_when_requester_call_fails() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 price = _modelPrice();
        _warpExpired();
        RevertingRequester requester = new RevertingRequester();
        vm.deal(address(requester), price);

        uint256 requestId = requester.requestResolution{value: price}(hook, marketId);

        vm.prank(fulfiller);
        vm.expectEmit(true, true, false, true, address(hook));
        emit RefundEscrowed(requestId, address(requester), price);
        provider.refundRequest(requestId);

        assertEq(address(hook).balance, price);
        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.TRADING));
        assertEq(hook.pendingRequestCount(), 0);

        uint256 receiverBefore = feeReceiver.balance;
        vm.prank(admin);
        hook.sweepOkb(payable(feeReceiver));
        assertEq(feeReceiver.balance - receiverBefore, price);
        assertEq(address(hook).balance, 0);
    }

    function test_forceResolve_after_7_days_in_RESOLVING() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 requestId = _requestResolutionFrom(bob, marketId, _modelPrice());
        uint8 choice = hook.CHOICE_NO();

        vm.warp(block.timestamp + hook.FORCE_RESOLVE_DELAY() + 1);

        vm.expectEmit(true, false, true, true, address(hook));
        emit ForceResolved(marketId, choice, admin);
        vm.prank(admin);
        hook.forceResolve(marketId, choice);

        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.RESOLVED));
        assertEq(hook.requestIdToMarketId(requestId), 0);
        assertEq(hook.requestIdToRequester(requestId), bob);
        assertEq(hook.marketLastRequestId(marketId), requestId);
        assertEq(hook.pendingRequestCount(), 0);
    }

    function test_forceResolve_when_provider_reports_UNDELIVERED() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 requestId = _requestResolutionFrom(bob, marketId, _modelPrice());
        uint8 choice = hook.CHOICE_INVALID();
        _setProviderRequestStatus(requestId, IFlapAIProvider.RequestStatus.UNDELIVERED);

        vm.prank(admin);
        hook.forceResolve(marketId, choice);

        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.RESOLVED));
        assertEq(hook.requestIdToMarketId(requestId), 0);
        assertEq(hook.requestIdToRequester(requestId), bob);
        assertEq(hook.marketLastRequestId(marketId), requestId);
        assertEq(hook.pendingRequestCount(), 0);
    }

    function test_orphan_refund_routes_to_original_requester_after_forceResolve() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint256 price = _modelPrice();
        uint256 requestId = _requestResolutionFrom(bob, marketId, price);
        uint8 choice = hook.CHOICE_YES();

        vm.warp(block.timestamp + hook.FORCE_RESOLVE_DELAY() + 1);
        vm.prank(admin);
        hook.forceResolve(marketId, choice);

        uint256 bobBefore = bob.balance;

        vm.expectEmit(true, true, false, true, address(hook));
        emit OrphanRefundDelivered(requestId, bob, price);
        vm.prank(fulfiller);
        provider.refundRequest(requestId);

        assertEq(bob.balance - bobBefore, price);
        assertEq(hook.requestIdToRequester(requestId), address(0));
        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.RESOLVED));
    }

    function test_forceResolve_reverts_before_conditions_met() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _requestResolutionFrom(bob, marketId, _modelPrice());
        uint8 choice = hook.CHOICE_YES();

        vm.expectRevert(PythiaHook.ForceResolveUnavailable.selector);
        vm.prank(admin);
        hook.forceResolve(marketId, choice);
    }

    function test_forceResolve_admin_only() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _requestResolutionFrom(bob, marketId, _modelPrice());
        uint8 choice = hook.CHOICE_YES();
        vm.warp(block.timestamp + hook.FORCE_RESOLVE_DELAY() + 1);

        vm.expectRevert();
        vm.prank(bob);
        hook.forceResolve(marketId, choice);
    }

    function test_forceResolve_resolves_never_RESOLVING_expired_market_after_delay() public {
        (uint256 marketId,,) = _createDefaultMarket();
        uint8 choice = hook.CHOICE_NO();

        _warpExpired();
        vm.warp(block.timestamp + hook.FORCE_RESOLVE_DELAY() + 1);

        vm.prank(admin);
        hook.forceResolve(marketId, choice);

        (,,,, PythiaHook.MarketStatus status,,) = hook.marketView(marketId);
        assertEq(uint8(status), uint8(PythiaHook.MarketStatus.RESOLVED));
        assertEq(hook.marketLastRequestId(marketId), 0);
        assertEq(hook.pendingRequestCount(), 0);
    }

    function test_getMarkets_returns_newest_first() public {
        (uint256 first,,) = _createDefaultMarket();
        (uint256 second,,) = _createDefaultMarket();
        (uint256 third,,) = _createDefaultMarket();

        uint256[] memory ids = hook.getMarkets(0, 3);

        assertEq(ids.length, 3);
        assertEq(ids[0], third);
        assertEq(ids[1], second);
        assertEq(ids[2], first);
    }

    function test_getMarkets_handles_offset_and_limit_clamping() public {
        (uint256 first,,) = _createDefaultMarket();
        (uint256 second,,) = _createDefaultMarket();
        _createDefaultMarket();

        uint256[] memory one = hook.getMarkets(1, 1);
        assertEq(one.length, 1);
        assertEq(one[0], second);

        uint256[] memory clamped = hook.getMarkets(1, 5);
        assertEq(clamped.length, 2);
        assertEq(clamped[0], second);
        assertEq(clamped[1], first);

        uint256[] memory emptyPastEnd = hook.getMarkets(3, 2);
        assertEq(emptyPastEnd.length, 0);

        uint256[] memory emptyLimit = hook.getMarkets(0, 0);
        assertEq(emptyLimit.length, 0);
    }

    function test_creator_can_withdraw_seed_after_market_resolved() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _setResolved(marketId, hook.CHOICE_YES());

        uint256 aliceBefore = usdt.balanceOf(alice);

        vm.prank(alice);
        hook.creatorWithdrawSeed(marketId, 1e6);

        assertGt(usdt.balanceOf(alice), aliceBefore);
    }

    function test_creatorWithdrawSeed_settles_bond_to_creator_on_yes_no_win() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _setResolved(marketId, hook.CHOICE_YES());

        uint256 aliceBefore = usdt.balanceOf(alice);

        vm.prank(alice);
        hook.creatorWithdrawSeed(marketId, 1e6);

        assertEq(hook.bond(marketId), 0);
        assertGe(usdt.balanceOf(alice) - aliceBefore, hook.CREATOR_BOND());
    }

    function test_creatorWithdrawSeed_burns_bond_on_INVALID() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _setResolved(marketId, hook.CHOICE_INVALID());

        uint256 sinkBefore = usdt.balanceOf(hook.BOND_BURN_SINK());

        vm.prank(alice);
        hook.creatorWithdrawSeed(marketId, 1e6);

        assertEq(hook.bond(marketId), 0);
        assertEq(usdt.balanceOf(hook.BOND_BURN_SINK()) - sinkBefore, hook.CREATOR_BOND());
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

        assertEq(usdt.balanceOf(alice) - aliceBeforeRedeem, excessNo);
        assertGt(usdt.balanceOf(alice), aliceBefore);
    }

    function test_claimStaleBond_returns_bond_to_creator() public {
        (uint256 marketId,,) = _createDefaultMarket();
        _setResolved(marketId, hook.CHOICE_YES());
        vm.warp(block.timestamp + 31 days);

        uint256 creatorBond = hook.CREATOR_BOND();
        uint256 aliceBefore = usdt.balanceOf(alice);

        vm.expectEmit(true, true, false, true, address(hook));
        emit StaleBondClaimed(marketId, alice, creatorBond);
        vm.prank(admin);
        hook.claimStaleBond(marketId);

        assertEq(usdt.balanceOf(alice) - aliceBefore, creatorBond);
        assertEq(hook.bond(marketId), 0);
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

    function _createMarketFromThis() internal returns (uint256 marketId, address yesT, address noT) {
        usdt.mint(address(this), 100e6);
        usdt.approve(address(hook), 15e6);
        marketId = hook.createMarket("test", uint64(block.timestamp + 1 days), _tools(), 1, 10e6);

        (yesT, noT,,,,,) = hook.marketView(marketId);
    }

    function _mintToBob(uint256 marketId, uint256 amount) internal {
        vm.startPrank(bob);
        usdt.approve(address(hook), amount);
        hook.mint(marketId, amount);
        vm.stopPrank();
    }

    function _mintToThis(uint256 marketId, uint256 amount) internal {
        usdt.mint(address(this), amount);
        usdt.approve(address(hook), amount);
        hook.mintFor(marketId, address(this), amount);
    }

    function _requestResolutionFrom(address requester, uint256 marketId, uint256 price)
        internal
        returns (uint256 requestId)
    {
        _warpExpired();
        vm.deal(requester, price);
        vm.prank(requester);
        requestId = hook.requestResolution{value: price}(marketId);
    }

    function _modelPrice() internal view returns (uint256) {
        return provider.getModel(1).price;
    }

    function _warpExpired() internal {
        vm.warp(block.timestamp + 1 days + hook.RESOLUTION_GRACE() + 1);
    }

    function _swapExactInput(address sender, PoolKey memory key, bool zeroForOne, uint256 amountIn) internal {
        uint160 limit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        poolManager.unlock(
            abi.encode(
                TEST_OP_SWAP,
                abi.encode(
                    SwapCallbackData({
                        sender: sender,
                        key: key,
                        params: SwapParams({
                            zeroForOne: zeroForOne, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: limit
                        })
                    })
                )
            )
        );
    }

    function _addLiquidity(address sender, PoolKey memory key, uint128 liquidity, bytes32 salt) internal {
        poolManager.unlock(
            abi.encode(
                TEST_OP_ADD_LIQUIDITY,
                abi.encode(
                    ModifyLiquidityCallbackData({
                        sender: sender,
                        key: key,
                        params: ModifyLiquidityParams({
                            tickLower: -887200,
                            tickUpper: 887200,
                            liquidityDelta: int256(uint256(liquidity)),
                            salt: salt
                        })
                    })
                )
            )
        );
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only PoolManager");
        (uint8 op, bytes memory data) = abi.decode(rawData, (uint8, bytes));
        if (op == TEST_OP_SWAP) return _unlockSwap(abi.decode(data, (SwapCallbackData)));
        if (op == TEST_OP_ADD_LIQUIDITY) return _unlockAddLiquidity(abi.decode(data, (ModifyLiquidityCallbackData)));
        revert("bad test op");
    }

    function _unlockSwap(SwapCallbackData memory data) internal returns (bytes memory) {
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

    function _unlockAddLiquidity(ModifyLiquidityCallbackData memory data) internal returns (bytes memory) {
        (BalanceDelta delta,) = poolManager.modifyLiquidity(data.key, data.params, "");
        _settleOrTake(data.key.currency0, delta.amount0(), data.sender);
        _settleOrTake(data.key.currency1, delta.amount1(), data.sender);

        return abi.encode(delta);
    }

    function _takeCredit(Currency currency, address to) internal {
        int256 credit = poolManager.currencyDelta(address(this), currency);
        if (credit > 0) poolManager.take(currency, to, uint256(credit));
    }

    function _settleOrTake(Currency currency, int128 delta, address payer) internal {
        if (delta < 0) {
            uint256 amount = uint256(uint128(-delta));
            poolManager.sync(currency);
            if (payer == address(this)) IERC20(Currency.unwrap(currency)).transfer(address(poolManager), amount);
            else IERC20(Currency.unwrap(currency)).transferFrom(payer, address(poolManager), amount);
            poolManager.settle();
        } else if (delta > 0) {
            poolManager.take(currency, payer, uint256(uint128(delta)));
        }
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

    function _setProviderRequestStatus(uint256 requestId, IFlapAIProvider.RequestStatus status) internal {
        bytes32 base = keccak256(abi.encode(requestId, uint256(2)));
        bytes32 statusSlot = bytes32(uint256(base) + 1);
        uint256 packed = uint256(vm.load(address(provider), statusSlot));
        packed = (packed & ~(uint256(0xff) << 128)) | (uint256(uint8(status)) << 128);
        vm.store(address(provider), statusSlot, bytes32(packed));
    }

    function _tools() internal pure returns (bytes32[] memory tools) {
        tools = new bytes32[](1);
        tools[0] = keccak256("ave_token_tool");
    }
}

contract RevertingRequester {
    function requestResolution(PythiaHook hook, uint256 marketId) external payable returns (uint256) {
        return hook.requestResolution{value: msg.value}(marketId);
    }

    receive() external payable {
        revert("no receive");
    }
}
