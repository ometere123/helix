// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Lockbox — Commit-reveal claim links for stablecoin transfers.
/// @notice Depositor commits to keccak256(nonce). Recipient reveals the nonce to claim.
///         After expiry, anyone can trigger refund — funds always return to the original depositor.
contract Lockbox is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Lock {
        address depositor;
        address token;
        uint256 amount;
        uint256 expiry;
        bytes32 nonceHash;
        bool claimed;
        bool refunded;
    }

    mapping(bytes32 => Lock) public locks;

    error InvalidParams();
    error LockNotFound();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error Expired();
    error NotExpired();
    error InvalidNonce();

    event LockCreated(
        bytes32 indexed lockId,
        address indexed depositor,
        address indexed token,
        uint256 amount,
        uint256 expiry
    );
    event Claimed(bytes32 indexed lockId, address indexed claimant, uint256 amount);
    event Refunded(bytes32 indexed lockId, address indexed depositor, uint256 amount);

    function deposit(address token, uint256 amount, bytes32 nonceHash, uint256 expiry)
        external
        nonReentrant
        returns (bytes32 lockId)
    {
        if (token == address(0) || amount == 0 || nonceHash == bytes32(0)) revert InvalidParams();
        if (expiry <= block.timestamp) revert InvalidParams();

        lockId = keccak256(abi.encodePacked(msg.sender, nonceHash, block.timestamp, block.number));

        locks[lockId] = Lock({
            depositor: msg.sender,
            token: token,
            amount: amount,
            expiry: expiry,
            nonceHash: nonceHash,
            claimed: false,
            refunded: false
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit LockCreated(lockId, msg.sender, token, amount, expiry);
    }

    function claim(bytes32 lockId, bytes32 nonce) external nonReentrant {
        Lock storage l = locks[lockId];
        if (l.depositor == address(0)) revert LockNotFound();
        if (l.claimed) revert AlreadyClaimed();
        if (l.refunded) revert AlreadyRefunded();
        if (block.timestamp >= l.expiry) revert Expired();
        if (keccak256(abi.encodePacked(nonce)) != l.nonceHash) revert InvalidNonce();

        l.claimed = true;
        IERC20(l.token).safeTransfer(msg.sender, l.amount);
        emit Claimed(lockId, msg.sender, l.amount);
    }

    function refund(bytes32 lockId) external nonReentrant {
        Lock storage l = locks[lockId];
        if (l.depositor == address(0)) revert LockNotFound();
        if (l.claimed) revert AlreadyClaimed();
        if (l.refunded) revert AlreadyRefunded();
        if (block.timestamp < l.expiry) revert NotExpired();

        l.refunded = true;
        IERC20(l.token).safeTransfer(l.depositor, l.amount);
        emit Refunded(lockId, l.depositor, l.amount);
    }
}
