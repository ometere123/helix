#!/usr/bin/env node
/**
 * Generate a fresh crank wallet locally.
 *
 * Output goes to the console only — nothing is written to disk or transmitted.
 * Save the private key into app/.env.local as CRANK_PRIVATE_KEY, then fund the
 * printed address with USDC at https://faucet.circle.com (Arc Testnet).
 *
 * Usage:
 *   node scripts/genCrankKey.mjs
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);

const bar = "━".repeat(72);
console.log("");
console.log(bar);
console.log("  FRESH CRANK WALLET — generated locally, never transmitted");
console.log(bar);
console.log("");
console.log("  Private key:  " + pk);
console.log("  Address:      " + account.address);
console.log("");
console.log(bar);
console.log("  Next steps:");
console.log("");
console.log("  1) Copy the private key into app/.env.local as:");
console.log("       CRANK_PRIVATE_KEY=" + pk);
console.log("");
console.log("  2) Fund the address with USDC at https://faucet.circle.com");
console.log("     (Arc Testnet, ~5 USDC is enough for thousands of cranks)");
console.log("");
console.log("  3) Never paste this private key in chat, screenshots, or commits.");
console.log("     The .env.local file is already in .gitignore.");
console.log(bar);
console.log("");
