// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Returns the USD value of `amount` tokens, scaled to 18 decimals.
///         e.g. valueInUsd(USDC, 1_000_000) → 1e18  (1 USDC = $1)
///              valueInUsd(cirBTC, 1e8)     → 105_000e18  (1 BTC = $105 000)
interface IPriceOracle {
    function valueInUsd(address token, uint256 amount) external view returns (uint256);
}

/// @title  Vault v2 — multi-asset lending market (USDC / EURC / cirBTC)
/// @notice Any two listed assets can form a borrow/collateral pair.
///         Prices are always fetched from a mandatory IPriceOracle.
///         The owner lists assets and their risk parameters; no hardcoded token addresses.
contract Vault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant BPS               = 10_000;
    uint256 public constant ONE               = 1e18;
    uint256 public constant BORROW_RATE_PER_YEAR = 5e16; // 5 % APR (1e18 scale)
    uint256 public constant SECONDS_PER_YEAR  = 365 days;

    // ─── State ───────────────────────────────────────────────────────────────
    address public owner;
    IPriceOracle public oracle;

    struct AssetConfig {
        bool     listed;
        uint8    decimals;
        uint16   ltvBps;        // max LTV  e.g. 9000 = 90 %
        uint16   liqThreshBps;  // liquidation threshold  e.g. 9200 = 92 %
        uint16   liqBonusBps;   // bonus for liquidator   e.g. 200  =  2 %
    }
    mapping(address token => AssetConfig)  public assetConfig;
    address[] public listedAssets;

    // Supply pools (per token)
    mapping(address token => uint256) public totalSupplied;
    mapping(address token => uint256) public totalSupplyShares;

    // Borrow pools (per token) — totalBorrowed grows with accrued interest
    mapping(address token => uint256) public totalBorrowed;
    mapping(address token => uint256) public totalBorrowShares;
    mapping(address token => uint256) public lastAccrualTime;

    // Per-user supply shares (per token)
    mapping(address user => mapping(address token => uint256)) public supplyShares;

    // Per-user position keyed by [user][debtToken][collateralToken]
    mapping(address => mapping(address => mapping(address => uint256))) public collateralOf;
    mapping(address => mapping(address => mapping(address => uint256))) public positionBorrowShares;

    // ─── Errors ──────────────────────────────────────────────────────────────
    error NotOwner();
    error AlreadyListed();
    error NotListed();
    error SameAsset();
    error ZeroAmount();
    error InsufficientBalance();
    error InsufficientLiquidity();
    error NoDebt();
    error HealthFactorOk();
    error OraclePriceMissing();
    error ZeroOracleAddress();

    // ─── Events ──────────────────────────────────────────────────────────────
    event AssetListed(address indexed token, uint16 ltvBps, uint16 liqThreshBps, uint16 liqBonusBps);
    event OracleUpdated(address indexed newOracle);
    event Deposited(address indexed user, address indexed token, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, address indexed token, uint256 amount, uint256 shares);
    event Borrowed(
        address indexed user,
        address indexed debtToken,
        address indexed collateralToken,
        uint256 amount,
        uint256 collateralPosted
    );
    event Repaid(
        address indexed user,
        address indexed debtToken,
        address indexed collateralToken,
        uint256 amount
    );
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        address indexed debtToken,
        address collateralToken,
        uint256 debtRepaid,
        uint256 collateralSeized
    );

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address _oracle) {
        if (_oracle == address(0)) revert ZeroOracleAddress();
        owner  = msg.sender;
        oracle = IPriceOracle(_oracle);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function listAsset(
        address token,
        uint8  decimals_,
        uint16 ltvBps,
        uint16 liqThreshBps,
        uint16 liqBonusBps
    ) external onlyOwner {
        if (assetConfig[token].listed) revert AlreadyListed();
        assetConfig[token] = AssetConfig({
            listed:       true,
            decimals:     decimals_,
            ltvBps:       ltvBps,
            liqThreshBps: liqThreshBps,
            liqBonusBps:  liqBonusBps
        });
        listedAssets.push(token);
        lastAccrualTime[token] = block.timestamp;
        emit AssetListed(token, ltvBps, liqThreshBps, liqBonusBps);
    }

    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert ZeroOracleAddress();
        oracle = IPriceOracle(_oracle);
        emit OracleUpdated(_oracle);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ─── Internal helpers ────────────────────────────────────────────────────
    function _requireListed(address token) internal view {
        if (!assetConfig[token].listed) revert NotListed();
    }

    function _accrue(address token) internal {
        uint256 last = lastAccrualTime[token];
        uint256 dt   = block.timestamp - last;
        if (dt == 0) return;
        uint256 borrowed = totalBorrowed[token];
        if (borrowed > 0) {
            uint256 interest = (borrowed * BORROW_RATE_PER_YEAR * dt) / SECONDS_PER_YEAR / ONE;
            if (interest > 0) {
                totalBorrowed[token]  = borrowed + interest;
                totalSupplied[token] += interest; // interest accrues to suppliers
            }
        }
        lastAccrualTime[token] = block.timestamp;
    }

    /// @dev Returns the pending totalBorrowed without mutating state (for views).
    function _pendingTotalBorrowed(address token) internal view returns (uint256) {
        uint256 dt      = block.timestamp - lastAccrualTime[token];
        uint256 borrowed = totalBorrowed[token];
        if (dt == 0 || borrowed == 0) return borrowed;
        uint256 interest = (borrowed * BORROW_RATE_PER_YEAR * dt) / SECONDS_PER_YEAR / ONE;
        return borrowed + interest;
    }

    function _pendingTotalSupplied(address token) internal view returns (uint256) {
        uint256 dt      = block.timestamp - lastAccrualTime[token];
        uint256 borrowed = totalBorrowed[token];
        if (dt == 0 || borrowed == 0) return totalSupplied[token];
        uint256 interest = (borrowed * BORROW_RATE_PER_YEAR * dt) / SECONDS_PER_YEAR / ONE;
        return totalSupplied[token] + interest;
    }

    /// @dev USD value via oracle; reverts if oracle returns zero.
    function _usdValue(address token, uint256 amount) internal view returns (uint256) {
        if (amount == 0) return 0;
        uint256 v = oracle.valueInUsd(token, amount);
        if (v == 0) revert OraclePriceMissing();
        return v;
    }

    // ─── Supply ──────────────────────────────────────────────────────────────
    function deposit(address token, uint256 amount) external nonReentrant {
        _requireListed(token);
        if (amount == 0) revert ZeroAmount();
        _accrue(token);

        uint256 ts = totalSupplyShares[token];
        uint256 t  = totalSupplied[token];
        uint256 shares = (ts == 0 || t == 0) ? amount : (amount * ts) / t;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        supplyShares[msg.sender][token] += shares;
        totalSupplyShares[token]         = ts + shares;
        totalSupplied[token]             = t  + amount;

        emit Deposited(msg.sender, token, amount, shares);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        _requireListed(token);
        if (amount == 0) revert ZeroAmount();
        _accrue(token);

        uint256 ts        = totalSupplyShares[token];
        uint256 t         = totalSupplied[token];
        uint256 userShares = supplyShares[msg.sender][token];
        uint256 userTotal  = (ts == 0) ? 0 : (userShares * t) / ts;
        if (amount > userTotal) revert InsufficientBalance();

        uint256 available = totalSupplied[token] - totalBorrowed[token];
        if (amount > available) revert InsufficientLiquidity();

        uint256 sharesBurnt = (t == 0) ? userShares : (amount * ts) / t;
        if (sharesBurnt > userShares) sharesBurnt = userShares;

        supplyShares[msg.sender][token] = userShares - sharesBurnt;
        totalSupplyShares[token]        = ts - sharesBurnt;
        totalSupplied[token]            = t  - amount;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount, sharesBurnt);
    }

    // ─── Borrow ──────────────────────────────────────────────────────────────
    /// @notice Borrow `amount` of `debtToken`, posting `collateralToken` as collateral.
    ///         The caller must approve this contract to pull the collateral before calling.
    function borrow(
        address debtToken,
        address collateralToken,
        uint256 amount
    ) external nonReentrant {
        _requireListed(debtToken);
        _requireListed(collateralToken);
        if (debtToken == collateralToken) revert SameAsset();
        if (amount == 0) revert ZeroAmount();
        _accrue(debtToken);

        uint256 available = totalSupplied[debtToken] - totalBorrowed[debtToken];
        if (amount > available) revert InsufficientLiquidity();

        // How much collateral is required?
        // collateralNeeded = debtUsd * BPS / ltvBps / collateralPricePerUnit
        // We compute in USD space to stay asset-agnostic.
        uint256 debtUsd       = _usdValue(debtToken, amount);
        AssetConfig storage cfg = assetConfig[debtToken];
        // collateralUsd >= debtUsd * BPS / ltvBps
        uint256 collateralUsd = (debtUsd * BPS + cfg.ltvBps - 1) / cfg.ltvBps; // round up
        // collateralAmount = collateralUsd / pricePerUnit
        // But we can't divide USD by a "price per unit" directly without knowing decimals.
        // Instead: pricePerUnit18 = valueInUsd(token, 1 unit)
        uint256 oneUnit        = 10 ** assetConfig[collateralToken].decimals;
        uint256 collPricePerUnit = _usdValue(collateralToken, oneUnit); // 1e18 scaled USD
        // collateralAmount in token's own decimals:
        uint256 requiredCollateral = (collateralUsd * oneUnit + collPricePerUnit - 1) / collPricePerUnit; // round up

        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), requiredCollateral);
        collateralOf[msg.sender][debtToken][collateralToken] += requiredCollateral;

        uint256 tbs    = totalBorrowShares[debtToken];
        uint256 tb     = totalBorrowed[debtToken];
        uint256 shares = (tbs == 0 || tb == 0) ? amount : (amount * tbs) / tb;
        positionBorrowShares[msg.sender][debtToken][collateralToken] += shares;
        totalBorrowShares[debtToken]  = tbs + shares;
        totalBorrowed[debtToken]      = tb  + amount;

        IERC20(debtToken).safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, debtToken, collateralToken, amount, requiredCollateral);
    }

    // ─── Repay ───────────────────────────────────────────────────────────────
    /// @notice Repay up to `amount` of `debtToken` for the position backed by `collateralToken`.
    ///         Collateral is returned pro-rata on partial repay; fully returned on full repay.
    function repay(
        address debtToken,
        address collateralToken,
        uint256 amount
    ) external nonReentrant {
        _requireListed(debtToken);
        _requireListed(collateralToken);
        if (amount == 0) revert ZeroAmount();
        _accrue(debtToken);

        uint256 userShares = positionBorrowShares[msg.sender][debtToken][collateralToken];
        if (userShares == 0) revert NoDebt();

        uint256 tbs     = totalBorrowShares[debtToken];
        uint256 tb      = totalBorrowed[debtToken];
        uint256 userDebt = (userShares * tb) / tbs;

        uint256 repayAmount = amount > userDebt ? userDebt : amount;
        uint256 sharesBurnt = (repayAmount * tbs) / tb;
        if (sharesBurnt > userShares) sharesBurnt = userShares;
        bool fullRepay = sharesBurnt == userShares;

        IERC20(debtToken).safeTransferFrom(msg.sender, address(this), repayAmount);
        positionBorrowShares[msg.sender][debtToken][collateralToken] = userShares - sharesBurnt;
        totalBorrowShares[debtToken] = tbs - sharesBurnt;
        totalBorrowed[debtToken]     = tb  - repayAmount;

        // Release collateral: pro-rata on partial, all on full
        uint256 collateral = collateralOf[msg.sender][debtToken][collateralToken];
        uint256 collateralToReturn;
        if (fullRepay) {
            collateralToReturn = collateral;
            collateralOf[msg.sender][debtToken][collateralToken] = 0;
        } else {
            // Pro-rata release: repayAmount / userDebt * collateral
            collateralToReturn = (repayAmount * collateral) / userDebt;
            collateralOf[msg.sender][debtToken][collateralToken] = collateral - collateralToReturn;
        }
        if (collateralToReturn > 0) {
            IERC20(collateralToken).safeTransfer(msg.sender, collateralToReturn);
        }

        emit Repaid(msg.sender, debtToken, collateralToken, repayAmount);
    }

    // ─── Liquidation ─────────────────────────────────────────────────────────
    /// @notice Liquidate an under-collateralised position.
    ///         Liquidator repays all debt and receives collateral + liqBonusBps bonus.
    function liquidate(
        address borrower,
        address debtToken,
        address collateralToken
    ) external nonReentrant {
        _requireListed(debtToken);
        _requireListed(collateralToken);
        _accrue(debtToken);

        if (healthFactorOf(borrower, debtToken, collateralToken) >= ONE) revert HealthFactorOk();

        uint256 userShares = positionBorrowShares[borrower][debtToken][collateralToken];
        if (userShares == 0) revert NoDebt();

        uint256 tbs  = totalBorrowShares[debtToken];
        uint256 tb   = totalBorrowed[debtToken];
        uint256 debt = (userShares * tb) / tbs;
        uint256 collateral = collateralOf[borrower][debtToken][collateralToken];

        // Liquidator repays full debt
        IERC20(debtToken).safeTransferFrom(msg.sender, address(this), debt);

        // How much collateral does debt + bonus equal?
        uint256 debtUsd  = _usdValue(debtToken, debt);
        uint256 bonusBps = assetConfig[collateralToken].liqBonusBps;
        uint256 seizeUsd = (debtUsd * (BPS + bonusBps)) / BPS;
        uint256 oneUnit  = 10 ** assetConfig[collateralToken].decimals;
        uint256 collPricePerUnit = _usdValue(collateralToken, oneUnit);
        uint256 collateralSeize = (seizeUsd * oneUnit) / collPricePerUnit;
        uint256 toLiquidator = collateralSeize > collateral ? collateral : collateralSeize;
        uint256 remainder    = collateral - toLiquidator;

        positionBorrowShares[borrower][debtToken][collateralToken] = 0;
        totalBorrowShares[debtToken] = tbs - userShares;
        totalBorrowed[debtToken]     = tb  - debt;
        collateralOf[borrower][debtToken][collateralToken] = 0;

        IERC20(collateralToken).safeTransfer(msg.sender, toLiquidator);
        if (remainder > 0) {
            IERC20(collateralToken).safeTransfer(borrower, remainder);
        }

        emit Liquidated(borrower, msg.sender, debtToken, collateralToken, debt, toLiquidator);
    }

    // ─── Views ───────────────────────────────────────────────────────────────
    /// @notice Health factor for a specific (debtToken, collateralToken) position.
    ///         Returns type(uint256).max when there is no debt.
    ///         Healthy when >= ONE (1e18).
    function healthFactorOf(
        address user,
        address debtToken,
        address collateralToken
    ) public view returns (uint256) {
        uint256 userShares = positionBorrowShares[user][debtToken][collateralToken];
        if (userShares == 0) return type(uint256).max;
        uint256 tbs = totalBorrowShares[debtToken];
        if (tbs == 0) return type(uint256).max;
        uint256 debt = (userShares * _pendingTotalBorrowed(debtToken)) / tbs;
        if (debt == 0) return type(uint256).max;

        uint256 collateral   = collateralOf[user][debtToken][collateralToken];
        uint256 debtUsd      = _usdValue(debtToken, debt);
        uint256 collUsd      = _usdValue(collateralToken, collateral);
        uint16  liqThreshBps = assetConfig[debtToken].liqThreshBps;

        // HF = (collUsd * liqThreshBps / BPS) / debtUsd  scaled to 1e18
        return (collUsd * liqThreshBps * ONE) / (debtUsd * BPS);
    }

    function suppliedBalance(address user, address token) external view returns (uint256) {
        uint256 ts = totalSupplyShares[token];
        if (ts == 0) return 0;
        return (supplyShares[user][token] * _pendingTotalSupplied(token)) / ts;
    }

    function borrowedBalance(
        address user,
        address debtToken,
        address collateralToken
    ) external view returns (uint256) {
        uint256 tbs = totalBorrowShares[debtToken];
        if (tbs == 0) return 0;
        return (positionBorrowShares[user][debtToken][collateralToken] * _pendingTotalBorrowed(debtToken)) / tbs;
    }

    function utilization(address token) external view returns (uint256) {
        uint256 t = _pendingTotalSupplied(token);
        if (t == 0) return 0;
        return (_pendingTotalBorrowed(token) * ONE) / t;
    }

    function listedAssetsCount() external view returns (uint256) {
        return listedAssets.length;
    }
}
