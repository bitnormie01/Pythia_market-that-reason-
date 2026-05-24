// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/contracts/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/contracts/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/contracts/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/contracts/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/contracts/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/contracts/types/Currency.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/contracts/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/contracts/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/contracts/types/PoolOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IUnlockCallback} from "@uniswap/v4-core/contracts/interfaces/callback/IUnlockCallback.sol";
import {FlapAIConsumerBase} from "./interfaces/FlapAIConsumerBase.sol";
import {IFlapAIProvider} from "./interfaces/IFlapAIProvider.sol";
import {OutcomeToken} from "./OutcomeToken.sol";

contract PythiaHook is IHooks, IUnlockCallback, FlapAIConsumerBase, AccessControl {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;

    uint24 public constant POOL_FEE = 10_000;
    int24 public constant TICK_SPACING = 200;
    uint64 public constant RESOLUTION_GRACE = 60;
    uint8 public constant CHOICE_YES = 0;
    uint8 public constant CHOICE_NO = 1;
    uint8 public constant CHOICE_INVALID = 2;
    uint8 public constant NUM_OF_CHOICES = 3;
    uint256 public constant CREATOR_BOND = 5e6;
    uint256 public constant MIN_INITIAL_LIQUIDITY = 5e6;
    uint64 public constant FORCE_RESOLVE_DELAY = 7 days;
    int24 public constant MIN_TICK = -887200;
    int24 public constant MAX_TICK = 887200;

    error QuestionTooLong();
    error ToolNotWhitelisted();
    error InsufficientInitialLiquidity();
    error MarketNotTrading();
    error InvalidMarket();
    error AlreadyResolved();
    error NotYetExpired();
    error AlreadyResolving();

    enum MarketStatus {
        TRADING,
        RESOLVING,
        RESOLVED
    }

    struct MarketState {
        string question;
        uint64 expiry;
        bytes32[] tools;
        uint16 modelId;
        MarketStatus status;
        address creator;
        bool yesIsCurrency0;
        PoolKey poolKey;
        uint64 creationBlock;
        address yesToken;
        address noToken;
        uint8 winningChoice;
    }

    struct SeedLPData {
        uint256 marketId;
        uint256 liquidity;
    }

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdt;
    address public immutable provider;
    address public immutable outcomeTokenMaster;

    mapping(bytes32 => bool) public allowedTools;
    mapping(uint256 => MarketState) public markets;
    mapping(uint256 => uint256) public bond;
    uint256[] private _marketIds;
    uint256 private _nextMarketId = 1;

    mapping(uint256 => uint256) public requestIdToMarketId;
    mapping(uint256 => address) public requestIdToRequester;
    mapping(uint256 => uint256) public marketLastRequestId;
    uint256[] public pendingRequestIds;
    mapping(uint256 => uint256) private _pendingIdxPlusOne;

    event MarketCreated(uint256 indexed marketId, address indexed creator, string question, uint64 expiry);

    constructor(address poolManager_, address usdt_, address provider_, address outcomeTokenMaster_, address admin) {
        poolManager = IPoolManager(poolManager_);
        usdt = IERC20(usdt_);
        provider = provider_;
        outcomeTokenMaster = outcomeTokenMaster_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _seedDefaultTools();
    }

    function _getFlapAIProvider() internal view override returns (address) {
        return provider;
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function lastRequestId() public pure override returns (uint256) {
        return 0;
    }

    function _fulfillReasoning(uint256, uint8) internal override {
        // Implemented in Task 4.7.
    }

    function _onFlapAIRequestRefunded(uint256) internal override {
        // Implemented in Task 4.7.
    }

    function createMarket(
        string calldata question,
        uint64 expiry,
        bytes32[] calldata tools,
        uint16 modelId,
        uint256 initialUsdtLiquidity
    ) external returns (uint256 marketId) {
        if (bytes(question).length > 280) revert QuestionTooLong();
        if (initialUsdtLiquidity < MIN_INITIAL_LIQUIDITY) revert InsufficientInitialLiquidity();
        if (expiry <= block.timestamp + 1 hours) revert("expiry too soon");

        for (uint256 i = 0; i < tools.length; i++) {
            if (!allowedTools[tools[i]]) revert ToolNotWhitelisted();
        }

        IFlapAIProvider(provider).getModel(modelId);

        uint256 total = CREATOR_BOND + initialUsdtLiquidity;
        require(usdt.transferFrom(msg.sender, address(this), total), "usdt transfer failed");

        marketId = _nextMarketId++;
        _marketIds.push(marketId);
        bond[marketId] = CREATOR_BOND;

        (address yesT, address noT) = _cloneOutcomeTokens(marketId, initialUsdtLiquidity);
        PoolKey memory pk = _poolKeyFor(yesT, noT);
        _storeMarket(marketId, question, expiry, tools, modelId, msg.sender, yesT, noT, pk);

        poolManager.initialize(pk, 79228162514264337593543950336);
        _seedInitialLiquidity(marketId, initialUsdtLiquidity);

        emit MarketCreated(marketId, msg.sender, question, expiry);
    }

    function marketView(uint256 marketId)
        external
        view
        returns (
            address yesToken,
            address noToken,
            bool yesIsCurrency0,
            uint64 expiry,
            MarketStatus status,
            address creator,
            uint16 modelId
        )
    {
        MarketState storage m = markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        return (m.yesToken, m.noToken, m.yesIsCurrency0, m.expiry, m.status, m.creator, m.modelId);
    }

    function poolKey(uint256 marketId) external view returns (PoolKey memory) {
        MarketState storage m = markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        return m.poolKey;
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "only PoolManager");
        SeedLPData memory data = abi.decode(rawData, (SeedLPData));
        MarketState storage m = markets[data.marketId];
        if (m.creator == address(0)) revert InvalidMarket();

        // V4 1.0.2 makes the liquidity position owner `msg.sender`.
        // Since the hook performs the atomic seed, this seed position is hook-owned.
        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            m.poolKey,
            ModifyLiquidityParams({
                tickLower: MIN_TICK,
                tickUpper: MAX_TICK,
                liquidityDelta: int256(data.liquidity),
                salt: bytes32(data.marketId)
            }),
            abi.encode(m.creator)
        );

        _settleIfOwed(m.poolKey.currency0, delta.amount0());
        _settleIfOwed(m.poolKey.currency1, delta.amount1());

        return "";
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert();
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, int128)
    {
        revert();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert();
    }

    receive() external payable {
        revert("direct OKB transfer disabled");
    }

    function _seedDefaultTools() internal {
        allowedTools[keccak256("ave_token_tool")] = true;
        allowedTools[keccak256("ave_token_info")] = true;
        allowedTools[keccak256("onchain_read_tool")] = true;
    }

    function _seedInitialLiquidity(uint256 marketId, uint256 liquidity) internal {
        poolManager.unlock(abi.encode(SeedLPData({marketId: marketId, liquidity: liquidity})));
    }

    function _cloneOutcomeTokens(uint256 marketId, uint256 initialUsdtLiquidity)
        internal
        returns (address yesT, address noT)
    {
        string memory idString = _toString(marketId);
        yesT = Clones.clone(outcomeTokenMaster);
        noT = Clones.clone(outcomeTokenMaster);
        OutcomeToken(yesT)
            .initialize(
                address(this),
                string(abi.encodePacked("Pythia-YES-#", idString)),
                string(abi.encodePacked("pYES", idString))
            );
        OutcomeToken(noT)
            .initialize(
                address(this),
                string(abi.encodePacked("Pythia-NO-#", idString)),
                string(abi.encodePacked("pNO", idString))
            );
        OutcomeToken(yesT).mint(address(this), initialUsdtLiquidity);
        OutcomeToken(noT).mint(address(this), initialUsdtLiquidity);
    }

    function _poolKeyFor(address yesT, address noT) internal view returns (PoolKey memory pk) {
        bool yesIs0 = yesT < noT;
        pk = PoolKey({
            currency0: Currency.wrap(yesIs0 ? yesT : noT),
            currency1: Currency.wrap(yesIs0 ? noT : yesT),
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(this))
        });
    }

    function _storeMarket(
        uint256 marketId,
        string calldata question,
        uint64 expiry,
        bytes32[] calldata tools,
        uint16 modelId,
        address creator,
        address yesT,
        address noT,
        PoolKey memory pk
    ) internal {
        MarketState storage m = markets[marketId];
        m.question = question;
        m.expiry = expiry;
        m.modelId = modelId;
        m.status = MarketStatus.TRADING;
        m.creator = creator;
        m.yesIsCurrency0 = yesT < noT;
        m.poolKey = pk;
        m.creationBlock = uint64(block.number);
        m.yesToken = yesT;
        m.noToken = noT;
        m.winningChoice = type(uint8).max;
        for (uint256 i = 0; i < tools.length; i++) {
            m.tools.push(tools[i]);
        }
    }

    function _settleIfOwed(Currency currency, int128 delta) internal {
        if (delta >= 0) return;
        uint256 amount = uint256(uint128(-delta));
        poolManager.sync(currency);
        IERC20(Currency.unwrap(currency)).transfer(address(poolManager), amount);
        poolManager.settle();
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v;
        uint256 digits;
        while (tmp != 0) {
            digits++;
            tmp /= 10;
        }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }
}
