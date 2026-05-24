import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";
import type { GetContractReturnType, WalletClient, TestClient } from "@nomicfoundation/hardhat-viem/types";

const _10 = parseUnits("10", 6);

describe("Streamline", () => {
  let viem: Awaited<ReturnType<typeof network.connect>>["viem"];
  let payer: WalletClient;
  let recipient: WalletClient;
  let cranker: WalletClient;
  let usdc: GetContractReturnType<"MockERC20">;
  let streamline: GetContractReturnType<"Streamline">;
  let testClient: TestClient;

  before(async () => {
    ({ viem } = await network.connect());
    [payer, recipient, cranker] = await viem.getWalletClients();
    testClient = await viem.getTestClient();
  });

  beforeEach(async () => {
    usdc = await viem.deployContract("MockERC20", ["USDC", "USDC", 6]);
    streamline = await viem.deployContract("Streamline", []);
    await usdc.write.mint([payer.account.address, parseUnits("1000", 6)]);
    await usdc.write.approve([streamline.address, parseUnits("1000", 6)], { account: payer.account });
  });

  async function createSchedule(intervalSec: number, total: number): Promise<`0x${string}`> {
    const hash = await streamline.write.createSchedule(
      [recipient.account.address, usdc.address, _10, BigInt(intervalSec), BigInt(total)],
      { account: payer.account },
    );
    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // Parse ScheduleCreated event for the id
    const log = receipt.logs.find((l) => l.address.toLowerCase() === streamline.address.toLowerCase());
    if (!log) throw new Error("ScheduleCreated log not found");
    // First indexed topic after the event signature is scheduleId
    return log.topics[1] as `0x${string}`;
  }

  it("first executePayment succeeds immediately", async () => {
    const id = await createSchedule(60, 3);
    await streamline.write.executePayment([id], { account: cranker.account });
    const bal = await usdc.read.balanceOf([recipient.account.address]);
    assert.equal(bal, _10);
  });

  it("second executePayment reverts until interval elapses", async () => {
    const id = await createSchedule(60, 3);
    await streamline.write.executePayment([id], { account: cranker.account });

    await assert.rejects(
      streamline.write.executePayment([id], { account: cranker.account }),
      /IntervalNotElapsed/,
    );

    await testClient.increaseTime({ seconds: 61 });
    await testClient.mine({ blocks: 1 });
    await streamline.write.executePayment([id], { account: cranker.account });
    assert.equal(await usdc.read.balanceOf([recipient.account.address]), _10 * 2n);
  });

  it("completes after totalPayments and reverts further calls", async () => {
    const id = await createSchedule(1, 2);
    await streamline.write.executePayment([id], { account: cranker.account });
    await testClient.increaseTime({ seconds: 2 });
    await testClient.mine({ blocks: 1 });
    await streamline.write.executePayment([id], { account: cranker.account });

    await testClient.increaseTime({ seconds: 2 });
    await testClient.mine({ blocks: 1 });
    await assert.rejects(
      streamline.write.executePayment([id], { account: cranker.account }),
      /ScheduleComplete/,
    );
  });

  it("cancel blocks further payments", async () => {
    const id = await createSchedule(60, 3);
    await streamline.write.cancelSchedule([id], { account: payer.account });
    await assert.rejects(
      streamline.write.executePayment([id], { account: cranker.account }),
      /ScheduleCancelled/,
    );
  });

  it("only payer can cancel", async () => {
    const id = await createSchedule(60, 3);
    await assert.rejects(
      streamline.write.cancelSchedule([id], { account: recipient.account }),
      /NotPayer/,
    );
  });

  it("rejects zero-amount or zero-interval params", async () => {
    await assert.rejects(
      streamline.write.createSchedule(
        [recipient.account.address, usdc.address, 0n, 60n, 3n],
        { account: payer.account },
      ),
      /InvalidParams/,
    );
    await assert.rejects(
      streamline.write.createSchedule(
        [recipient.account.address, usdc.address, _10, 0n, 3n],
        { account: payer.account },
      ),
      /InvalidParams/,
    );
  });
});
