// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {PythiaHook} from "../../../src/PythiaHook.sol";
import {OutcomeToken} from "../../../src/OutcomeToken.sol";
import {MockUSDT} from "../../utils/MockUSDT.sol";

contract MintBurnHandler is Test {
    PythiaHook public hook;
    MockUSDT public usdt;
    uint256 public marketId;
    address[] public actors;

    constructor(PythiaHook hook_, MockUSDT usdt_, uint256 marketId_) {
        hook = hook_;
        usdt = usdt_;
        marketId = marketId_;

        for (uint256 i = 0; i < 5; i++) {
            actors.push(address(uint160(0x1000 + i)));
        }
    }

    function mintRandom(uint256 amount, uint256 actorSeed) external {
        amount = bound(amount, 1, 100e6);
        address actor = actors[actorSeed % actors.length];

        usdt.mint(actor, amount);
        vm.startPrank(actor);
        usdt.approve(address(hook), amount);
        hook.mint(marketId, amount);
        vm.stopPrank();
    }

    function burnRandom(uint256 amount, uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        (address yesToken, address noToken,,,,,) = hook.marketView(marketId);

        uint256 maxBurn = OutcomeToken(yesToken).balanceOf(actor);
        uint256 noBalance = OutcomeToken(noToken).balanceOf(actor);
        if (noBalance < maxBurn) maxBurn = noBalance;
        if (maxBurn == 0) return;

        amount = bound(amount, 1, maxBurn);
        vm.prank(actor);
        hook.burn(marketId, amount);
    }
}
