/**
 * Deploy a fresh Forge contract and print the new address.
 * Usage: npx hardhat run scripts/deployForge.ts --network arcTestnet
 */
import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  console.log("Deployer:", wallet.account.address);
  console.log("Deploying Forge...");

  const hash = await wallet.deployContract({
    abi: (await import("../artifacts/contracts/Forge.sol/Forge.json")).default.abi,
    bytecode: (await import("../artifacts/contracts/Forge.sol/Forge.json")).default.bytecode as `0x${string}`,
    args: [],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress!;

  console.log("\nForge deployed:", address);
  console.log("\nUpdate app/.env.local:");
  console.log(`  NEXT_PUBLIC_FORGE_ADDRESS=${address}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
