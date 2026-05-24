// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MockOracle — Test-only oracle implementing IPriceOracle.
/// @notice setUsdPrice(token, price) where price is 1e18-scaled USD per 1 whole token.
///         e.g. setUsdPrice(USDC, 1e18)        → 1 USDC = $1.00
///              setUsdPrice(EURC, 1.08e18)      → 1 EURC = $1.08
///              setUsdPrice(cirBTC, 105_000e18) → 1 BTC  = $105 000
///         valueInUsd(token, amount) = amount * pricePerWhole / 10**decimals
contract MockOracle {
    mapping(address => uint256) private _usdPrice;   // 1e18-scaled USD per whole token
    mapping(address => uint8)   private _decimals;

    /// @param token    ERC-20 token address.
    /// @param decimals_ Token decimals (6 for USDC/EURC, 8 for cirBTC, 18 for standard).
    /// @param pricePerWhole USD value of 1 whole token, scaled to 1e18.
    function setUsdPrice(address token, uint8 decimals_, uint256 pricePerWhole) external {
        _usdPrice[token]  = pricePerWhole;
        _decimals[token]  = decimals_;
    }

    /// @notice Returns USD value of `amount` raw token units, scaled to 1e18.
    ///         Implements IPriceOracle.valueInUsd(token, amount).
    function valueInUsd(address token, uint256 amount) external view returns (uint256) {
        uint256 price = _usdPrice[token];
        if (price == 0) return 0; // unset → caller (Vault) will revert
        uint8 dec = _decimals[token];
        // value = amount * price / 10**dec
        return (amount * price) / (10 ** dec);
    }
}
