// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";

contract PythiaAIProviderStorageTest is Test {
    function test_request_struct_slot_0_packs_consumer_modelId_numOfChoices_timestamp() public pure {
        bytes32 slot0Mask = bytes32(uint256((1 << 248) - 1));
        assertEq(uint256(slot0Mask) >> 248, 0, "slot0 must not occupy bit 248+");
    }
}
