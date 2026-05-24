// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IFlapAIProvider} from "./interfaces/IFlapAIProvider.sol";

contract PythiaAIProvider is IFlapAIProvider, AccessControl {
    bytes32 public constant FULFILLER_ROLE = keccak256("FULFILLER_ROLE");

    mapping(uint16 => Model) private _models;
    mapping(uint256 => Request) private _requests;
    mapping(uint256 => string) private _reasoningCids;
    uint256 private _nextRequestId = 1;

    uint256 private _maxPromptLength = 6000;
    uint256 private _callbackGasLimit = 2_000_000;
    bool private _fulfilling;

    address public feeReceiver;

    constructor(address admin, address fulfiller_, address feeReceiver_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(FULFILLER_ROLE, fulfiller_);
        feeReceiver = feeReceiver_;

        _registerModel(0, "google/gemini-3-flash", 0.005 ether);
        _registerModel(1, "anthropic/claude-sonnet-4.6", 0.01 ether);
        _registerModel(2, "deepseek/deepseek-r1", 0.03 ether);
        _registerModel(3, "deepseek/deepseek-v4-flash", 0.01 ether);
    }

    function reason(uint256 modelId, string calldata prompt, uint8 numOfChoices)
        external
        payable
        returns (uint256 requestId)
    {
        require(!_fulfilling, "no nested reason() during fulfill");

        Model memory m = _models[uint16(modelId)];
        if (bytes(m.name).length == 0) revert FlapAIProviderModelNotRegistered(modelId);
        if (!m.enabled) revert FlapAIProviderModelNotEnabled(modelId);
        if (numOfChoices == 0) revert FlapAIProviderInvalidNumOfChoices(numOfChoices);
        if (bytes(prompt).length > _maxPromptLength) {
            revert FlapAIProviderPromptExceedsMaxLength(bytes(prompt).length, _maxPromptLength);
        }
        if (msg.value < m.price) revert FlapAIProviderInsufficientFee(msg.value, m.price);

        requestId = _nextRequestId++;
        _requests[requestId] = Request({
            consumer: msg.sender,
            modelId: uint16(modelId),
            numOfChoices: numOfChoices,
            timestamp: uint64(block.timestamp),
            feePaid: uint128(msg.value),
            status: RequestStatus.PENDING,
            choice: 0,
            reserved: 0
        });

        emit FlapAIProviderRequestMade(requestId, msg.sender, modelId, prompt, numOfChoices, msg.value);
    }

    function fulfillReasoning(uint256 requestId, uint8 choice, string calldata reasoningDetailsIpfsCid)
        external
        onlyRole(FULFILLER_ROLE)
    {
        Request storage r = _requests[requestId];
        if (r.status != RequestStatus.PENDING) revert FlapAIProviderRequestNotPending(requestId);
        if (choice >= r.numOfChoices) revert FlapAIProviderChoiceOutOfRange(choice, r.numOfChoices);

        _reasoningCids[requestId] = reasoningDetailsIpfsCid;
        r.choice = choice;
        _fulfilling = true;

        try this.invokeConsumerCallback{gas: _callbackGasLimit}(r.consumer, requestId, choice) {
            r.status = RequestStatus.FULFILLED;
            emit FlapAIProviderRequestFulfilled(requestId, r.consumer, choice, reasoningDetailsIpfsCid);
        } catch (bytes memory reason_) {
            r.status = RequestStatus.UNDELIVERED;
            emit FlapAIProviderRequestUndelivered(requestId, r.consumer, choice, reasoningDetailsIpfsCid, reason_);
        }

        _fulfilling = false;
    }

    function invokeConsumerCallback(address consumer, uint256 requestId, uint8 choice) external {
        require(msg.sender == address(this), "internal only");
        (bool ok, bytes memory data) =
            consumer.call(abi.encodeWithSignature("fulfillReasoning(uint256,uint8)", requestId, choice));
        if (!ok) {
            assembly {
                revert(add(data, 32), mload(data))
            }
        }
    }

    function refundRequest(uint256 requestId) external onlyRole(FULFILLER_ROLE) {
        Request storage r = _requests[requestId];
        if (r.status != RequestStatus.PENDING) revert FlapAIProviderRequestNotPending(requestId);

        r.status = RequestStatus.REFUNDED;
        address consumer = r.consumer;
        uint256 refund = uint256(r.feePaid);

        emit FlapAIProviderRequestRefunded(requestId, consumer, refund);

        (bool ok, bytes memory data) = consumer.call{value: refund, gas: _callbackGasLimit}(
            abi.encodeWithSignature("onFlapAIRequestRefunded(uint256)", requestId)
        );
        if (!ok) {
            emit FlapAIProviderRefundUndelivered(requestId, consumer, refund, data);
        }
    }

    function getModel(uint256 modelId) external view returns (Model memory model) {
        model = _models[uint16(modelId)];
        if (bytes(model.name).length == 0) revert FlapAIProviderModelNotRegistered(modelId);
    }

    function maxPromptLength() external view returns (uint256) {
        return _maxPromptLength;
    }

    function setMaxPromptLength(uint256 newMaxPromptLength) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 old = _maxPromptLength;
        _maxPromptLength = newMaxPromptLength;
        emit FlapAIProviderMaxPromptLengthUpdated(old, newMaxPromptLength);
    }

    function callbackGasLimit() external view returns (uint256) {
        return _callbackGasLimit;
    }

    function setCallbackGasLimit(uint256 newCallbackGasLimit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCallbackGasLimit < 1_000_000) {
            revert FlapAIProviderCallbackGasLimitTooLow(newCallbackGasLimit, 1_000_000);
        }
        uint256 old = _callbackGasLimit;
        _callbackGasLimit = newCallbackGasLimit;
        emit FlapAIProviderCallbackGasLimitUpdated(old, newCallbackGasLimit);
    }

    function getTotalRequests() external view returns (uint256 total) {
        return _nextRequestId - 1;
    }

    function getTotalRequestsByConsumer(address consumer) external view returns (uint256 total) {
        uint256 last = _nextRequestId;
        for (uint256 i = 1; i < last; i++) {
            if (_requests[i].consumer == consumer) total++;
        }
    }

    function getRequest(uint256 requestId) external view returns (RequestView memory view_) {
        return _requestView(requestId);
    }

    function getRecentRequests(uint256 offset, uint256 limit) external view returns (RequestView[] memory views) {
        uint256 total = _nextRequestId - 1;
        if (offset >= total) return new RequestView[](0);

        uint256 take = limit;
        if (offset + take > total) take = total - offset;

        views = new RequestView[](take);
        for (uint256 i = 0; i < take; i++) {
            uint256 id = total - offset - i;
            views[i] = _requestView(id);
        }
    }

    function getRequestsByConsumer(address consumer, uint256 offset, uint256 limit)
        external
        view
        returns (RequestView[] memory views)
    {
        uint256 total = _nextRequestId - 1;
        uint256[] memory matches = new uint256[](total);
        uint256 matchCount;
        uint256 stopAt = offset + limit;

        for (uint256 i = total; i >= 1 && matchCount < stopAt; i--) {
            if (_requests[i].consumer == consumer) {
                matches[matchCount++] = i;
            }
            if (i == 1) break;
        }

        uint256 startIdx = offset >= matchCount ? matchCount : offset;
        uint256 outLen = matchCount > offset ? matchCount - offset : 0;
        if (outLen > limit) outLen = limit;

        views = new RequestView[](outLen);
        for (uint256 j = 0; j < outLen; j++) {
            views[j] = _requestView(matches[startIdx + j]);
        }
    }

    function _registerModel(uint16 id, string memory name_, uint256 price) internal {
        _models[id] = Model({name: name_, price: price, enabled: true});
        emit FlapAIProviderModelRegistered(id, name_, price);
    }

    function _requestView(uint256 requestId) internal view returns (RequestView memory view_) {
        Request memory r = _requests[requestId];
        view_ = RequestView({
            requestId: requestId,
            consumer: r.consumer,
            modelId: r.modelId,
            numOfChoices: r.numOfChoices,
            timestamp: r.timestamp,
            feePaid: r.feePaid,
            status: r.status,
            choice: r.choice,
            reasoningCid: _reasoningCids[requestId]
        });
    }

    receive() external payable {}
}
