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
    address public constant BOND_BURN_SINK = address(0x000000000000000000000000000000000000dEaD);

    uint8 private constant UNLOCK_OP_SEED = 1;
    uint8 private constant UNLOCK_OP_WITHDRAW_SEED = 2;

    error QuestionTooLong();
    error ToolNotWhitelisted();
    error InsufficientInitialLiquidity();
    error MarketNotTrading();
    error InvalidMarket();
    error AlreadyResolved();
    error NotYetExpired();
    error AlreadyResolving();
    error MarketNotResolved();
    error InvalidChoice();
    error InvalidUnlockOp();
    error CreatorOnlyLpWindow();
    error InsufficientResolutionFee(uint256 sent, uint256 required);
    error FulfillInternalOnlySelf();

    enum MarketStatus {
        TRADING,
        RESOLVING,
        RESOLVED
    }

    enum ExtendedStatus {
        TRADING,
        EXPIRED,
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

    struct WithdrawSeedData {
        uint256 marketId;
        address to;
        uint128 liquidityToRemove;
    }

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdt;
    address public immutable provider;
    address public immutable outcomeTokenMaster;

    mapping(bytes32 => bool) public allowedTools;
    mapping(uint256 => MarketState) public markets;
    mapping(uint256 => uint256) public bond;
    mapping(uint256 => uint64) public _creatorLpWindowEnd;
    uint256[] private _marketIds;
    uint256 private _nextMarketId = 1;

    mapping(uint256 => uint256) public requestIdToMarketId;
    mapping(uint256 => address) public requestIdToRequester;
    mapping(uint256 => uint256) public marketLastRequestId;
    uint256[] private _pendingRequestIds;
    mapping(uint256 => uint256) private _pendingIdxPlusOne;

    event MarketCreated(uint256 indexed marketId, address indexed creator, string question, uint64 expiry);
    event Minted(uint256 indexed marketId, address indexed to, uint256 amount);
    event Burned(uint256 indexed marketId, address indexed from, uint256 amount);
    event Redeemed(uint256 indexed marketId, address indexed user, uint256 amount, uint8 winningChoice);
    event CreatorSeedWithdrawn(
        uint256 indexed marketId, address indexed creator, uint128 liquidityRemoved, uint256 collateralReturned
    );
    event ResolutionRequested(uint256 indexed marketId, uint256 indexed requestId, address indexed requester);
    event Resolved(uint256 indexed marketId, uint8 choice, string reasoningCid);
    event ResolutionRefunded(
        uint256 indexed marketId, uint256 indexed requestId, address indexed requester, uint256 amount
    );
    event RefundEscrowed(uint256 indexed requestId, address indexed requester, uint256 amount);

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

    function _fulfillReasoning(uint256 requestId, uint8 choice) internal override {
        try this.fulfillInternal(requestId, choice) {} catch {}
    }

    function _onFlapAIRequestRefunded(uint256 requestId) internal override {
        uint256 marketId = requestIdToMarketId[requestId];
        if (marketId == 0) return;

        MarketState storage m = markets[marketId];
        if (m.status != MarketStatus.RESOLVING) return;

        address requester = requestIdToRequester[requestId];
        delete requestIdToMarketId[requestId];
        delete requestIdToRequester[requestId];
        delete marketLastRequestId[marketId];
        _popPending(requestId);
        m.status = MarketStatus.TRADING;

        if (msg.value > 0) {
            (bool ok,) = requester.call{value: msg.value, gas: 100_000}("");
            if (!ok) {
                emit RefundEscrowed(requestId, requester, msg.value);
                return;
            }
        }

        emit ResolutionRefunded(marketId, requestId, requester, msg.value);
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
        _creatorLpWindowEnd[marketId] = uint64(block.number) + 60;

        (address yesT, address noT) = _cloneOutcomeTokens(marketId, initialUsdtLiquidity);
        PoolKey memory pk = _poolKeyFor(yesT, noT);
        _storeMarket(marketId, question, expiry, tools, modelId, msg.sender, yesT, noT, pk);

        poolManager.initialize(pk, 79228162514264337593543950336);
        _seedInitialLiquidity(marketId, initialUsdtLiquidity);

        emit MarketCreated(marketId, msg.sender, question, expiry);
    }

    function mint(uint256 marketId, uint256 amount) external {
        _mint(marketId, msg.sender, amount);
    }

    function mintFor(uint256 marketId, address to, uint256 amount) external {
        _mint(marketId, to, amount);
    }

    function burn(uint256 marketId, uint256 amount) external {
        MarketState storage m = markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        if (m.status == MarketStatus.RESOLVED) revert AlreadyResolved();

        OutcomeToken(m.yesToken).burn(msg.sender, amount);
        OutcomeToken(m.noToken).burn(msg.sender, amount);
        require(usdt.transfer(msg.sender, amount), "usdt out failed");
        emit Burned(marketId, msg.sender, amount);
    }

    function redeem(uint256 marketId, uint256 amount) external {
        MarketState storage m = markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        if (m.status != MarketStatus.RESOLVED) revert MarketNotResolved();

        if (m.winningChoice == CHOICE_YES) {
            OutcomeToken(m.yesToken).burn(msg.sender, amount);
            require(usdt.transfer(msg.sender, amount), "usdt out failed");
        } else if (m.winningChoice == CHOICE_NO) {
            OutcomeToken(m.noToken).burn(msg.sender, amount);
            require(usdt.transfer(msg.sender, amount), "usdt out failed");
        } else if (m.winningChoice == CHOICE_INVALID) {
            _redeemInvalid(m, amount);
        } else {
            revert InvalidChoice();
        }

        emit Redeemed(marketId, msg.sender, amount, m.winningChoice);
        _settleCreatorBondIfNeeded(marketId, m);
    }

    function creatorWithdrawSeed(uint256 marketId, uint128 liquidityToRemove) external {
        MarketState storage m = markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        require(msg.sender == m.creator, "only creator");
        if (effectiveStatus(marketId) != ExtendedStatus.RESOLVED) revert MarketNotResolved();

        poolManager.unlock(
            abi.encode(
                UNLOCK_OP_WITHDRAW_SEED,
                abi.encode(WithdrawSeedData({marketId: marketId, to: msg.sender, liquidityToRemove: liquidityToRemove}))
            )
        );
    }

    function requestResolution(uint256 marketId) external payable returns (uint256 requestId) {
        MarketState storage m = markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        if (effectiveStatus(marketId) != ExtendedStatus.EXPIRED) revert NotYetExpired();

        IFlapAIProvider.Model memory model = IFlapAIProvider(provider).getModel(m.modelId);
        uint256 price = model.price;
        if (msg.value < price) revert InsufficientResolutionFee(msg.value, price);

        string memory prompt = string(
            abi.encodePacked(
                "Resolve this prediction market. Respond with only 0 for YES, 1 for NO, or 2 for INVALID.\nQuestion: ",
                m.question
            )
        );

        requestId = IFlapAIProvider(provider).reason{value: price}(m.modelId, prompt, NUM_OF_CHOICES);
        requestIdToMarketId[requestId] = marketId;
        requestIdToRequester[requestId] = msg.sender;
        marketLastRequestId[marketId] = requestId;
        _pushPending(requestId);
        m.status = MarketStatus.RESOLVING;

        uint256 excess = msg.value - price;
        if (excess > 0) {
            (bool ok,) = msg.sender.call{value: excess, gas: 100_000}("");
            require(ok, "refund excess failed");
        }

        emit ResolutionRequested(marketId, requestId, msg.sender);
    }

    function fulfillInternal(uint256 requestId, uint8 choice) external {
        if (msg.sender != address(this)) revert FulfillInternalOnlySelf();
        if (choice >= NUM_OF_CHOICES) revert InvalidChoice();

        uint256 marketId = requestIdToMarketId[requestId];
        if (marketId == 0) revert InvalidMarket();

        MarketState storage m = markets[marketId];
        if (m.status != MarketStatus.RESOLVING) return;

        m.winningChoice = choice;
        m.status = MarketStatus.RESOLVED;
        string memory cid = IFlapAIProvider(provider).getRequest(requestId).reasoningCid;

        delete requestIdToMarketId[requestId];
        delete requestIdToRequester[requestId];
        _popPending(requestId);

        emit Resolved(marketId, choice, cid);
    }

    function pendingRequestIds() external view returns (uint256[] memory ids) {
        return _pendingRequestIds;
    }

    function pendingRequestCount() external view returns (uint256) {
        return _pendingRequestIds.length;
    }

    function sweepOkb(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "zero receiver");
        uint256 bal = address(this).balance;
        (bool ok,) = to.call{value: bal}("");
        require(ok, "sweep okb failed");
    }

    function effectiveStatus(uint256 marketId) public view returns (ExtendedStatus) {
        MarketState storage m = markets[marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        if (m.status == MarketStatus.RESOLVED) return ExtendedStatus.RESOLVED;
        if (m.status == MarketStatus.RESOLVING) return ExtendedStatus.RESOLVING;
        if (block.timestamp > uint256(m.expiry) + RESOLUTION_GRACE) return ExtendedStatus.EXPIRED;
        return ExtendedStatus.TRADING;
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
        (uint8 op, bytes memory data) = abi.decode(rawData, (uint8, bytes));
        if (op == UNLOCK_OP_SEED) {
            _unlockSeed(abi.decode(data, (SeedLPData)));
        } else if (op == UNLOCK_OP_WITHDRAW_SEED) {
            _unlockWithdrawSeed(abi.decode(data, (WithdrawSeedData)));
        } else {
            revert InvalidUnlockOp();
        }

        return "";
    }

    function _unlockSeed(SeedLPData memory data) internal {
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

        _settleOrTake(m.poolKey.currency0, delta.amount0(), address(this));
        _settleOrTake(m.poolKey.currency1, delta.amount1(), address(this));
    }

    function _unlockWithdrawSeed(WithdrawSeedData memory data) internal {
        MarketState storage m = markets[data.marketId];
        if (m.creator == address(0)) revert InvalidMarket();
        if (effectiveStatus(data.marketId) != ExtendedStatus.RESOLVED) revert MarketNotResolved();

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            m.poolKey,
            ModifyLiquidityParams({
                tickLower: MIN_TICK,
                tickUpper: MAX_TICK,
                liquidityDelta: -int256(uint256(data.liquidityToRemove)),
                salt: bytes32(data.marketId)
            }),
            abi.encode(data.to)
        );

        uint256 amount0 = _settleOrTake(m.poolKey.currency0, delta.amount0(), address(this));
        uint256 amount1 = _settleOrTake(m.poolKey.currency1, delta.amount1(), address(this));
        uint256 yesAmount = m.yesIsCurrency0 ? amount0 : amount1;
        uint256 noAmount = m.yesIsCurrency0 ? amount1 : amount0;
        uint256 matched = yesAmount < noAmount ? yesAmount : noAmount;

        if (matched > 0) {
            OutcomeToken(m.yesToken).burn(address(this), matched);
            OutcomeToken(m.noToken).burn(address(this), matched);
            require(usdt.transfer(data.to, matched), "usdt out failed");
        }

        uint256 excessYes = yesAmount - matched;
        uint256 excessNo = noAmount - matched;
        if (excessYes > 0) {
            require(OutcomeToken(m.yesToken).transfer(data.to, excessYes), "yes excess out");
        }
        if (excessNo > 0) {
            require(OutcomeToken(m.noToken).transfer(data.to, excessNo), "no excess out");
        }

        emit CreatorSeedWithdrawn(data.marketId, data.to, data.liquidityToRemove, matched);
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert();
    }

    function beforeAddLiquidity(address sender, PoolKey calldata key, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        returns (bytes4)
    {
        uint256 marketId = _marketIdFromPoolKey(key);
        if (effectiveStatus(marketId) != ExtendedStatus.TRADING) revert MarketNotTrading();
        if (
            sender != address(this) && block.number < _creatorLpWindowEnd[marketId]
                && sender != markets[marketId].creator
        ) {
            revert CreatorOnlyLpWindow();
        }
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

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external
        view
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        uint256 marketId = _marketIdFromPoolKey(key);
        if (effectiveStatus(marketId) != ExtendedStatus.TRADING) revert MarketNotTrading();
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
        poolManager.unlock(
            abi.encode(UNLOCK_OP_SEED, abi.encode(SeedLPData({marketId: marketId, liquidity: liquidity})))
        );
    }

    function _mint(uint256 marketId, address to, uint256 amount) internal {
        if (effectiveStatus(marketId) != ExtendedStatus.TRADING) revert MarketNotTrading();
        require(usdt.transferFrom(msg.sender, address(this), amount), "usdt transfer failed");
        MarketState storage m = markets[marketId];
        OutcomeToken(m.yesToken).mint(to, amount);
        OutcomeToken(m.noToken).mint(to, amount);
        emit Minted(marketId, to, amount);
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

    function _marketIdFromPoolKey(PoolKey memory key) internal view returns (uint256) {
        bytes32 targetId = PoolId.unwrap(key.toId());
        for (uint256 i = 0; i < _marketIds.length; i++) {
            uint256 marketId = _marketIds[i];
            PoolKey memory storedKey = markets[marketId].poolKey;
            if (PoolId.unwrap(storedKey.toId()) == targetId) return marketId;
        }
        revert InvalidMarket();
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

    function _settleOrTake(Currency currency, int128 delta, address takeTo) internal returns (uint256 credit) {
        if (delta < 0) {
            uint256 amount = uint256(uint128(-delta));
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).transfer(address(poolManager), amount);
            poolManager.settle();
        } else if (delta > 0) {
            credit = uint256(uint128(delta));
            poolManager.take(currency, takeTo, credit);
        }
    }

    function _redeemInvalid(MarketState storage m, uint256 amount) internal {
        if (OutcomeToken(m.yesToken).balanceOf(msg.sender) >= amount) {
            OutcomeToken(m.yesToken).burn(msg.sender, amount);
        } else {
            OutcomeToken(m.noToken).burn(msg.sender, amount);
        }
        require(usdt.transfer(msg.sender, amount / 2), "usdt out failed");
    }

    function _settleCreatorBondIfNeeded(uint256 marketId, MarketState storage m) internal {
        uint256 bondAmt = bond[marketId];
        if (bondAmt == 0) return;

        bond[marketId] = 0;
        if (m.winningChoice == CHOICE_INVALID) {
            require(usdt.transfer(BOND_BURN_SINK, bondAmt), "bond burn failed");
        } else {
            require(usdt.transfer(m.creator, bondAmt), "bond return failed");
        }
    }

    function _pushPending(uint256 requestId) internal {
        if (_pendingIdxPlusOne[requestId] != 0) return;
        _pendingRequestIds.push(requestId);
        _pendingIdxPlusOne[requestId] = _pendingRequestIds.length;
    }

    function _popPending(uint256 requestId) internal {
        uint256 idxPlusOne = _pendingIdxPlusOne[requestId];
        if (idxPlusOne == 0) return;

        uint256 idx = idxPlusOne - 1;
        uint256 last = _pendingRequestIds.length - 1;
        if (idx != last) {
            uint256 lastId = _pendingRequestIds[last];
            _pendingRequestIds[idx] = lastId;
            _pendingIdxPlusOne[lastId] = idx + 1;
        }

        _pendingRequestIds.pop();
        delete _pendingIdxPlusOne[requestId];
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
