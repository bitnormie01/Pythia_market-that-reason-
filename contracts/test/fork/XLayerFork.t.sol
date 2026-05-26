// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/contracts/utils/HookMiner.sol";
import {PythiaAIProvider} from "../../src/PythiaAIProvider.sol";
import {PythiaHook} from "../../src/PythiaHook.sol";
import {OutcomeToken} from "../../src/OutcomeToken.sol";

contract XLayerForkTest is Test {
    address constant POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address constant USDT_X = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;

    function setUp() public {
        vm.createSelectFork("xlayer");
    }

    function test_can_deploy_provider_on_fork() public {
        PythiaAIProvider provider = new PythiaAIProvider(makeAddr("admin"), makeAddr("fulfiller"), makeAddr("fees"));

        assertEq(provider.getModel(0).name, "google/gemini-2.5-flash-lite");
    }

    function test_can_deploy_hook_with_mined_address_on_fork() public {
        address admin = makeAddr("admin");
        PythiaAIProvider provider = new PythiaAIProvider(admin, makeAddr("fulfiller"), makeAddr("fees"));
        OutcomeToken master = new OutcomeToken();

        uint160 flags = uint160(Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG);
        (address hookAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(PythiaHook).creationCode,
            abi.encode(POOL_MANAGER, USDT_X, address(provider), address(master), admin)
        );

        PythiaHook hook = new PythiaHook{salt: salt}(POOL_MANAGER, USDT_X, address(provider), address(master), admin);

        assertEq(address(hook), hookAddr);
        assertEq(address(hook.poolManager()), POOL_MANAGER);
        assertEq(address(hook.usdt()), USDT_X);
    }
}
