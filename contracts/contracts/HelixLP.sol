// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title HelixLP — LP share token for FluxAMM.
/// @notice Mint/burn restricted to the FluxAMM pool that created it.
contract HelixLP is ERC20 {
    address public immutable minter;

    error OnlyMinter();

    constructor(address _minter) ERC20("Helix LP", "hLP") {
        minter = _minter;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert OnlyMinter();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != minter) revert OnlyMinter();
        _burn(from, amount);
    }
}
