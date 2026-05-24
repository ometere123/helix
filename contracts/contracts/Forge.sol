// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Forge — Agent Task Market with on-chain proof-of-completion.
///
/// Flow:
///   1. Poster calls postBounty()   — funds escrowed into contract.
///   2. Worker calls submitWork()   — registers their address + deliverable hash + URI.
///   3a. Poster satisfied           → releaseBounty() → funds transferred to worker instantly.
///   3b. Poster disputes            → disputeWork()   → submission cleared, bounty reopens.
///   3c. Poster silent > 3 days     → worker calls finalizeWork() → auto-payout.
///
/// This makes fully autonomous agent-to-agent task fulfilment trustless:
/// a worker (human or AI) is guaranteed payment once the dispute window passes,
/// even if the poster goes offline.
contract Forge is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Dispute window: poster has this long after submitWork() to act before
    ///         the worker can self-collect.
    uint256 public constant DISPUTE_WINDOW = 3 days;

    struct Bounty {
        address poster;
        address token;
        uint256 amount;
        string  metadataURI;
        // ── Settlement ────────────────────────────────────────────────────────
        bool released;
        bool cancelled;
        // ── Work submission ───────────────────────────────────────────────────
        address worker;           // address(0) when no submission pending
        bytes32 deliverableHash;  // keccak256 of the work product
        string  submissionURI;    // IPFS / HTTPS pointer to deliverable
        uint256 submittedAt;      // block.timestamp at submission time
    }

    mapping(bytes32 => Bounty) public bounties;
    bytes32[] public bountyIds;

    // ── Errors ────────────────────────────────────────────────────────────────
    error InvalidParams();
    error NotPoster();
    error NotWorker();
    error AlreadySettled();
    error BountyNotFound();
    error AlreadySubmitted();
    error NoSubmission();
    error WindowNotExpired();
    error HasPendingWork();

    // ── Events ────────────────────────────────────────────────────────────────
    event BountyPosted(
        bytes32 indexed bountyId,
        address indexed poster,
        address indexed token,
        uint256 amount,
        string  metadataURI
    );
    event WorkSubmitted(
        bytes32 indexed bountyId,
        address indexed worker,
        bytes32 deliverableHash,
        string  submissionURI
    );
    event WorkDisputed(
        bytes32 indexed bountyId,
        address indexed poster,
        address indexed rejectedWorker
    );
    event BountyReleased(bytes32 indexed bountyId, address indexed worker, uint256 amount);
    event WorkFinalized(bytes32 indexed bountyId, address indexed worker, uint256 amount);
    event BountyCancelled(bytes32 indexed bountyId);

    // ── Poster actions ────────────────────────────────────────────────────────

    function postBounty(address token, uint256 amount, string calldata metadataURI)
        external
        nonReentrant
        returns (bytes32 bountyId)
    {
        if (token == address(0) || amount == 0 || bytes(metadataURI).length == 0)
            revert InvalidParams();

        bountyId = keccak256(
            abi.encodePacked(msg.sender, token, amount, metadataURI, block.timestamp, block.number)
        );

        bounties[bountyId] = Bounty({
            poster:          msg.sender,
            token:           token,
            amount:          amount,
            metadataURI:     metadataURI,
            released:        false,
            cancelled:       false,
            worker:          address(0),
            deliverableHash: bytes32(0),
            submissionURI:   "",
            submittedAt:     0
        });
        bountyIds.push(bountyId);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit BountyPosted(bountyId, msg.sender, token, amount, metadataURI);
    }

    /// @notice Poster approves the submitted work and pays the worker immediately.
    ///         Requires submitWork() to have been called first.
    function releaseBounty(bytes32 bountyId) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        if (b.poster == address(0))      revert BountyNotFound();
        if (b.poster != msg.sender)      revert NotPoster();
        if (b.released || b.cancelled)   revert AlreadySettled();
        if (b.worker == address(0))      revert NoSubmission();

        address worker = b.worker;
        b.released = true;
        IERC20(b.token).safeTransfer(worker, b.amount);
        emit BountyReleased(bountyId, worker, b.amount);
    }

    /// @notice Poster rejects the submitted work. Clears the worker slot so a new
    ///         submission can come in. The bounty stays open; funds remain escrowed.
    function disputeWork(bytes32 bountyId) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        if (b.poster == address(0))    revert BountyNotFound();
        if (b.poster != msg.sender)    revert NotPoster();
        if (b.released || b.cancelled) revert AlreadySettled();
        if (b.worker == address(0))    revert NoSubmission();

        address rejected = b.worker;
        b.worker          = address(0);
        b.deliverableHash = bytes32(0);
        b.submissionURI   = "";
        b.submittedAt     = 0;

        emit WorkDisputed(bountyId, msg.sender, rejected);
    }

    /// @notice Cancel a bounty that has no pending submission. Returns funds to poster.
    function cancelBounty(bytes32 bountyId) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        if (b.poster == address(0))    revert BountyNotFound();
        if (b.poster != msg.sender)    revert NotPoster();
        if (b.released || b.cancelled) revert AlreadySettled();
        if (b.worker != address(0))    revert HasPendingWork();

        b.cancelled = true;
        IERC20(b.token).safeTransfer(b.poster, b.amount);
        emit BountyCancelled(bountyId);
    }

    // ── Worker actions ────────────────────────────────────────────────────────

    /// @notice Submit proof of completion. First valid submission wins; the bounty
    ///         is locked for this worker until the poster acts or the window expires.
    /// @param deliverableHash  keccak256 of the work product (content-addressed proof).
    /// @param submissionURI    IPFS / HTTPS URL pointing to the deliverable.
    function submitWork(
        bytes32 bountyId,
        bytes32 deliverableHash,
        string calldata submissionURI
    ) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        if (b.poster == address(0))                             revert BountyNotFound();
        if (b.released || b.cancelled)                          revert AlreadySettled();
        if (b.worker != address(0))                             revert AlreadySubmitted();
        if (deliverableHash == bytes32(0) || bytes(submissionURI).length == 0)
                                                                revert InvalidParams();

        b.worker          = msg.sender;
        b.deliverableHash = deliverableHash;
        b.submissionURI   = submissionURI;
        b.submittedAt     = block.timestamp;

        emit WorkSubmitted(bountyId, msg.sender, deliverableHash, submissionURI);
    }

    /// @notice Worker self-collects after DISPUTE_WINDOW has elapsed with no response
    ///         from the poster. This is the trustless guarantee for autonomous agents.
    function finalizeWork(bytes32 bountyId) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        if (b.poster == address(0))                              revert BountyNotFound();
        if (b.released || b.cancelled)                           revert AlreadySettled();
        if (b.worker == address(0))                              revert NoSubmission();
        if (b.worker != msg.sender)                              revert NotWorker();
        if (block.timestamp < b.submittedAt + DISPUTE_WINDOW)    revert WindowNotExpired();

        address worker = b.worker;
        b.released = true;
        IERC20(b.token).safeTransfer(worker, b.amount);
        emit WorkFinalized(bountyId, worker, b.amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function totalBounties() external view returns (uint256) {
        return bountyIds.length;
    }

    function listBounties(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory page)
    {
        uint256 total = bountyIds.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new bytes32[](end - offset);
        for (uint256 i = 0; i < end - offset; i++) {
            page[i] = bountyIds[offset + i];
        }
    }
}
