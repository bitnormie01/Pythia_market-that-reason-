// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {PythiaPeriphery} from "../src/PythiaPeriphery.sol";

contract DeployPeriphery is Script {
    address constant POOL_MANAGER = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external returns (PythiaPeriphery periphery) {
        address hook = vm.envAddress("HOOK_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        periphery = new PythiaPeriphery(hook, POOL_MANAGER, PERMIT2, usdt);
        vm.stopBroadcast();

        console.log("PythiaPeriphery deployed to:", address(periphery));
    }
}
