// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PythiaHook} from "../../src/PythiaHook.sol";
import {PythiaPeriphery} from "../../src/PythiaPeriphery.sol";
import {PythiaAIProvider} from "../../src/PythiaAIProvider.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";

/// @notice Dress rehearsal for the live "hero market" run, executed against the REAL
///         deployed mainnet contracts on an X Layer fork. Validates the full
///         create -> trade -> AI-resolve -> recover flow and proves the creator's
///         USDT is (almost) fully recoverable. No real funds are spent.
contract HeroMarketRehearsalTest is Test {
    PythiaHook constant HOOK = PythiaHook(payable(0xB5370e00d486a39eb3654e41F8b8425b24D94880));
    PythiaPeriphery constant PERI = PythiaPeriphery(0x9443e94449eD090BACf996c199B3aA18362170C3);
    PythiaAIProvider constant PROV = PythiaAIProvider(payable(0x68B343fd826e2837Fc8B69f418C0612116ca807B));
    IERC20 constant USDT = IERC20(0x779Ded0c9e1022225f8E0630b35a9b54bE713736);

    address constant CREATOR = 0x0E5920162CdCC7c921D268df52852E41Cd27bE6f;

    uint256 constant SEED = 5e6; // 5 USDT
    uint256 constant BOND = 5e6; // hook CREATOR_BOND
    uint256 constant TRADE = 1e6; // 1 USDT demo buy

    function setUp() public {
        vm.createSelectFork("xlayer");
    }

    function test_hero_market_full_flow_and_recovery() public {
        deal(address(USDT), CREATOR, 20e6);
        vm.deal(CREATOR, 1 ether);

        uint256 startUsdt = USDT.balanceOf(CREATOR);
        emit log_named_decimal_uint("creator USDT start", startUsdt, 6);

        uint256 id = _createAndTrade();
        _expireRequestAndResolve(id);
        _recover(id);

        uint256 endUsdt = USDT.balanceOf(CREATOR);
        emit log_named_decimal_uint("creator USDT end  ", endUsdt, 6);
        assertGe(endUsdt, (startUsdt * 99) / 100, "should recover >=99% of USDT");
    }

    function _createAndTrade() internal returns (uint256 id) {
        bytes32[] memory tools = new bytes32[](2);
        tools[0] = keccak256("ave_token_tool");
        tools[1] = keccak256("onchain_read_tool");

        vm.startPrank(CREATOR);
        USDT.approve(address(HOOK), BOND + SEED);
        id = HOOK.createMarket(
            "Will OKB (OKB/USDT) trade above $20 at this market's expiry timestamp?",
            uint64(block.timestamp + 2 hours),
            tools,
            0,
            SEED
        );
        emit log_named_uint("marketId", id);

        USDT.approve(address(PERI), TRADE);
        uint256 yesOut = PERI.buyYes(id, TRADE, 0);
        vm.stopPrank();
        emit log_named_decimal_uint("YES bought (swap fired)", yesOut, 6);
        assertGt(yesOut, 0, "buyYes returns YES; beforeSwap fired");

        (,,,, PythiaHook.MarketStatus st,,) = HOOK.marketView(id);
        assertEq(uint8(st), uint8(PythiaHook.MarketStatus.TRADING), "still TRADING after swap");
    }

    function _expireRequestAndResolve(uint256 id) internal {
        (,,, uint64 expiry,,,) = HOOK.marketView(id);
        vm.warp(uint256(expiry) + 61);

        vm.prank(CREATOR);
        uint256 reqId = HOOK.requestResolution{value: 0.005 ether}(id);
        emit log_named_uint("requestId", reqId);

        address forkFulfiller = makeAddr("forkFulfiller");
        bytes32 fulfillerRole = PROV.FULFILLER_ROLE();
        uint8 choiceYes = HOOK.CHOICE_YES();
        vm.prank(CREATOR); // creator holds DEFAULT_ADMIN_ROLE on the provider
        PROV.grantRole(fulfillerRole, forkFulfiller);
        vm.prank(forkFulfiller);
        PROV.fulfillReasoning(reqId, choiceYes, "bafyRehearsalReasoningTrailCID");

        (,,,, PythiaHook.MarketStatus st,,) = HOOK.marketView(id);
        assertEq(uint8(st), uint8(PythiaHook.MarketStatus.RESOLVED), "market resolved via AI path");
    }

    function _recover(uint256 id) internal {
        (address yesToken,,,,,,) = HOOK.marketView(id);
        uint256 yesBal = OutcomeToken(yesToken).balanceOf(CREATOR);
        vm.startPrank(CREATOR);
        HOOK.redeem(id, yesBal); // winning YES -> USDT, returns creator bond
        HOOK.creatorWithdrawSeed(id, uint128(SEED)); // pull seed liquidity back
        vm.stopPrank();
    }
}
