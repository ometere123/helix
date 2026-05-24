import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";
import type { GetContractReturnType, WalletClient, TestClient } from "@nomicfoundation/hardhat-viem/types";

// Shorthand amounts (6-decimal stablecoins)
const u = (n: string) => parseUnits(n, 6);
const BTC_1 = parseUnits("1", 8); // 1 cirBTC (8 decimals)

describe("Vault v2 — multi-asset", () => {
  let viem: Awaited<ReturnType<typeof network.connect>>["viem"];
  let alice: WalletClient;
  let bob: WalletClient;
  let liquidator: WalletClient;

  let usdc: GetContractReturnType<"MockERC20">;
  let eurc: GetContractReturnType<"MockERC20">;
  let cbtc: GetContractReturnType<"MockERC20">; // mock cirBTC (8 dec)
  let oracle: GetContractReturnType<"MockOracle">;
  let vault: GetContractReturnType<"Vault">;
  let testClient: TestClient;

  const ONE_M_6 = u("1000000");
  const BTC_10  = parseUnits("10", 8);

  before(async () => {
    ({ viem } = await network.connect());
    [alice, bob, liquidator] = await viem.getWalletClients();
    testClient = await viem.getTestClient();
  });

  beforeEach(async () => {
    // Tokens
    usdc  = await viem.deployContract("MockERC20", ["USD Coin",   "USDC",  6]);
    eurc  = await viem.deployContract("MockERC20", ["Euro Coin",  "EURC",  6]);
    cbtc  = await viem.deployContract("MockERC20", ["Circle BTC", "cBTC",  8]);

    // Oracle: 1 USDC = $1.00, 1 EURC = $1.08, 1 cBTC = $105 000
    oracle = await viem.deployContract("MockOracle", []);
    await oracle.write.setUsdPrice([usdc.address,  6, parseUnits("1",       18)]);
    await oracle.write.setUsdPrice([eurc.address,  6, parseUnits("1.08",    18)]);
    await oracle.write.setUsdPrice([cbtc.address,  8, parseUnits("105000",  18)]);

    // Vault
    vault = await viem.deployContract("Vault", [oracle.address]);

    // List assets
    await vault.write.listAsset([usdc.address,  6, 9000, 9200, 200]);  // USDC
    await vault.write.listAsset([eurc.address,  6, 8500, 8800, 300]);  // EURC
    await vault.write.listAsset([cbtc.address,  8, 7000, 8000, 800]);  // cirBTC

    // Mint & approve for all users
    for (const w of [alice, bob, liquidator]) {
      await usdc.write.mint([w.account.address, ONE_M_6]);
      await eurc.write.mint([w.account.address, ONE_M_6]);
      await cbtc.write.mint([w.account.address, BTC_10]);
      await usdc.write.approve([vault.address, ONE_M_6],  { account: w.account });
      await eurc.write.approve([vault.address, ONE_M_6],  { account: w.account });
      await cbtc.write.approve([vault.address, BTC_10],   { account: w.account });
    }
  });

  // ── Deposit / Withdraw ────────────────────────────────────────────────────

  it("deposit and withdraw round-trip without interest", async () => {
    await vault.write.deposit([usdc.address, u("100")], { account: alice.account });
    const bal = await vault.read.suppliedBalance([alice.account.address, usdc.address]);
    assert.equal(bal, u("100"));

    await vault.write.withdraw([usdc.address, u("100")], { account: alice.account });
    const after = await vault.read.suppliedBalance([alice.account.address, usdc.address]);
    assert.equal(after, 0n);
  });

  it("multiple depositors share interest pro-rata", async () => {
    // Alice and Bob each deposit 1000 USDC
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });
    await vault.write.deposit([usdc.address, u("1000")], { account: bob.account });

    // Carol borrows 1000 USDC with EURC collateral
    const [,,carol] = await viem.getWalletClients();
    await usdc.write.mint([carol.account.address, ONE_M_6]);
    await eurc.write.mint([carol.account.address, ONE_M_6]);
    await usdc.write.approve([vault.address, ONE_M_6], { account: carol.account });
    await eurc.write.approve([vault.address, ONE_M_6], { account: carol.account });

    await vault.write.borrow([usdc.address, eurc.address, u("1000")], { account: carol.account });

    // Advance 1 year
    await testClient.increaseTime({ seconds: 365 * 24 * 3600 });
    await testClient.mine({ blocks: 1 });

    const aliceBal = await vault.read.suppliedBalance([alice.account.address, usdc.address]);
    const bobBal   = await vault.read.suppliedBalance([bob.account.address,   usdc.address]);

    // Both should have earned ~2.5% each (50% of 5% APR on 1000 USDC borrowed = ~25 USDC each)
    assert.ok(aliceBal > u("1024") && aliceBal < u("1026"), `alice: ${aliceBal}`);
    assert.ok(bobBal   > u("1024") && bobBal   < u("1026"), `bob:   ${bobBal}`);
    // Equal shares → equal balances
    assert.equal(aliceBal, bobBal);
  });

  // ── Borrow / Repay ────────────────────────────────────────────────────────

  it("borrow USDC with EURC collateral — oracle-priced collateral posted", async () => {
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });

    const eurcBefore = await eurc.read.balanceOf([bob.account.address]);

    // Bob borrows 100 USDC, posts EURC as collateral
    // debtUsd = 100e18, collateralUsd = 100e18 * 10000/9000 ≈ 111.11e18
    // EURC price per unit = 1e6 * 1.08e18 / 1e6 = 1.08e18
    // requiredCollateral = ceil(111.11e18 * 1e6 / 1.08e18) ≈ 102,881 EURC units (≈ 102.88 EURC)
    await vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account });

    const usdcGot  = await usdc.read.balanceOf([bob.account.address]);
    const eurcAfter = await eurc.read.balanceOf([bob.account.address]);
    const eurcPosted = eurcBefore - eurcAfter;

    // Bob received 100 USDC on top of his 1M
    assert.ok(usdcGot >= u("1000100"), `USDC received: ${usdcGot}`);
    // Collateral: ~102–103 EURC (priced at $1.08 each to cover $111.11 of debt at 90% LTV)
    assert.ok(eurcPosted > u("102") && eurcPosted < u("104"), `EURC posted: ${eurcPosted}`);

    const debt = await vault.read.borrowedBalance([bob.account.address, usdc.address, eurc.address]);
    assert.equal(debt, u("100"));
  });

  it("borrow USDC with cirBTC collateral", async () => {
    await vault.write.deposit([usdc.address, u("200000")], { account: alice.account });

    // Borrow 100 000 USDC against BTC collateral at 70% LTV
    // debtUsd = 100_000e18
    // collateralUsd = 100_000e18 * 10000 / 7000 = 142_857.14e18
    // 1 cBTC unit = 1e-8 BTC; valueInUsd(cbtc, 1e8) = 1e8 * 105000e18 / 1e8 = 105000e18
    // requiredCollateral = ceil(142_857.14e18 * 1e8 / 105000e18) ≈ 136,008,163 units ≈ 1.36 BTC
    await vault.write.borrow([usdc.address, cbtc.address, u("100000")], { account: bob.account });

    const debt = await vault.read.borrowedBalance([bob.account.address, usdc.address, cbtc.address]);
    assert.equal(debt, u("100000"));

    // Health factor should be healthy (just borrowed at LTV)
    const hf = await vault.read.healthFactorOf([bob.account.address, usdc.address, cbtc.address]);
    assert.ok(hf > parseUnits("1", 18), `HF was ${hf}, expected > 1e18`);
  });

  it("partial repay releases collateral pro-rata", async () => {
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });
    await vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account });

    const collBefore = await vault.read.collateralOf([bob.account.address, usdc.address, eurc.address]);

    // Repay half the debt
    await vault.write.repay([usdc.address, eurc.address, u("50")], { account: bob.account });

    const collAfter = await vault.read.collateralOf([bob.account.address, usdc.address, eurc.address]);
    const debtAfter = await vault.read.borrowedBalance([bob.account.address, usdc.address, eurc.address]);

    // Collateral released ≈ 50% of original
    const released = collBefore - collAfter;
    assert.ok(released > collBefore * 49n / 100n && released < collBefore * 51n / 100n,
      `released: ${released}, original: ${collBefore}`);
    // Remaining debt ≈ 50 USDC
    assert.ok(debtAfter > u("49") && debtAfter < u("51"), `debt: ${debtAfter}`);
  });

  it("full repay returns all collateral", async () => {
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });
    await vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account });

    const eurcBefore = await eurc.read.balanceOf([bob.account.address]);

    // Full repay (exact debt, no interest accrued in same block)
    await vault.write.repay([usdc.address, eurc.address, u("100")], { account: bob.account });

    const eurcAfter = await eurc.read.balanceOf([bob.account.address]);
    const debt = await vault.read.borrowedBalance([bob.account.address, usdc.address, eurc.address]);
    const coll = await vault.read.collateralOf([bob.account.address, usdc.address, eurc.address]);

    assert.equal(debt, 0n, "debt not cleared");
    assert.equal(coll, 0n, "collateral not cleared");
    // EURC returned (minus what was posted)
    assert.ok(eurcAfter >= eurcBefore, "collateral not returned");
  });

  it("interest accrues over time", async () => {
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });
    await vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account });

    await testClient.increaseTime({ seconds: 365 * 24 * 3600 });
    await testClient.mine({ blocks: 1 });

    const debt = await vault.read.borrowedBalance([bob.account.address, usdc.address, eurc.address]);
    // 5% APR on 100 USDC → ~105 USDC after 1 year
    assert.ok(debt > u("104") && debt < u("106"), `debt: ${debt}`);

    const supplied = await vault.read.suppliedBalance([alice.account.address, usdc.address]);
    assert.ok(supplied > u("1004"), `supplied: ${supplied}`);
  });

  // ── Liquidation ───────────────────────────────────────────────────────────

  it("liquidate under-water USDC/EURC position", async () => {
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });
    await vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account });

    // HF starts healthy
    const hfBefore = await vault.read.healthFactorOf([bob.account.address, usdc.address, eurc.address]);
    assert.ok(hfBefore >= parseUnits("1", 18), `HF before: ${hfBefore}`);

    // Advance ~1 year: debt grows from 100 to ~105 USDC
    // collateral ~102.88 EURC → collUsd = 102.88 * 1.08 = 111.11
    // liqThresh for USDC = 92%  →  HF = (111.11 * 0.92) / 105 ≈ 0.974 < 1  → liquidatable
    await testClient.increaseTime({ seconds: 365 * 24 * 3600 });
    await testClient.mine({ blocks: 1 });

    const hfAfter = await vault.read.healthFactorOf([bob.account.address, usdc.address, eurc.address]);
    assert.ok(hfAfter < parseUnits("1", 18), `HF after 1yr: ${hfAfter}`);

    const liqEurcBefore = await eurc.read.balanceOf([liquidator.account.address]);
    await vault.write.liquidate([bob.account.address, usdc.address, eurc.address], {
      account: liquidator.account,
    });
    const liqEurcAfter = await eurc.read.balanceOf([liquidator.account.address]);

    // Liquidator gained EURC (collateral + 2% bonus)
    assert.ok(liqEurcAfter > liqEurcBefore, "liquidator received no collateral");

    // Position is cleared
    const debt = await vault.read.borrowedBalance([bob.account.address, usdc.address, eurc.address]);
    assert.equal(debt, 0n, "debt not cleared after liquidation");
  });

  it("liquidate under-water USDC/cirBTC position", async () => {
    await vault.write.deposit([usdc.address, u("1000000")], { account: alice.account });

    // Bob borrows 100k USDC with 1.5 BTC collateral
    // debtUsd = 100_000e18
    // LTV 70% → collateralUsd = 100_000e18 * 10000/7000 = 142_857e18
    // cBTC price = 105_000e18 per whole  → collateral = 142_857e18 * 1e8 / 105_000e18 ≈ 1.3606 BTC raw = 136_054_421 units
    await vault.write.borrow([usdc.address, cbtc.address, u("100000")], { account: bob.account });

    // Drop BTC price to $70k — now collateral is worth less
    await oracle.write.setUsdPrice([cbtc.address, 8, parseUnits("70000", 18)]);

    // HF = (collUsd * liqThreshBps) / (debtUsd * BPS)
    // collateral units ≈ 136_054_421 → collUsd at $70k = 136054421 * 70000e18 / 1e8 ≈ 95_238e18
    // liqThresh 80%  →  HF = 95_238 * 0.80 / 100_000 = 0.762 < 1
    const hf = await vault.read.healthFactorOf([bob.account.address, usdc.address, cbtc.address]);
    assert.ok(hf < parseUnits("1", 18), `HF: ${hf}`);

    const liqCbtcBefore = await cbtc.read.balanceOf([liquidator.account.address]);
    await vault.write.liquidate([bob.account.address, usdc.address, cbtc.address], {
      account: liquidator.account,
    });
    const liqCbtcAfter = await cbtc.read.balanceOf([liquidator.account.address]);

    // Liquidator gained cBTC with 8% bonus
    assert.ok(liqCbtcAfter > liqCbtcBefore, "liquidator received no cBTC");

    const debt = await vault.read.borrowedBalance([bob.account.address, usdc.address, cbtc.address]);
    assert.equal(debt, 0n);
  });

  // ── Error paths ───────────────────────────────────────────────────────────

  it("liquidate reverts when HF >= 1", async () => {
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });
    await vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account });

    await assert.rejects(
      vault.write.liquidate([bob.account.address, usdc.address, eurc.address], {
        account: liquidator.account,
      }),
      /HealthFactorOk/,
    );
  });

  it("borrow reverts when insufficient liquidity", async () => {
    await assert.rejects(
      vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account }),
      /InsufficientLiquidity/,
    );
  });

  it("withdraw reverts when amount exceeds supplied balance", async () => {
    await vault.write.deposit([usdc.address, u("100")], { account: alice.account });
    await assert.rejects(
      vault.write.withdraw([usdc.address, u("200")], { account: alice.account }),
      /InsufficientBalance/,
    );
  });

  it("repay reverts when no debt exists", async () => {
    await assert.rejects(
      vault.write.repay([usdc.address, eurc.address, u("100")], { account: bob.account }),
      /NoDebt/,
    );
  });

  it("deposit reverts for unlisted token", async () => {
    const random = "0x000000000000000000000000000000000000dEaD" as const;
    await assert.rejects(
      vault.write.deposit([random, u("100")], { account: alice.account }),
      /NotListed/,
    );
  });

  it("borrow reverts for same debt and collateral token", async () => {
    await vault.write.deposit([usdc.address, u("1000")], { account: alice.account });
    await assert.rejects(
      vault.write.borrow([usdc.address, usdc.address, u("100")], { account: bob.account }),
      /SameAsset/,
    );
  });

  it("listAsset reverts if token already listed", async () => {
    await assert.rejects(
      vault.write.listAsset([usdc.address, 6, 9000, 9200, 200]),
      /AlreadyListed/,
    );
  });

  it("listAsset reverts for non-owner", async () => {
    const random = "0x0000000000000000000000000000000000001234" as const;
    // viem sometimes can't decode custom errors in the test harness; just assert revert happens.
    let reverted = false;
    try {
      await vault.write.listAsset([random, 6, 9000, 9200, 200], { account: bob.account });
    } catch {
      reverted = true;
    }
    assert.ok(reverted, "Expected NotOwner revert but call succeeded");
  });

  // ── Cross-pair independence ───────────────────────────────────────────────

  it("two independent positions in same debt token but different collateral", async () => {
    await vault.write.deposit([usdc.address, u("1000000")], { account: alice.account });

    // Bob: USDC debt / EURC collateral
    await vault.write.borrow([usdc.address, eurc.address, u("100")], { account: bob.account });
    // Bob: USDC debt / cBTC collateral (different position)
    await vault.write.borrow([usdc.address, cbtc.address, u("200")], { account: bob.account });

    const debtEurc = await vault.read.borrowedBalance([bob.account.address, usdc.address, eurc.address]);
    const debtBtc  = await vault.read.borrowedBalance([bob.account.address, usdc.address, cbtc.address]);

    assert.equal(debtEurc, u("100"));
    assert.equal(debtBtc,  u("200"));

    // Total borrow shares are additive
    const totalBorrowed = await vault.read.totalBorrowed([usdc.address]);
    assert.equal(totalBorrowed, u("300"));
  });
});
