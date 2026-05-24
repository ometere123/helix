// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {HelixLP} from "./HelixLP.sol";

/// @title FluxAMM — 2-asset StableSwap (Curve-style) AMM for USDC <> EURC.
/// @notice Uses the Curve invariant 4A·(x+y) + D = 4A·D + D³/(4xy) which concentrates
///         liquidity near the 1:1 peg. ~100× more capital-efficient than xy=k for stablecoin pairs.
contract FluxAMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable eurc;
    HelixLP public immutable lpToken;

    uint256 public reserveUSDC;
    uint256 public reserveEURC;

    /// @dev Amplification coefficient. Higher A = flatter curve near 1:1.
    uint256 public constant A = 100;
    /// @dev Swap fee in basis points (4 = 0.04%, matches Curve's USD pools).
    uint256 public constant FEE_BPS = 4;
    uint256 public constant FEE_DENOM = 10_000;
    uint256 private constant N_COINS = 2;

    error ZeroAmount();
    error InvalidToken();
    error SlippageExceeded();
    error InsufficientLiquidity();
    error InsufficientShares();
    error NotConverged();

    event LiquidityAdded(address indexed provider, uint256 usdcAmount, uint256 eurcAmount, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 usdcOut, uint256 eurcOut, uint256 shares);
    event Swapped(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 amountOut);

    constructor(address _usdc, address _eurc) {
        usdc = IERC20(_usdc);
        eurc = IERC20(_eurc);
        lpToken = new HelixLP(address(this));
    }

    // ============ StableSwap Math ============

    /// @dev Computes the StableSwap invariant D given reserves (x, y).
    ///      Solves: 4A·(x+y) + D = 4A·D + D³/(4xy) by Newton iteration.
    function _getD(uint256 x, uint256 y) internal pure returns (uint256) {
        uint256 s = x + y;
        if (s == 0) return 0;
        uint256 ann = A * N_COINS; // 2A
        uint256 D = s;
        for (uint256 i = 0; i < 255; i++) {
            // D_P = D^(N+1) / (N^N · x · y) = D³ / (4xy)
            uint256 D_P = (D * D) / (x * N_COINS);
            D_P = (D_P * D) / (y * N_COINS);
            uint256 Dprev = D;
            D = ((ann * s + D_P * N_COINS) * D) / ((ann - 1) * D + (N_COINS + 1) * D_P);
            if (D > Dprev) {
                if (D - Dprev <= 1) return D;
            } else {
                if (Dprev - D <= 1) return D;
            }
        }
        revert NotConverged();
    }

    /// @dev Given new reserve `xNew` of one coin and invariant D, computes the new reserve
    ///      of the other coin (`y`) that keeps the invariant satisfied.
    function _getY(uint256 xNew, uint256 D) internal pure returns (uint256) {
        uint256 ann = A * N_COINS;
        // c = D^(N+1) / (N^N · x · ann) = D³ / (8A·x)
        uint256 c = (D * D) / (xNew * N_COINS);
        c = (c * D) / (ann * N_COINS);
        // b = x + D/ann   (Curve writes this as b - D in the iteration step)
        uint256 b = xNew + D / ann;
        uint256 y = D;
        for (uint256 i = 0; i < 255; i++) {
            uint256 yPrev = y;
            y = (y * y + c) / (2 * y + b - D);
            if (y > yPrev) {
                if (y - yPrev <= 1) return y;
            } else {
                if (yPrev - y <= 1) return y;
            }
        }
        revert NotConverged();
    }

    // ============ Liquidity ============

    function addLiquidity(uint256 usdcAmount, uint256 eurcAmount)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (usdcAmount == 0 && eurcAmount == 0) revert ZeroAmount();

        uint256 totalShares = lpToken.totalSupply();
        uint256 D0 = totalShares == 0 ? 0 : _getD(reserveUSDC, reserveEURC);

        uint256 newReserveUSDC = reserveUSDC + usdcAmount;
        uint256 newReserveEURC = reserveEURC + eurcAmount;
        uint256 D1 = _getD(newReserveUSDC, newReserveEURC);

        if (totalShares == 0) {
            shares = D1; // first deposit mints D
        } else {
            // Proportional to invariant growth
            shares = (totalShares * (D1 - D0)) / D0;
        }
        if (shares == 0) revert InsufficientLiquidity();

        if (usdcAmount > 0) usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        if (eurcAmount > 0) eurc.safeTransferFrom(msg.sender, address(this), eurcAmount);
        reserveUSDC = newReserveUSDC;
        reserveEURC = newReserveEURC;

        lpToken.mint(msg.sender, shares);
        emit LiquidityAdded(msg.sender, usdcAmount, eurcAmount, shares);
    }

    function removeLiquidity(uint256 shares)
        external
        nonReentrant
        returns (uint256 usdcOut, uint256 eurcOut)
    {
        if (shares == 0) revert InsufficientShares();
        uint256 totalShares = lpToken.totalSupply();
        usdcOut = (shares * reserveUSDC) / totalShares;
        eurcOut = (shares * reserveEURC) / totalShares;
        if (usdcOut == 0 && eurcOut == 0) revert InsufficientLiquidity();

        lpToken.burn(msg.sender, shares);
        reserveUSDC -= usdcOut;
        reserveEURC -= eurcOut;
        if (usdcOut > 0) usdc.safeTransfer(msg.sender, usdcOut);
        if (eurcOut > 0) eurc.safeTransfer(msg.sender, eurcOut);
        emit LiquidityRemoved(msg.sender, usdcOut, eurcOut, shares);
    }

    // ============ Swap ============

    function getAmountOut(address tokenIn, uint256 amountIn) public view returns (uint256) {
        if (amountIn == 0) return 0;
        if (tokenIn != address(usdc) && tokenIn != address(eurc)) return 0;
        if (reserveUSDC == 0 || reserveEURC == 0) return 0;

        (uint256 reserveIn, uint256 reserveOut) = tokenIn == address(usdc)
            ? (reserveUSDC, reserveEURC)
            : (reserveEURC, reserveUSDC);

        uint256 D = _getD(reserveUSDC, reserveEURC);
        uint256 newReserveIn = reserveIn + amountIn;
        uint256 newReserveOut = _getY(newReserveIn, D);
        if (newReserveOut >= reserveOut) return 0;
        uint256 dy = reserveOut - newReserveOut;
        // Apply fee — kept in the pool as LP gain
        return (dy * (FEE_DENOM - FEE_BPS)) / FEE_DENOM;
    }

    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (tokenIn != address(usdc) && tokenIn != address(eurc)) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmount();
        amountOut = getAmountOut(tokenIn, amountIn);
        if (amountOut == 0) revert InsufficientLiquidity();
        if (amountOut < minAmountOut) revert SlippageExceeded();

        if (tokenIn == address(usdc)) {
            usdc.safeTransferFrom(msg.sender, address(this), amountIn);
            reserveUSDC += amountIn;
            reserveEURC -= amountOut;
            eurc.safeTransfer(msg.sender, amountOut);
        } else {
            eurc.safeTransferFrom(msg.sender, address(this), amountIn);
            reserveEURC += amountIn;
            reserveUSDC -= amountOut;
            usdc.safeTransfer(msg.sender, amountOut);
        }
        emit Swapped(msg.sender, tokenIn, amountIn, amountOut);
    }

    // ============ Views ============

    function poolStats() external view returns (uint256 _reserveUSDC, uint256 _reserveEURC, uint256 totalLP) {
        return (reserveUSDC, reserveEURC, lpToken.totalSupply());
    }

    /// @notice Current invariant value — useful for off-chain monitoring and oracle backstops.
    function invariantD() external view returns (uint256) {
        if (reserveUSDC == 0 || reserveEURC == 0) return 0;
        return _getD(reserveUSDC, reserveEURC);
    }
}
