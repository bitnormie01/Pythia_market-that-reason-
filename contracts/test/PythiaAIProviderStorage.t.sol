// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PythiaAIProvider} from "../src/PythiaAIProvider.sol";

contract PythiaAIProviderStorageTest is Test {
    function test_request_struct_slot_0_packs_consumer_modelId_numOfChoices_timestamp() public {
        PythiaAIProvider provider = new PythiaAIProvider(address(this), address(0xF1), address(0xFE));

        vm.warp(1_717_171_717);
        provider.reason{value: 0.005 ether}(0, "prompt", 3);

        bytes32 baseSlot = keccak256(abi.encode(uint256(1), uint256(2)));
        uint256 slot0 = uint256(vm.load(address(provider), baseSlot));

        address consumer = address(uint160(slot0));
        uint16 modelId = uint16(slot0 >> 160);
        uint8 numOfChoices = uint8(slot0 >> 176);
        uint64 timestamp = uint64(slot0 >> 184);

        assertEq(consumer, address(this));
        assertEq(modelId, 0);
        assertEq(numOfChoices, 3);
        assertEq(timestamp, 1_717_171_717);
        assertEq(slot0 >> 248, 0, "slot0 must not occupy bit 248+");
    }
}
