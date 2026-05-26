// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./utils/PythiaFixture.sol";
import {PythiaPeriphery} from "../src/PythiaPeriphery.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";

contract PythiaPeripheryTest is PythiaFixture {
    PythiaPeriphery periphery;
    uint256 yesCurrency0Market;
    uint256 yesCurrency1Market;

    function setUp() public override {
        super.setUp();
        periphery = new PythiaPeriphery(address(hook), address(poolManager), address(0x2222), address(usdt));
        usdt.mint(alice, 20_000e6);
        _createMarketsForBothDirections();
    }

    function test_buyYes_handles_yes_currency0() public {
        _assertBuyYes(yesCurrency0Market, true);
    }

    function test_buyYes_handles_yes_currency1() public {
        _assertBuyYes(yesCurrency1Market, false);
    }

    function test_buyNo_handles_yes_currency0() public {
        _assertBuyNo(yesCurrency0Market, true);
    }

    function test_buyNo_handles_yes_currency1() public {
        _assertBuyNo(yesCurrency1Market, false);
    }

    function test_sellYes_handles_yes_currency0() public {
        _assertSellYes(yesCurrency0Market, true);
    }

    function test_sellYes_handles_yes_currency1() public {
        _assertSellYes(yesCurrency1Market, false);
    }

    function test_sellNo_handles_yes_currency0() public {
        _assertSellNo(yesCurrency0Market, true);
    }

    function test_sellNo_handles_yes_currency1() public {
        _assertSellNo(yesCurrency1Market, false);
    }

    function _assertBuyYes(uint256 marketId, bool expectedYesIsCurrency0) internal {
        (address yesT, address noT, bool yesIsCurrency0,,,,) = hook.marketView(marketId);
        assertEq(yesIsCurrency0, expectedYesIsCurrency0);

        uint256 usdtIn = 5e6;
        uint256 beforeYes = OutcomeToken(yesT).balanceOf(bob);

        vm.startPrank(bob);
        usdt.approve(address(periphery), usdtIn);
        uint256 yesOut = periphery.buyYes(marketId, usdtIn, usdtIn);
        vm.stopPrank();

        assertEq(OutcomeToken(yesT).balanceOf(bob) - beforeYes, yesOut);
        assertGt(yesOut, usdtIn);
        assertEq(OutcomeToken(noT).balanceOf(bob), 0);
        _assertNoPeripheryDust(yesT, noT);
    }

    function _assertBuyNo(uint256 marketId, bool expectedYesIsCurrency0) internal {
        (address yesT, address noT, bool yesIsCurrency0,,,,) = hook.marketView(marketId);
        assertEq(yesIsCurrency0, expectedYesIsCurrency0);

        uint256 usdtIn = 5e6;
        uint256 beforeNo = OutcomeToken(noT).balanceOf(bob);

        vm.startPrank(bob);
        usdt.approve(address(periphery), usdtIn);
        uint256 noOut = periphery.buyNo(marketId, usdtIn, usdtIn);
        vm.stopPrank();

        assertEq(OutcomeToken(noT).balanceOf(bob) - beforeNo, noOut);
        assertGt(noOut, usdtIn);
        assertEq(OutcomeToken(yesT).balanceOf(bob), 0);
        _assertNoPeripheryDust(yesT, noT);
    }

    function _assertSellYes(uint256 marketId, bool expectedYesIsCurrency0) internal {
        (address yesT, address noT, bool yesIsCurrency0,,,,) = hook.marketView(marketId);
        assertEq(yesIsCurrency0, expectedYesIsCurrency0);

        uint256 yesOut = _buyYesForBob(marketId, 5e6);
        uint256 sellAmount = yesOut / 2;
        uint256 usdtBefore = usdt.balanceOf(bob);

        vm.startPrank(bob);
        OutcomeToken(yesT).approve(address(periphery), sellAmount);
        uint256 usdtOut = periphery.sellYes(marketId, sellAmount, 1);
        vm.stopPrank();

        assertEq(usdt.balanceOf(bob) - usdtBefore, usdtOut);
        assertGt(usdtOut, 0);
        _assertNoPeripheryDust(yesT, noT);
    }

    function _assertSellNo(uint256 marketId, bool expectedYesIsCurrency0) internal {
        (address yesT, address noT, bool yesIsCurrency0,,,,) = hook.marketView(marketId);
        assertEq(yesIsCurrency0, expectedYesIsCurrency0);

        uint256 noOut = _buyNoForBob(marketId, 5e6);
        uint256 sellAmount = noOut / 2;
        uint256 usdtBefore = usdt.balanceOf(bob);

        vm.startPrank(bob);
        OutcomeToken(noT).approve(address(periphery), sellAmount);
        uint256 usdtOut = periphery.sellNo(marketId, sellAmount, 1);
        vm.stopPrank();

        assertEq(usdt.balanceOf(bob) - usdtBefore, usdtOut);
        assertGt(usdtOut, 0);
        _assertNoPeripheryDust(yesT, noT);
    }

    function _buyYesForBob(uint256 marketId, uint256 usdtIn) internal returns (uint256 yesOut) {
        vm.startPrank(bob);
        usdt.approve(address(periphery), usdtIn);
        yesOut = periphery.buyYes(marketId, usdtIn, usdtIn);
        vm.stopPrank();
    }

    function _buyNoForBob(uint256 marketId, uint256 usdtIn) internal returns (uint256 noOut) {
        vm.startPrank(bob);
        usdt.approve(address(periphery), usdtIn);
        noOut = periphery.buyNo(marketId, usdtIn, usdtIn);
        vm.stopPrank();
    }

    function _createMarketsForBothDirections() internal {
        vm.startPrank(alice);
        usdt.approve(address(hook), type(uint256).max);
        for (uint256 i = 0; i < 80 && (yesCurrency0Market == 0 || yesCurrency1Market == 0); i++) {
            uint256 marketId =
                hook.createMarket("periphery test", uint64(block.timestamp + 1 days), _tools(), 0, 100e6);
            (,, bool yesIsCurrency0,,,,) = hook.marketView(marketId);
            if (yesIsCurrency0 && yesCurrency0Market == 0) {
                yesCurrency0Market = marketId;
            } else if (!yesIsCurrency0 && yesCurrency1Market == 0) {
                yesCurrency1Market = marketId;
            }
        }
        vm.stopPrank();

        require(yesCurrency0Market != 0, "missing yes currency0 market");
        require(yesCurrency1Market != 0, "missing yes currency1 market");
    }

    function _assertNoPeripheryDust(address yesT, address noT) internal view {
        assertEq(OutcomeToken(yesT).balanceOf(address(periphery)), 0);
        assertEq(OutcomeToken(noT).balanceOf(address(periphery)), 0);
        assertEq(usdt.balanceOf(address(periphery)), 0);
    }

    function _tools() internal pure returns (bytes32[] memory tools) {
        tools = new bytes32[](1);
        tools[0] = keccak256("ave_token_tool");
    }
}
