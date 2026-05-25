// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/contracts/utils/HookMiner.sol";
import {OutcomeToken} from "../src/OutcomeToken.sol";
import {PythiaHook} from "../src/PythiaHook.sol";

contract MineAndDeployHook is Script {
    address constant POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external returns (PythiaHook hook, OutcomeToken master) {
        address admin = vm.envAddress("ADMIN_SAFE");
        address provider = vm.envAddress("PROVIDER_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        master = new OutcomeToken();
        master.initialize(address(0xdEaD), "OutcomeToken-Master", "PYM-MASTER");
        console.log("OutcomeToken master:", address(master));

        uint160 flags = uint160(Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG);
        bytes memory constructorArgs = abi.encode(POOL_MANAGER, usdt, provider, address(master), admin);
        (address hookAddr, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(PythiaHook).creationCode, constructorArgs);

        console.log("Mined hook address:", hookAddr);
        console.log("Salt:");
        console.logBytes32(salt);

        hook = new PythiaHook{salt: salt}(POOL_MANAGER, usdt, provider, address(master), admin);
        require(address(hook) == hookAddr, "hook address mismatch");
        console.log("PythiaHook deployed to:", address(hook));

        vm.stopBroadcast();
    }
}
