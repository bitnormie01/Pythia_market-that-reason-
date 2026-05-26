// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {PythiaFixture} from "../utils/PythiaFixture.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";
import {MintBurnHandler} from "./handlers/MintBurnHandler.sol";

contract CollateralInvariantTest is StdInvariant, PythiaFixture {
    MintBurnHandler public handler;
    uint256 public marketId;

    function setUp() public override {
        super.setUp();

        bytes32[] memory tools = new bytes32[](1);
        tools[0] = keccak256("ave_token_tool");

        vm.startPrank(alice);
        usdt.approve(address(hook), 15e6);
        marketId = hook.createMarket("invariant market", uint64(block.timestamp + 1 days), tools, 0, 10e6);
        vm.stopPrank();

        handler = new MintBurnHandler(hook, usdt, marketId);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = MintBurnHandler.mintRandom.selector;
        selectors[1] = MintBurnHandler.burnRandom.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariant_matched_supply_and_collateral_backing() public view {
        (address yesToken, address noToken,,,,,) = hook.marketView(marketId);
        uint256 yesSupply = OutcomeToken(yesToken).totalSupply();
        uint256 noSupply = OutcomeToken(noToken).totalSupply();
        uint256 collateral = usdt.balanceOf(address(hook)) - hook.bond(marketId);

        assertEq(yesSupply, noSupply, "YES/NO supplies diverged");
        assertEq(collateral, yesSupply, "collateral does not back outcome supply");
    }
}
