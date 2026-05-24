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
import {FlapAIConsumerBase} from "./interfaces/FlapAIConsumerBase.sol";
import {IFlapAIProvider} from "./interfaces/IFlapAIProvider.sol";
import {OutcomeToken} from "./OutcomeToken.sol";

contract PythiaHook is IHooks, FlapAIConsumerBase, AccessControl {
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

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdt;
    address public immutable provider;
    address public immutable outcomeTokenMaster;

    constructor(address poolManager_, address usdt_, address provider_, address outcomeTokenMaster_, address admin) {
        poolManager = IPoolManager(poolManager_);
        usdt = IERC20(usdt_);
        provider = provider_;
        outcomeTokenMaster = outcomeTokenMaster_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
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
        revert();
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
        revert();
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
}
