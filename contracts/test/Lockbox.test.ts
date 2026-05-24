import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, parseUnits, toHex, encodePacked } from "viem";
import type { GetContractReturnType, WalletClient, TestClient } from "@nomicfoundation/hardhat-viem/types";

const _50 = parseUnits("50", 6);
const NONCE = "0x" + "ab".repeat(32) as `0x${string}`;
const NONCE_HASH = keccak256(encodePacked(["bytes32"], [NONCE]));

describe("Lockbox", () => {
  let viem: Awaited<ReturnType<typeof network.connect>>["viem"];
  let alice: WalletClient;
  let bob: WalletClient;
  let usdc: GetContractReturnType<"MockERC20">;
  let lockbox: GetContractReturnType<"Lockbox">;
  let testClient: TestClient;

  before(async () => {
    ({ viem } = await network.connect());
    [alice, bob] = await viem.getWalletClients();
    testClient = await viem.getTestClient();
  });

  beforeEach(async () => {
    usdc = await viem.deployContract("MockERC20", ["USDC", "USDC", 6]);
    lockbox = await viem.deployContract("Lockbox", []);
    await usdc.write.mint([alice.account.address, parseUnits("1000", 6)]);
    await usdc.write.approve([lockbox.address, parseUnits("1000", 6)], { account: alice.account });
  });

  async function createLock(expiryOffset: number): Promise<`0x${string}`> {
    const publicClient = await viem.getPublicClient();
    const block = await publicClient.getBlock();
    const expiry = block.timestamp + BigInt(expiryOffset);
    const hash = await lockbox.write.deposit(
      [usdc.address, _50, NONCE_HASH, expiry],
      { account: alice.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const log = receipt.logs.find((l) => l.address.toLowerCase() === lockbox.address.toLowerCase());
    if (!log) throw new Error("LockCreated log not found");
    return log.topics[1] as `0x${string}`;
  }

  it("claim transfers funds when nonce matches", async () => {
    const id = await createLock(3600);
    const before = await usdc.read.balanceOf([bob.account.address]);
    await lockbox.write.claim([id, NONCE], { account: bob.account });
    const after = await usdc.read.balanceOf([bob.account.address]);
    assert.equal(after - before, _50);
  });

  it("claim reverts on wrong nonce", async () => {
    const id = await createLock(3600);
    const wrong = "0x" + "cd".repeat(32) as `0x${string}`;
    await assert.rejects(
      lockbox.write.claim([id, wrong], { account: bob.account }),
      /InvalidNonce/,
    );
  });

  it("claim reverts after expiry", async () => {
    const id = await createLock(60);
    await testClient.increaseTime({ seconds: 120 });
    await testClient.mine({ blocks: 1 });
    await assert.rejects(
      lockbox.write.claim([id, NONCE], { account: bob.account }),
      /Expired/,
    );
  });

  it("double-claim reverts", async () => {
    const id = await createLock(3600);
    await lockbox.write.claim([id, NONCE], { account: bob.account });
    await assert.rejects(
      lockbox.write.claim([id, NONCE], { account: bob.account }),
      /AlreadyClaimed/,
    );
  });

  it("refund returns funds to depositor after expiry", async () => {
    const id = await createLock(60);
    await testClient.increaseTime({ seconds: 120 });
    await testClient.mine({ blocks: 1 });

    const before = await usdc.read.balanceOf([alice.account.address]);
    await lockbox.write.refund([id], { account: alice.account });
    const after = await usdc.read.balanceOf([alice.account.address]);
    assert.equal(after - before, _50);
  });

  it("refund reverts before expiry", async () => {
    const id = await createLock(3600);
    await assert.rejects(
      lockbox.write.refund([id], { account: alice.account }),
      /NotExpired/,
    );
  });

  it("refund reverts for non-depositor", async () => {
    const id = await createLock(60);
    await testClient.increaseTime({ seconds: 120 });
    await testClient.mine({ blocks: 1 });
    await assert.rejects(
      lockbox.write.refund([id], { account: bob.account }),
      /NotDepositor/,
    );
  });
});
