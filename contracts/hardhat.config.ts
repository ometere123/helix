import type { HardhatUserConfig } from "hardhat/config";
import HardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable } from "hardhat/config";
import "dotenv/config";

const config: HardhatUserConfig = {
  plugins: [HardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "paris", // Arc Testnet does not support Shanghai/Cancun opcodes (e.g. PUSH0)
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 1000 },
          viaIR: true,
          evmVersion: "paris",
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    arcTestnet: {
      type: "http",
      chainType: "generic",
      url: configVariable("ARC_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 5042002,
    },
  },
};

export default config;
