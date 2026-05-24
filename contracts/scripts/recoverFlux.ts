/**
 * recoverFlux.ts
 *
 * Drains the deployer's LP position out of the currently-deployed FluxAMM,
 * recovering all seeded USDC + EURC back to the deployer wallet BEFORE we
 * redeploy the new StableSwap-curve FluxAMM.
 *
 * Run BEFORE redeploying:
 *   npx hardhat run scripts/recoverFlux.ts --network arcTestnet
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { network } from "hardhat";
import { erc20Abi, formatUnits } from "viem";
import "dotenv/config";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

const fluxAbi = [
  {
    type: "function",
    name: "lpToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "poolStats",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_reserveUSDC", type: "uint256" },
      { name: "_reserveEURC", type: "uint256" },
      { name: "totalLP", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "removeLiquidity",
    stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [
      { name: "usdcOut", type: "uint256" },
      { name: "eurcOut", type: "uint256" },
    ],
  },
] as const;

function loadFluxAddress(): `0x${string}` {
  const candidates = [
    "ignition/deployments/helix-arc-testnet-v1/deployed_addresses.json",
    `ignition/deployments/chain-${process.env.CHAIN_ID ?? "5042002"}/deployed_addresses.json`,
  ];
  for (const rel of candidates) {
    const p = resolve(process.cwd(), rel);
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, "utf-8")) as Record<string, `0x${string}`>;
      const addr = j["Helix#FluxAMM"];
      if (addr) return addr;
    }
  }
  throw new Error("FluxAMM address not found in any deployed_addresses.json");
}

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();
  const me = walletClient.account.address;

  const flux = loadFluxAddress();
  console.log("");
  console.log(`Recovering from FluxAMM: ${flux}`);
  console.log(`Deployer wallet:        ${me}`);

  const lpAddr = (await publicClient.readContract({
    address: flux,
    abi: fluxAbi,
    functionName: "lpToken",
  })) as `0x${string}`;

  const [usdcBefore, eurcBefore, lpBalance, stats] = await Promise.all([
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [me] }) as Promise<bigint>,
    publicClient.readContract({ address: EURC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [me] }) as Promise<bigint>,
    publicClient.readContract({ address: lpAddr, abi: erc20Abi, functionName: "balanceOf", args: [me] }) as Promise<bigint>,
    publicClient.readContract({ address: flux, abi: fluxAbi, functionName: "poolStats" }) as Promise<readonly [bigint, bigint, bigint]>,
  ]);

  console.log(`LP token:               ${lpAddr}`);
  console.log(`Pool reserves:          ${formatUnits(stats[0], 6)} USDC / ${formatUnits(stats[1], 6)} EURC`);
  console.log(`Total LP supply:        ${formatUnits(stats[2], 6)}`);
  console.log(`Your LP balance:        ${formatUnits(lpBalance, 6)}`);
  console.log(`USDC before:            ${formatUnits(usdcBefore, 6)}`);
  console.log(`EURC before:            ${formatUnits(eurcBefore, 6)}`);

  if (lpBalance === 0n) {
    console.log("");
    console.log("No LP balance to recover. Nothing to do.");
    return;
  }

  console.log("");
  console.log(`Calling removeLiquidity(${lpBalance})...`);
  const hash = await walletClient.writeContract({
    address: flux,
    abi: fluxAbi,
    functionName: "removeLiquidity",
    args: [lpBalance],
  });
  console.log(`  tx: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });

  const [usdcAfter, eurcAfter] = await Promise.all([
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [me] }) as Promise<bigint>,
    publicClient.readContract({ address: EURC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [me] }) as Promise<bigint>,
  ]);

  console.log("");
  console.log("Recovery complete:");
  console.log(`  USDC recovered:       ${formatUnits(usdcAfter - usdcBefore, 6)}`);
  console.log(`  EURC recovered:       ${formatUnits(eurcAfter - eurcBefore, 6)}`);
  console.log(`  USDC balance now:     ${formatUnits(usdcAfter, 6)}`);
  console.log(`  EURC balance now:     ${formatUnits(eurcAfter, 6)}`);
  console.log("");
  console.log("Safe to redeploy now. Run:");
  console.log("  rm -rf ignition/deployments/helix-arc-testnet-v1   # if you want fresh addresses");
  console.log("  npm run deploy");
  console.log("  npm run postdeploy");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
