// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/contracts/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/contracts/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/contracts/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/contracts/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/contracts/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/contracts/libraries/TickMath.sol";
import {TransientStateLibrary} from "@uniswap/v4-core/contracts/libraries/TransientStateLibrary.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PythiaHook} from "./PythiaHook.sol";
import {OutcomeToken} from "./OutcomeToken.sol";

contract PythiaPeriphery is IUnlockCallback {
    using SafeERC20 for IERC20;
    using TransientStateLibrary for IPoolManager;

    error OnlyPoolManager();
    error Slippage();
    error AmountTooSmall();

    PythiaHook public immutable hook;
    IPoolManager public immutable poolManager;
    address public immutable permit2;
    IERC20 public immutable usdt;

    struct SwapCallbackData {
        uint256 marketId;
        bool inputIsYes;
        uint256 amountIn;
        address recipient;
    }

    struct MarketTokens {
        address yes;
        address no;
    }

    struct SellSnapshot {
        uint256 yesBalance;
        uint256 noBalance;
        uint256 usdtBalance;
    }

    constructor(address hook_, address poolManager_, address permit2_, address usdt_) {
        hook = PythiaHook(payable(hook_));
        poolManager = IPoolManager(poolManager_);
        permit2 = permit2_;
        usdt = IERC20(usdt_);
    }

    function buyYes(uint256 marketId, uint256 usdtIn, uint256 minYesOut) external returns (uint256 yesOut) {
        yesOut = _buy(marketId, true, usdtIn, minYesOut);
    }

    function buyNo(uint256 marketId, uint256 usdtIn, uint256 minNoOut) external returns (uint256 noOut) {
        noOut = _buy(marketId, false, usdtIn, minNoOut);
    }

    function sellYes(uint256 marketId, uint256 yesIn, uint256 minUsdtOut) external returns (uint256 usdtOut) {
        usdtOut = _sell(marketId, true, yesIn, minUsdtOut);
    }

    function sellNo(uint256 marketId, uint256 noIn, uint256 minUsdtOut) external returns (uint256 usdtOut) {
        usdtOut = _sell(marketId, false, noIn, minUsdtOut);
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        SwapCallbackData memory data = abi.decode(rawData, (SwapCallbackData));

        PoolKey memory key = hook.poolKey(data.marketId);
        (,, bool yesIsCurrency0,,,,) = hook.marketView(data.marketId);
        bool zeroForOne = data.inputIsYes == yesIsCurrency0;

        Currency input = zeroForOne ? key.currency0 : key.currency1;
        Currency output = zeroForOne ? key.currency1 : key.currency0;

        poolManager.sync(input);
        require(IERC20(Currency.unwrap(input)).transfer(address(poolManager), data.amountIn), "swap pay");
        poolManager.settle();

        poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(data.amountIn),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        uint256 outAmount = _takeCredit(output, data.recipient);
        _takeCredit(input, data.recipient);

        return abi.encode(outAmount);
    }

    function _buy(uint256 marketId, bool buyYes_, uint256 usdtIn, uint256 minOut) internal returns (uint256 totalOut) {
        if (usdtIn == 0) revert AmountTooSmall();

        MarketTokens memory tokens = _marketTokens(marketId);
        usdt.safeTransferFrom(msg.sender, address(this), usdtIn);
        usdt.forceApprove(address(hook), usdtIn);
        hook.mintFor(marketId, address(this), usdtIn);

        bool inputIsYes = !buyYes_;
        bytes memory result = poolManager.unlock(
            abi.encode(
                SwapCallbackData({marketId: marketId, inputIsYes: inputIsYes, amountIn: usdtIn, recipient: msg.sender})
            )
        );
        uint256 swapOut = abi.decode(result, (uint256));

        address desiredToken = buyYes_ ? tokens.yes : tokens.no;
        require(OutcomeToken(desiredToken).transfer(msg.sender, usdtIn), "desired out");

        totalOut = usdtIn + swapOut;
        if (totalOut < minOut) revert Slippage();
    }

    function _sell(uint256 marketId, bool sellYes_, uint256 outcomeIn, uint256 minUsdtOut)
        internal
        returns (uint256 usdtOut)
    {
        uint256 swapIn = outcomeIn / 2;
        if (swapIn == 0) revert AmountTooSmall();

        MarketTokens memory tokens = _marketTokens(marketId);
        SellSnapshot memory snapshot = _sellSnapshot(tokens);

        OutcomeToken inputToken = OutcomeToken(sellYes_ ? tokens.yes : tokens.no);
        require(inputToken.transferFrom(msg.sender, address(this), outcomeIn), "pull outcome");

        poolManager.unlock(
            abi.encode(
                SwapCallbackData({marketId: marketId, inputIsYes: sellYes_, amountIn: swapIn, recipient: address(this)})
            )
        );

        uint256 matched = _matchedDelta(tokens, snapshot);
        if (matched == 0) revert Slippage();

        hook.burn(marketId, matched);
        usdtOut = usdt.balanceOf(address(this)) - snapshot.usdtBalance;
        if (usdtOut < minUsdtOut) revert Slippage();
        usdt.safeTransfer(msg.sender, usdtOut);

        _returnExcess(tokens, snapshot, msg.sender);
    }

    function _marketTokens(uint256 marketId) internal view returns (MarketTokens memory tokens) {
        (tokens.yes, tokens.no,,,,,) = hook.marketView(marketId);
    }

    function _sellSnapshot(MarketTokens memory tokens) internal view returns (SellSnapshot memory snapshot) {
        snapshot = SellSnapshot({
            yesBalance: OutcomeToken(tokens.yes).balanceOf(address(this)),
            noBalance: OutcomeToken(tokens.no).balanceOf(address(this)),
            usdtBalance: usdt.balanceOf(address(this))
        });
    }

    function _matchedDelta(MarketTokens memory tokens, SellSnapshot memory snapshot) internal view returns (uint256) {
        uint256 yesDelta = OutcomeToken(tokens.yes).balanceOf(address(this)) - snapshot.yesBalance;
        uint256 noDelta = OutcomeToken(tokens.no).balanceOf(address(this)) - snapshot.noBalance;
        return yesDelta < noDelta ? yesDelta : noDelta;
    }

    function _returnExcess(MarketTokens memory tokens, SellSnapshot memory snapshot, address recipient) internal {
        uint256 excessYes = OutcomeToken(tokens.yes).balanceOf(address(this)) - snapshot.yesBalance;
        uint256 excessNo = OutcomeToken(tokens.no).balanceOf(address(this)) - snapshot.noBalance;
        if (excessYes > 0) require(OutcomeToken(tokens.yes).transfer(recipient, excessYes), "yes excess out");
        if (excessNo > 0) require(OutcomeToken(tokens.no).transfer(recipient, excessNo), "no excess out");
    }

    function _takeCredit(Currency currency, address to) internal returns (uint256 amount) {
        int256 credit = poolManager.currencyDelta(address(this), currency);
        if (credit > 0) {
            amount = uint256(credit);
            poolManager.take(currency, to, amount);
        }
    }
}
