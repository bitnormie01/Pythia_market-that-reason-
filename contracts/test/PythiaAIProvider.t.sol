// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {PythiaAIProvider} from "../src/PythiaAIProvider.sol";
import {IFlapAIProvider} from "../src/interfaces/IFlapAIProvider.sol";

contract MockConsumer {
    event MockFulfillReceived(uint256 requestId, uint8 choice);

    address public immutable provider;
    bool public shouldRevert;

    constructor(address provider_) {
        provider = provider_;
    }

    function setShouldRevert(bool v) external {
        shouldRevert = v;
    }

    function fulfillReasoning(uint256 id, uint8 choice) external {
        if (shouldRevert) revert("MockConsumer reverts");
        emit MockFulfillReceived(id, choice);
    }

    function onFlapAIRequestRefunded(uint256) external payable {}

    function reason() external payable returns (uint256) {
        return IFlapAIProvider(provider).reason{value: msg.value}(0, "prompt", 3);
    }
}

contract MockRefundReverter {
    address public immutable provider;

    constructor(address provider_) {
        provider = provider_;
    }

    function fulfillReasoning(uint256, uint8) external {}

    function onFlapAIRequestRefunded(uint256) external payable {
        revert("refund rejected");
    }

    function reason() external payable returns (uint256) {
        return IFlapAIProvider(provider).reason{value: msg.value}(0, "prompt", 3);
    }
}

