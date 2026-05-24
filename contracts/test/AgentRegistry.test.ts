import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";
import type { GetContractReturnType, WalletClient } from "@nomicfoundation/hardhat-viem/types";

const PRICE = parseUnits("0.10", 6); // 10 cents per call

describe("AgentRegistry", () => {
  let viem: Awaited<ReturnType<typeof network.connect>>["viem"];
  let agentOwner: WalletClient;
  let caller: WalletClient;
  let outsider: WalletClient;
  let usdc: GetContractReturnType<"MockERC20">;
  let registry: GetContractReturnType<"AgentRegistry">;

  before(async () => {
    ({ viem } = await network.connect());
    [agentOwner, caller, outsider] = await viem.getWalletClients();
  });

  beforeEach(async () => {
    usdc = await viem.deployContract("MockERC20", ["USDC", "USDC", 6]);
    registry = await viem.deployContract("AgentRegistry", []);
    await usdc.write.mint([caller.account.address, parseUnits("100", 6)]);
    await usdc.write.approve([registry.address, parseUnits("100", 6)], { account: caller.account });
  });

  async function register(name = "TestBot", capabilities = ["text-gen"]): Promise<`0x${string}`> {
    const publicClient = await viem.getPublicClient();
    const hash = await registry.write.registerAgent(
      [name, "https://agent.example.com/api", "ipfs://x402-manifest", capabilities, usdc.address, PRICE],
      { account: agentOwner.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === registry.address.toLowerCase());
    if (!log) throw new Error("AgentRegistered log not found");
    return log.topics[1] as `0x${string}`;
  }

  it("registers an agent", async () => {
    const id = await register();
    const total = await registry.read.totalAgents();
    assert.equal(total, 1n);
    const a = await registry.read.getAgent([id]);
    assert.equal(a.owner.toLowerCase(), agentOwner.account.address.toLowerCase());
    assert.equal(a.name, "TestBot");
    assert.equal(a.active, true);
    assert.equal(a.pricePerCall, PRICE);
  });

  it("invokeAgent transfers price to the agent owner", async () => {
    const id = await register();
    const before = await usdc.read.balanceOf([agentOwner.account.address]);
    await registry.write.invokeAgent([id], { account: caller.account });
    const after = await usdc.read.balanceOf([agentOwner.account.address]);
    assert.equal(after - before, PRICE);

    const a = await registry.read.getAgent([id]);
    assert.equal(a.totalCalls, 1n);
    assert.equal(a.totalEarned, PRICE);
  });

  it("invokeAgent reverts on inactive agent", async () => {
    const id = await register();
    await registry.write.setActive([id, false], { account: agentOwner.account });
    await assert.rejects(
      registry.write.invokeAgent([id], { account: caller.account }),
      /AgentInactive/,
    );
  });

  it("updateAgent restricted to owner", async () => {
    const id = await register();
    await assert.rejects(
      registry.write.updateAgent([id, "https://new.url", "ipfs://new", parseUnits("0.20", 6)], { account: outsider.account }),
      /NotOwner/,
    );
    await registry.write.updateAgent([id, "https://new.url", "ipfs://new", parseUnits("0.20", 6)], { account: agentOwner.account });
    const a = await registry.read.getAgent([id]);
    assert.equal(a.endpointURL, "https://new.url");
    assert.equal(a.metadataURI, "ipfs://new");
    assert.equal(a.pricePerCall, parseUnits("0.20", 6));
  });

  it("setActive restricted to owner", async () => {
    const id = await register();
    await assert.rejects(
      registry.write.setActive([id, false], { account: outsider.account }),
      /NotOwner/,
    );
  });

  it("rejects empty name or capabilities", async () => {
    await assert.rejects(
      registry.write.registerAgent(["", "https://x", "", ["t"], usdc.address, PRICE], { account: agentOwner.account }),
      /InvalidParams/,
    );
    await assert.rejects(
      registry.write.registerAgent(["Bot", "https://x", "", [], usdc.address, PRICE], { account: agentOwner.account }),
      /InvalidParams/,
    );
  });

  it("listAgents paginates", async () => {
    await register("A");
    await register("B");
    await register("C");
    const page = await registry.read.listAgents([1n, 2n]);
    assert.equal(page.length, 2);
  });
});
