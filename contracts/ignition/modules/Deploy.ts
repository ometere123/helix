import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "viem";

// Arc Testnet token addresses (from developers.circle.com)
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

// 1e18-scaled USD prices for testnet MockOracle
// 1 USDC = $1.00 → 1_000_000_000_000_000_000 (1e18)
// 1 EURC = $1.08 → 1_080_000_000_000_000_000 (1.08e18)
const USDC_USD_PRICE = parseUnits("1", 18).toString();
const EURC_USD_PRICE = parseUnits("1.08", 18).toString();

export default buildModule("Helix", (m) => {
  const usdc = m.getParameter("usdc", USDC_ADDRESS);
  const eurc = m.getParameter("eurc", EURC_ADDRESS);

  // ── Deploy MockOracle ──────────────────────────────────────────────────────
  // On testnet there is no live price feed; we use MockOracle with set prices.
  // For mainnet, replace with a Circle / Chainlink adapter that implements IPriceOracle.
  const mockOracle = m.contract("MockOracle", []);

  // Wire prices: (token, decimals, pricePerWholeToken in USD, 1e18 scaled)
  m.call(mockOracle, "setUsdPrice", [usdc, 6, BigInt(USDC_USD_PRICE)], {
    id: "setUsdPrice_USDC",
  });
  m.call(mockOracle, "setUsdPrice", [eurc, 6, BigInt(EURC_USD_PRICE)], {
    id: "setUsdPrice_EURC",
  });

  // ── Deploy Vault v2 ────────────────────────────────────────────────────────
  const vault = m.contract("Vault", [mockOracle]);

  // List USDC: LTV 90 %, liqThresh 92 %, liqBonus 2 %
  m.call(vault, "listAsset", [usdc, 6, 9000, 9200, 200], {
    id: "listAsset_USDC",
  });

  // List EURC: LTV 85 %, liqThresh 88 %, liqBonus 3 %
  m.call(vault, "listAsset", [eurc, 6, 8500, 8800, 300], {
    id: "listAsset_EURC",
  });

  // cirBTC (8 decimals) is not yet on Arc testnet as of May 2026.
  // When it lands, add:
  //   m.call(mockOracle, "setUsdPrice", [CIRBTC_ADDRESS, 8, parseUnits("105000", 18)], { id: "setUsdPrice_cirBTC" });
  //   m.call(vault, "listAsset", [CIRBTC_ADDRESS, 8, 7000, 8000, 800], { id: "listAsset_cirBTC" });

  // ── Other Helix contracts ──────────────────────────────────────────────────
  const flux          = m.contract("FluxAMM", [usdc, eurc]);
  const streamline    = m.contract("Streamline", []);
  const lockbox       = m.contract("Lockbox", []);
  const forge         = m.contract("Forge", []);
  const agentRegistry = m.contract("AgentRegistry", []);

  return { mockOracle, vault, flux, streamline, lockbox, forge, agentRegistry };
});
