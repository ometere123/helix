// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentRegistry — On-chain agent registry with x402-style pay-per-invoke settlement.
/// @notice invokeAgent() is the on-chain payment leg. The actual off-chain endpoint call
///         (HTTPS / IPFS) is the caller's responsibility — this contract only settles payment.
contract AgentRegistry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Agent {
        address owner;
        string name;
        string endpointURL;
        string metadataURI;  // x402 v2 payment manifest URI (JSON describing asset, network, payTo, etc.)
        string[] capabilities;
        address paymentToken;
        uint256 pricePerCall;
        bool active;
        uint256 totalEarned;
        uint256 totalCalls;
    }

    mapping(bytes32 => Agent) private _agents;
    bytes32[] public agentIds;

    error InvalidParams();
    error NotOwner();
    error AgentNotFound();
    error AgentInactive();
    error AlreadyExists();

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        string name,
        address paymentToken,
        uint256 pricePerCall,
        string metadataURI
    );
    event AgentUpdated(bytes32 indexed agentId, string endpointURL, uint256 pricePerCall, string metadataURI);
    event AgentStatusChanged(bytes32 indexed agentId, bool active);
    event AgentInvoked(
        bytes32 indexed agentId,
        address indexed caller,
        address indexed agentOwner,
        uint256 amountPaid
    );

    function registerAgent(
        string calldata name,
        string calldata endpointURL,
        string calldata metadataURI,
        string[] calldata capabilities,
        address paymentToken,
        uint256 pricePerCall
    ) external returns (bytes32 agentId) {
        if (bytes(name).length == 0 || bytes(endpointURL).length == 0) revert InvalidParams();
        if (paymentToken == address(0) || pricePerCall == 0) revert InvalidParams();
        if (capabilities.length == 0) revert InvalidParams();

        agentId = keccak256(abi.encodePacked(msg.sender, name, block.timestamp, block.number));
        if (_agents[agentId].owner != address(0)) revert AlreadyExists();

        Agent storage a = _agents[agentId];
        a.owner = msg.sender;
        a.name = name;
        a.endpointURL = endpointURL;
        a.metadataURI = metadataURI;
        for (uint256 i = 0; i < capabilities.length; i++) {
            a.capabilities.push(capabilities[i]);
        }
        a.paymentToken = paymentToken;
        a.pricePerCall = pricePerCall;
        a.active = true;
        agentIds.push(agentId);

        emit AgentRegistered(agentId, msg.sender, name, paymentToken, pricePerCall, metadataURI);
    }

    function updateAgent(
        bytes32 agentId,
        string calldata endpointURL,
        string calldata metadataURI,
        uint256 pricePerCall
    ) external {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0)) revert AgentNotFound();
        if (a.owner != msg.sender) revert NotOwner();
        if (bytes(endpointURL).length == 0 || pricePerCall == 0) revert InvalidParams();
        a.endpointURL = endpointURL;
        a.metadataURI = metadataURI;
        a.pricePerCall = pricePerCall;
        emit AgentUpdated(agentId, endpointURL, pricePerCall, metadataURI);
    }

    function setActive(bytes32 agentId, bool active) external {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0)) revert AgentNotFound();
        if (a.owner != msg.sender) revert NotOwner();
        a.active = active;
        emit AgentStatusChanged(agentId, active);
    }

    function invokeAgent(bytes32 agentId) external nonReentrant {
        Agent storage a = _agents[agentId];
        if (a.owner == address(0)) revert AgentNotFound();
        if (!a.active) revert AgentInactive();

        uint256 price = a.pricePerCall;
        IERC20(a.paymentToken).safeTransferFrom(msg.sender, a.owner, price);
        a.totalEarned += price;
        a.totalCalls += 1;

        emit AgentInvoked(agentId, msg.sender, a.owner, price);
    }

    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    function totalAgents() external view returns (uint256) {
        return agentIds.length;
    }

    function listAgents(uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        uint256 total = agentIds.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;
        page = new bytes32[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = agentIds[offset + i];
        }
    }
}
