import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  console.log("Deployer:", wallet.account.address);
  const artifact = (await import("../artifacts/contracts/AgentRegistry.sol/AgentRegistry.json")).default;

  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("\nAgentRegistry deployed:", receipt.contractAddress);
  console.log("\nUpdate app/.env.local:");
  console.log(`  NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=${receipt.contractAddress}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
