import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import type { GetContractReturnType, WalletClient } from "@nomicfoundation/hardhat-viem/types";

describe("HelixLP", () => {
  let lp: GetContractReturnType<"HelixLP">;
  let minter: WalletClient;
  let other: WalletClient;

  before(async () => {
    const { viem } = await network.connect();
    [minter, other] = await viem.getWalletClients();
    lp = await viem.deployContract("HelixLP", [minter.account.address]);
  });

  it("sets the minter on construction", async () => {
    const m = await lp.read.minter();
    assert.equal(m.toLowerCase(), minter.account.address.toLowerCase());
  });

  it("has name and symbol", async () => {
    assert.equal(await lp.read.name(), "Helix LP");
    assert.equal(await lp.read.symbol(), "hLP");
  });

  it("minter can mint", async () => {
    await lp.write.mint([other.account.address, 1000n]);
    assert.equal(await lp.read.balanceOf([other.account.address]), 1000n);
  });

  it("minter can burn", async () => {
    await lp.write.burn([other.account.address, 400n]);
    assert.equal(await lp.read.balanceOf([other.account.address]), 600n);
  });

  it("non-minter cannot mint", async () => {
    await assert.rejects(
      lp.write.mint([other.account.address, 1n], { account: other.account }),
      /OnlyMinter/,
    );
  });

  it("non-minter cannot burn", async () => {
    await assert.rejects(
      lp.write.burn([other.account.address, 1n], { account: other.account }),
      /OnlyMinter/,
    );
  });
});
