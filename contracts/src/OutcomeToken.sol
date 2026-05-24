// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal 6-decimal ERC20 deployed as EIP-1167 clones per market.
///         Only the configured hook can mint/burn. Initialized once per clone.
contract OutcomeToken is ERC20 {
    error AlreadyInitialized();
    error OnlyHook();

    address public hook;
    string private _name;
    string private _symbol;

    constructor() ERC20("OutcomeToken-Master", "PYM") {
        // Master is never used directly; clones call initialize().
    }

    function initialize(address hook_, string memory name_, string memory symbol_) external {
        if (hook != address(0)) revert AlreadyInitialized();
        hook = hook_;
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view override returns (string memory) {
        return bytes(_name).length == 0 ? "OutcomeToken-Master" : _name;
    }

    function symbol() public view override returns (string memory) {
        return bytes(_symbol).length == 0 ? "PYM" : _symbol;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != hook) revert OnlyHook();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != hook) revert OnlyHook();
        _burn(from, amount);
    }
}
