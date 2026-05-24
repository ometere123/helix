// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Streamline — Recurring stablecoin payments executed by a permissionless crank.
contract Streamline is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Schedule {
        address payer;
        address recipient;
        address token;
        uint256 amount;
        uint256 interval;
        uint256 remaining;
        uint256 lastExecutedAt;
        bool cancelled;
    }

    mapping(bytes32 => Schedule) public schedules;

    error InvalidParams();
    error NotPayer();
    error IntervalNotElapsed();
    error ScheduleComplete();
    error ScheduleCancelled();
    error AlreadyExists();

    event ScheduleCreated(
        bytes32 indexed scheduleId,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 totalPayments
    );
    event PaymentExecuted(bytes32 indexed scheduleId, uint256 remaining, uint256 executedAt);
    event ScheduleCancelledEvent(bytes32 indexed scheduleId);

    function createSchedule(
        address recipient,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 totalPayments
    ) external returns (bytes32 scheduleId) {
        if (recipient == address(0) || token == address(0)) revert InvalidParams();
        if (amount == 0 || interval == 0 || totalPayments == 0) revert InvalidParams();

        scheduleId = keccak256(
            abi.encodePacked(msg.sender, recipient, token, amount, interval, block.timestamp, block.number)
        );
        if (schedules[scheduleId].payer != address(0)) revert AlreadyExists();

        schedules[scheduleId] = Schedule({
            payer: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            interval: interval,
            remaining: totalPayments,
            // Set lastExecutedAt so the first payment is eligible immediately
            lastExecutedAt: block.timestamp - interval,
            cancelled: false
        });

        emit ScheduleCreated(scheduleId, msg.sender, recipient, token, amount, interval, totalPayments);
    }

    function executePayment(bytes32 scheduleId) external nonReentrant {
        Schedule storage s = schedules[scheduleId];
        if (s.cancelled) revert ScheduleCancelled();
        if (s.remaining == 0) revert ScheduleComplete();
        if (block.timestamp < s.lastExecutedAt + s.interval) revert IntervalNotElapsed();

        s.lastExecutedAt = block.timestamp;
        s.remaining -= 1;

        IERC20(s.token).safeTransferFrom(s.payer, s.recipient, s.amount);

        emit PaymentExecuted(scheduleId, s.remaining, block.timestamp);
    }

    function cancelSchedule(bytes32 scheduleId) external {
        Schedule storage s = schedules[scheduleId];
        if (s.payer != msg.sender) revert NotPayer();
        if (s.cancelled) revert ScheduleCancelled();
        s.cancelled = true;
        emit ScheduleCancelledEvent(scheduleId);
    }

    function getSchedule(bytes32 scheduleId) external view returns (Schedule memory) {
        return schedules[scheduleId];
    }

    function nextExecutionAt(bytes32 scheduleId) external view returns (uint256) {
        Schedule storage s = schedules[scheduleId];
        if (s.cancelled || s.remaining == 0) return 0;
        return s.lastExecutedAt + s.interval;
    }
}