contract PythiaAIProviderTest is Test {
    PythiaAIProvider provider;
    address admin = address(0xA1);
    address fulfiller = address(0xF1);
    address feeReceiver = address(0xFE);

    function setUp() public {
        vm.prank(admin);
        provider = new PythiaAIProvider(admin, fulfiller, feeReceiver);
    }

    function test_model_0_is_dgrid_gemini_flash_lite() public view {
        IFlapAIProvider.Model memory m = provider.getModel(0);
        assertEq(m.name, "google/gemini-2.5-flash-lite");
        assertEq(m.price, 0.005 ether);
        assertTrue(m.enabled);
    }

    function test_model_1_2_3_are_unregistered_in_cheap_mode() public {
        for (uint256 id = 1; id <= 3; id++) {
            vm.expectRevert(abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderModelNotRegistered.selector, id));
            provider.getModel(id);
        }
    }

    function test_getModel_reverts_for_unregistered() public {
        vm.expectRevert(abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderModelNotRegistered.selector, 99));
        provider.getModel(99);
    }

    function test_default_maxPromptLength_is_6000() public view {
        assertEq(provider.maxPromptLength(), 6000);
    }

    function test_default_callbackGasLimit_is_2_000_000() public view {
        assertEq(provider.callbackGasLimit(), 2_000_000);
    }

    function test_reason_emits_event_and_returns_request_id() public {
        string memory prompt = "Test prompt: 0=YES 1=NO 2=INVALID";
        uint256 fee = 0.005 ether;

        vm.deal(address(this), fee);
        vm.expectEmit(false, false, false, true);
        emit IFlapAIProvider.FlapAIProviderRequestMade(1, address(this), 0, prompt, 3, fee);

        uint256 id = provider.reason{value: fee}(0, prompt, 3);
        assertEq(id, 1);

        IFlapAIProvider.RequestView memory r = provider.getRequest(id);
        assertEq(r.consumer, address(this));
        assertEq(r.modelId, 0);
        assertEq(r.numOfChoices, 3);
        assertEq(uint8(r.status), uint8(IFlapAIProvider.RequestStatus.PENDING));
        assertEq(r.feePaid, fee);
        assertEq(bytes(r.reasoningCid).length, 0);
    }

    function test_reason_reverts_on_insufficient_fee() public {
        vm.deal(address(this), 0.001 ether);
        vm.expectRevert(
            abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderInsufficientFee.selector, 0.001 ether, 0.005 ether)
        );
        provider.reason{value: 0.001 ether}(0, "x", 3);
    }

    function test_reason_reverts_on_zero_numOfChoices() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderInvalidNumOfChoices.selector, 0));
        provider.reason{value: 0.005 ether}(0, "x", 0);
    }

    function test_reason_reverts_when_prompt_too_long() public {
        bytes memory big = new bytes(6001);
        vm.deal(address(this), 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderPromptExceedsMaxLength.selector, 6001, 6000)
        );
        provider.reason{value: 0.005 ether}(0, string(big), 3);
    }

    function test_reason_reverts_on_unregistered_model() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderModelNotRegistered.selector, 99));
        provider.reason{value: 1 ether}(99, "x", 3);
    }

    function test_fulfillReasoning_stores_cid_then_calls_consumer_then_sets_FULFILLED() public {
        MockConsumer c = new MockConsumer(address(provider));
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.prank(fulfiller);
        provider.fulfillReasoning(id, 0, "bafyTESTCID");

        IFlapAIProvider.RequestView memory r = provider.getRequest(id);
        assertEq(uint8(r.status), uint8(IFlapAIProvider.RequestStatus.FULFILLED));
        assertEq(r.choice, 0);
        assertEq(r.reasoningCid, "bafyTESTCID");
    }

    function test_fulfillReasoning_consumer_revert_sets_UNDELIVERED_but_still_stores_cid() public {
        MockConsumer c = new MockConsumer(address(provider));
        c.setShouldRevert(true);
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.prank(fulfiller);
        provider.fulfillReasoning(id, 1, "bafyREVERTED");

        IFlapAIProvider.RequestView memory r = provider.getRequest(id);
        assertEq(uint8(r.status), uint8(IFlapAIProvider.RequestStatus.UNDELIVERED));
        assertEq(r.reasoningCid, "bafyREVERTED");
    }

    function test_fulfillReasoning_reverts_on_non_PENDING() public {
        MockConsumer c = new MockConsumer(address(provider));
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.prank(fulfiller);
        provider.fulfillReasoning(id, 0, "cid");

        vm.prank(fulfiller);
        vm.expectRevert(abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderRequestNotPending.selector, id));
        provider.fulfillReasoning(id, 0, "cid2");
    }

    function test_fulfillReasoning_reverts_on_choice_out_of_range() public {
        MockConsumer c = new MockConsumer(address(provider));
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.prank(fulfiller);
        vm.expectRevert(abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderChoiceOutOfRange.selector, 3, 3));
        provider.fulfillReasoning(id, 3, "cid");
    }

    function test_only_FULFILLER_ROLE_can_fulfill() public {
        MockConsumer c = new MockConsumer(address(provider));
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.expectRevert();
        provider.fulfillReasoning(id, 0, "cid");
    }

    function test_refundRequest_returns_fee_to_consumer_and_calls_back() public {
        MockConsumer c = new MockConsumer(address(provider));
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        uint256 balBefore = address(c).balance;

        vm.prank(fulfiller);
        provider.refundRequest(id);

        IFlapAIProvider.RequestView memory r = provider.getRequest(id);
        assertEq(uint8(r.status), uint8(IFlapAIProvider.RequestStatus.REFUNDED));
        assertEq(address(c).balance, balBefore + 0.005 ether);
    }

    function test_setCallbackGasLimit_enforces_1m_floor() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(IFlapAIProvider.FlapAIProviderCallbackGasLimitTooLow.selector, 999_999, 1_000_000)
        );
        provider.setCallbackGasLimit(999_999);

        vm.prank(admin);
        provider.setCallbackGasLimit(3_000_000);
        assertEq(provider.callbackGasLimit(), 3_000_000);
    }

    function test_setMaxPromptLength_admin_only() public {
        vm.expectRevert();
        provider.setMaxPromptLength(10_000);

        vm.prank(admin);
        provider.setMaxPromptLength(10_000);
        assertEq(provider.maxPromptLength(), 10_000);
    }

    function test_setFeeReceiver_admin_only() public {
        address newReceiver = address(0xFEE2);

        vm.expectRevert();
        provider.setFeeReceiver(newReceiver);

        vm.prank(admin);
        provider.setFeeReceiver(newReceiver);
        assertEq(provider.feeReceiver(), newReceiver);
    }

    function test_setFeeReceiver_reverts_on_zero_receiver() public {
        vm.prank(admin);
        vm.expectRevert("zero receiver");
        provider.setFeeReceiver(address(0));
    }

    function test_sweep_can_be_called_by_anyone_and_moves_balance_to_feeReceiver() public {
        vm.deal(address(provider), 0.42 ether);

        address caller = address(0xBEEF);
        uint256 receiverBefore = feeReceiver.balance;
        vm.prank(caller);
        provider.sweep();

        assertEq(address(provider).balance, 0);
        assertEq(feeReceiver.balance, receiverBefore + 0.42 ether);
    }

    function test_sweep_recovers_failed_refund_delivery() public {
        MockRefundReverter c = new MockRefundReverter(address(provider));
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.prank(fulfiller);
        provider.refundRequest(id);
        assertEq(address(provider).balance, 0.005 ether);

        uint256 receiverBefore = feeReceiver.balance;
        provider.sweep();
        assertEq(address(provider).balance, 0);
        assertEq(feeReceiver.balance, receiverBefore + 0.005 ether);
    }

    function test_recoverUndeliveredFee_admin_recovers_to_receiver() public {
        MockConsumer c = new MockConsumer(address(provider));
        c.setShouldRevert(true);
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.prank(fulfiller);
        provider.fulfillReasoning(id, 1, "bafyUNDELIVERED");

        address payable receiver = payable(address(0xCAFE));
        uint256 receiverBefore = receiver.balance;

        vm.prank(admin);
        provider.recoverUndeliveredFee(id, receiver);

        assertEq(receiver.balance - receiverBefore, 0.005 ether);
        IFlapAIProvider.RequestView memory r = provider.getRequest(id);
        assertEq(uint8(r.status), uint8(IFlapAIProvider.RequestStatus.REFUNDED));
    }

    function test_recoverUndeliveredFee_admin_only() public {
        MockConsumer c = new MockConsumer(address(provider));
        c.setShouldRevert(true);
        vm.deal(address(this), 1 ether);
        uint256 id = c.reason{value: 0.005 ether}();

        vm.prank(fulfiller);
        provider.fulfillReasoning(id, 1, "bafyUNDELIVERED");

        vm.expectRevert();
        provider.recoverUndeliveredFee(id, payable(address(0xCAFE)));
    }

    function test_getTotalRequests_tracks_count() public {
        assertEq(provider.getTotalRequests(), 0);

        MockConsumer c = new MockConsumer(address(provider));
        vm.deal(address(this), 1 ether);
        c.reason{value: 0.005 ether}();
        c.reason{value: 0.005 ether}();
        assertEq(provider.getTotalRequests(), 2);
    }
}
