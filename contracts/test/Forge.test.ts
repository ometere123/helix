import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";
import type { GetContractReturnType, WalletClient } from "@nomicfoundation/hardhat-viem/types";

const _100 = parseUnits("100", 6);

describe("Forge", () => {
  let viem: Awaited<ReturnType<typeof network.connect>>["viem"];
  let poster: WalletClient;
  let worker: WalletClient;
  let outsider: WalletClient;
  let usdc: GetContractReturnType<"MockERC20">;
  let forge: GetContractReturnType<"Forge">;

  before(async () => {
    ({ viem } = await network.connect());
    [poster, worker, outsider] = await viem.getWalletClients();
  });

  beforeEach(async () => {
    usdc = await viem.deployContract("MockERC20", ["USDC", "USDC", 6]);
    forge = await viem.deployContract("Forge", []);
    await usdc.write.mint([poster.account.address, parseUnits("1000", 6)]);
    await usdc.write.approve([forge.address, parseUnits("1000", 6)], { account: poster.account });
  });

  async function postBounty(uri = "ipfs://Qm.../task.json"): Promise<`0x${string}`> {
    const publicClient = await viem.getPublicClient();
    const hash = await forge.write.postBounty([usdc.address, _100, uri], { account: poster.account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === forge.address.toLowerCase());
    if (!log) throw new Error("BountyPosted log not found");
    return log.topics[1] as `0x${string}`;
  }

  it("postBounty escrows funds and tracks the id", async () => {
    const id = await postBounty();
    const total = await forge.read.totalBounties();
    assert.equal(total, 1n);

    const escrowed = await usdc.read.balanceOf([forge.address]);
    assert.equal(escrowed, _100);

    const b = await forge.read.bounties([id]);
    assert.equal(b[0].toLowerCase(), poster.account.address.toLowerCase()); // poster
    assert.equal(b[2], _100); // amount
  });

  it("releaseBounty pays the worker", async () => {
    const id = await postBounty();
    const before = await usdc.read.balanceOf([worker.account.address]);
    await forge.write.releaseBounty([id, worker.account.address], { account: poster.account });
    const after = await usdc.read.balanceOf([worker.account.address]);
    assert.equal(after - before, _100);
  });

  it("releaseBounty reverts when not poster", async () => {
    const id = await postBounty();
    await assert.rejects(
      forge.write.releaseBounty([id, worker.account.address], { account: outsider.account }),
      /NotPoster/,
    );
  });

  it("cancelBounty refunds the poster", async () => {
    const id = await postBounty();
    const before = await usdc.read.balanceOf([poster.account.address]);
    await forge.write.cancelBounty([id], { account: poster.account });
    const after = await usdc.read.balanceOf([poster.account.address]);
    assert.equal(after - before, _100);
  });

  it("cannot release after cancel", async () => {
    const id = await postBounty();
    await forge.write.cancelBounty([id], { account: poster.account });
    await assert.rejects(
      forge.write.releaseBounty([id, worker.account.address], { account: poster.account }),
      /AlreadySettled/,
    );
  });

  it("cannot cancel after release", async () => {
    const id = await postBounty();
    await forge.write.releaseBounty([id, worker.account.address], { account: poster.account });
    await assert.rejects(
      forge.write.cancelBounty([id], { account: poster.account }),
      /AlreadySettled/,
    );
  });

  it("listBounties paginates", async () => {
    await postBounty("ipfs://a");
    await postBounty("ipfs://b");
    await postBounty("ipfs://c");
    const page = await forge.read.listBounties([0n, 2n]);
    assert.equal(page.length, 2);
  });
});
