// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Script.sol";
import {PythiaAIProvider} from "../src/PythiaAIProvider.sol";

contract DeployProvider is Script {
    function run() external returns (PythiaAIProvider provider) {
        address admin = vm.envAddress("ADMIN_SAFE");
        address fulfiller = vm.envAddress("FULFILLER_PRIMARY");
        address backupFulfiller = vm.envAddress("FULFILLER_BACKUP");
        address feeReceiver = admin;

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        provider = new PythiaAIProvider(admin, fulfiller, feeReceiver);
        vm.stopBroadcast();

        console.log("PythiaAIProvider deployed to:", address(provider));
        console.log("Admin Safe:", admin);
        console.log("Primary fulfiller:", fulfiller);
        console.log("Backup fulfiller pending Safe grant:", backupFulfiller);
        console.log("Grant role via Safe:");
        console.logBytes32(provider.FULFILLER_ROLE());
    }
}
