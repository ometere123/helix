import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";
import type { GetContractReturnType, WalletClient } from "@nomicfoundation/hardhat-viem/types";

const ONE_USDC = parseUnits("1", 6);

describe("FluxAMM (StableSwap)", () => {
  let viem: Awaited<ReturnType<typeof network.connect>>["viem"];
  let alice: WalletClient;
  let bob: WalletClient;
  let usdc: GetContractReturnType<"MockERC20">;
  let eurc: GetContractReturnType<"MockERC20">;
  let amm: GetContractReturnType<"FluxAMM">;

  before(async () => {
    ({ viem } = await network.connect());
    [alice, bob] = await viem.getWalletClients();
  });

  beforeEach(async () => {
    usdc = await viem.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    eurc = await viem.deployContract("MockERC20", ["Euro Coin", "EURC", 6]);
    amm = await viem.deployContract("FluxAMM", [usdc.address, eurc.address]);

    const ONE_M = parseUnits("1000000", 6);
    for (const w of [alice, bob]) {
      await usdc.write.mint([w.account.address, ONE_M]);
      await eurc.write.mint([w.account.address, ONE_M]);
      await usdc.write.approve([amm.address, ONE_M], { account: w.account });
      await eurc.write.approve([amm.address, ONE_M], { account: w.account });
    }
  });

  it("first addLiquidity mints D as shares", async () => {
    const usdcAmt = parseUnits("1000", 6);
    const eurcAmt = parseUnits("1000", 6);
    await amm.write.addLiquidity([usdcAmt, eurcAmt], { account: alice.account });

    const [r0, r1, totalLP] = await amm.read.poolStats();
    assert.equal(r0, usdcAmt);
    assert.equal(r1, eurcAmt);
    // Balanced 1000+1000 deposit → D ≈ 2000e6
    assert.ok(totalLP > parseUnits("1990", 6) && totalLP < parseUnits("2010", 6),
      `expected D ≈ 2000e6, got ${totalLP}`);

    const lpAddr = await amm.read.lpToken();
    const lp = await viem.getContractAt("HelixLP", lpAddr);
    assert.equal(await lp.read.balanceOf([alice.account.address]), totalLP);
  });

  it("subsequent addLiquidity gives proportional shares", async () => {
    await amm.write.addLiquidity([parseUnits("1000", 6), parseUnits("1000", 6)], { account: alice.account });
    const lpAddr = await amm.read.lpToken();
    const lp = await viem.getContractAt("HelixLP", lpAddr);
    const aliceShares = await lp.read.balanceOf([alice.account.address]);

    await amm.write.addLiquidity([parseUnits("500", 6), parseUnits("500", 6)], { account: bob.account });
    const bobShares = await lp.read.balanceOf([bob.account.address]);
    // Bob added 50% of Alice's amount → should get ~50% of Alice's shares
    assert.ok(bobShares > 0n && bobShares <= aliceShares / 2n + 10n,
      `bobShares=${bobShares}, expected ≤ ${aliceShares / 2n + 10n}`);
  });

  it("swap near peg has very low slippage (StableSwap advantage)", async () => {
    await amm.write.addLiquidity([parseUnits("1000", 6), parseUnits("1000", 6)], { account: alice.account });

    const out = await amm.read.getAmountOut([usdc.address, ONE_USDC]);
    // With A=100 and balanced reserves, 1 USDC → very close to 1 EURC (minus 4 bps fee + tiny slippage).
    // Expect output > 0.999 USDC (the StableSwap win — x*y=k would give ~0.997)
    assert.ok(out > parseUnits("0.999", 6) && out < ONE_USDC,
      `expected 0.999 < out < 1.0, got ${out}`);

    // Slippage check still works
    await assert.rejects(
      amm.write.swap([usdc.address, ONE_USDC, ONE_USDC], { account: bob.account }),
      /SlippageExceeded/,
    );
    await amm.write.swap([usdc.address, ONE_USDC, out], { account: bob.account });
  });

  it("removeLiquidity returns proportional reserves", async () => {
    await amm.write.addLiquidity([parseUnits("1000", 6), parseUnits("1000", 6)], { account: alice.account });
    const lpAddr = await amm.read.lpToken();
    const lp = await viem.getContractAt("HelixLP", lpAddr);
    const shares = await lp.read.balanceOf([alice.account.address]);

    const usdcBefore = await usdc.read.balanceOf([alice.account.address]);
    const eurcBefore = await eurc.read.balanceOf([alice.account.address]);

    await amm.write.removeLiquidity([shares], { account: alice.account });

    const usdcAfter = await usdc.read.balanceOf([alice.account.address]);
    const eurcAfter = await eurc.read.balanceOf([alice.account.address]);
    assert.ok(usdcAfter - usdcBefore >= parseUnits("999", 6));
    assert.ok(eurcAfter - eurcBefore >= parseUnits("999", 6));
  });

  it("rejects swap of unsupported token", async () => {
    await amm.write.addLiquidity([parseUnits("1000", 6), parseUnits("1000", 6)], { account: alice.account });
    const random = "0x000000000000000000000000000000000000dEaD" as const;
    await assert.rejects(
      amm.write.swap([random, ONE_USDC, 0n], { account: bob.account }),
      /InvalidToken/,
    );
  });

  it("rejects zero-amount addLiquidity", async () => {
    await assert.rejects(
      amm.write.addLiquidity([0n, 0n], { account: alice.account }),
      /ZeroAmount/,
    );
  });

  it("invariantD exposes current D", async () => {
    await amm.write.addLiquidity([parseUnits("1000", 6), parseUnits("1000", 6)], { account: alice.account });
    const d = await amm.read.invariantD();
    assert.ok(d > parseUnits("1990", 6) && d < parseUnits("2010", 6),
      `expected D ≈ 2000e6, got ${d}`);
  });
});
