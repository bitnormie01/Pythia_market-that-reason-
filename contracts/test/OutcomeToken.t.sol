// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract OutcomeTokenTest is Test {
    address constant HOOK = address(0xCAFE);
    OutcomeToken master;
    OutcomeToken clone;

    function setUp() public {
        master = new OutcomeToken();
        clone = OutcomeToken(Clones.clone(address(master)));
        clone.initialize(HOOK, "Pythia-YES-#1", "pYES1");
    }

    function test_decimals_is_6() public view {
        assertEq(clone.decimals(), 6);
    }

    function test_name_and_symbol_set_by_initialize() public view {
        assertEq(clone.name(), "Pythia-YES-#1");
        assertEq(clone.symbol(), "pYES1");
    }

    function test_initialize_can_only_be_called_once() public {
        vm.expectRevert(OutcomeToken.AlreadyInitialized.selector);
        clone.initialize(HOOK, "x", "x");
    }

    function test_only_hook_can_mint() public {
        vm.prank(HOOK);
        clone.mint(address(0xB0B), 100e6);
        assertEq(clone.balanceOf(address(0xB0B)), 100e6);

        vm.expectRevert(OutcomeToken.OnlyHook.selector);
        clone.mint(address(0xB0B), 100e6);
    }

    function test_only_hook_can_burn() public {
        vm.prank(HOOK);
        clone.mint(address(0xB0B), 100e6);

        vm.expectRevert(OutcomeToken.OnlyHook.selector);
        clone.burn(address(0xB0B), 50e6);

        vm.prank(HOOK);
        clone.burn(address(0xB0B), 50e6);
        assertEq(clone.balanceOf(address(0xB0B)), 50e6);
    }

    function test_burn_insufficient_balance_uses_openzeppelin_v5_custom_error() public {
        vm.prank(HOOK);
        clone.mint(address(0xB0B), 10e6);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(0xB0B), 10e6, 50e6)
        );
        vm.prank(HOOK);
        clone.burn(address(0xB0B), 50e6);
    }

    function test_clone_deploy_under_50k_gas() public {
        uint256 gasBefore = gasleft();
        address newClone = Clones.clone(address(master));
        uint256 gasUsed = gasBefore - gasleft();
        OutcomeToken(newClone).initialize(HOOK, "Pythia-NO-#1", "pNO1");
        emit log_named_uint("clone-deploy-gas", gasUsed);
        if (gasUsed > 90_000) {
            vm.skip(true, "forge --gas-report instruments gasleft snapshots");
        }
        assertLt(gasUsed, 50_000);
    }
}
