// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice IFlapAIProvider - copied from flap-docs.md so Pythia's stub is ABI-identical.
interface IFlapAIProvider {
    struct Model {
        string name;
        uint256 price;
        bool enabled;
    }

    enum RequestStatus {
        NONE,
        PENDING,
        FULFILLED,
        UNDELIVERED,
        REFUNDED
    }

    struct Request {
        address consumer;
        uint16 modelId;
        uint8 numOfChoices;
        uint64 timestamp;
        uint128 feePaid;
        RequestStatus status;
        uint8 choice;
        uint112 reserved;
    }

    struct RequestView {
        uint256 requestId;
        address consumer;
        uint16 modelId;
        uint8 numOfChoices;
        uint64 timestamp;
        uint128 feePaid;
        RequestStatus status;
        uint8 choice;
        string reasoningCid;
    }

    error FlapAIProviderPromptExceedsMaxLength(uint256 promptLength, uint256 maxPromptLength);
    error FlapAIProviderInvalidNumOfChoices(uint8 numOfChoices);
    error FlapAIProviderRequestNotPending(uint256 requestId);
    error FlapAIProviderChoiceOutOfRange(uint8 choice, uint8 numOfChoices);
    error FlapAIProviderInsufficientFee(uint256 sent, uint256 required);
    error FlapAIProviderModelNotRegistered(uint256 modelId);
    error FlapAIProviderModelNotEnabled(uint256 modelId);
    error FlapAIProviderCallbackGasLimitTooLow(uint256 provided, uint256 minimum);

    event FlapAIProviderRequestMade(
        uint256 requestId, address consumer, uint256 modelId, string prompt, uint8 numOfChoices, uint256 feePaid
    );
    event FlapAIProviderRequestFulfilled(
        uint256 requestId, address consumer, uint8 choice, string reasoningDetailsIpfsCid
    );
    event FlapAIProviderRequestUndelivered(
        uint256 requestId, address consumer, uint8 choice, string reasoningDetailsIpfsCid, bytes reason
    );
    event FlapAIProviderRequestRefunded(uint256 requestId, address consumer, uint256 refundAmount);
    event FlapAIProviderRefundUndelivered(uint256 requestId, address consumer, uint256 refundAmount, bytes reason);
    event FlapAIProviderMaxPromptLengthUpdated(uint256 oldMaxPromptLength, uint256 newMaxPromptLength);
    event FlapAIProviderCallbackGasLimitUpdated(uint256 oldCallbackGasLimit, uint256 newCallbackGasLimit);
    event FlapAIProviderModelRegistered(uint256 modelId, string name, uint256 price);

    function reason(uint256 modelId, string calldata prompt, uint8 numOfChoices)
        external
        payable
        returns (uint256 requestId);
    function getModel(uint256 modelId) external view returns (Model memory model);
    function fulfillReasoning(uint256 requestId, uint8 choice, string calldata reasoningDetailsIpfsCid) external;
    function refundRequest(uint256 requestId) external;
    function maxPromptLength() external view returns (uint256);
    function setMaxPromptLength(uint256 newMaxPromptLength) external;
    function callbackGasLimit() external view returns (uint256);
    function setCallbackGasLimit(uint256 newCallbackGasLimit) external;
    function getTotalRequests() external view returns (uint256 total);
    function getTotalRequestsByConsumer(address consumer) external view returns (uint256 total);
    function getRequest(uint256 requestId) external view returns (RequestView memory view_);
    function getRecentRequests(uint256 offset, uint256 limit) external view returns (RequestView[] memory views);
    function getRequestsByConsumer(address consumer, uint256 offset, uint256 limit)
        external
        view
        returns (RequestView[] memory views);
}
