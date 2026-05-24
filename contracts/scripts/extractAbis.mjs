#!/usr/bin/env node
/**
 * Extracts ABIs from compiled Hardhat artifacts into app/src/abi/<Contract>.ts
 * as typed `const` exports. Run after `hardhat compile`.
 *
 * Usage:
 *   node scripts/extractAbis.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const CONTRACTS = [
  "Vault",
  "FluxAMM",
  "HelixLP",
  "Streamline",
  "Lockbox",
  "Forge",
  "AgentRegistry",
];

const OUTPUT_DIR = resolve(ROOT, "../app/src/abi");

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const indexExports = [];

for (const name of CONTRACTS) {
  const artifactPath = resolve(ROOT, `artifacts/contracts/${name}.sol/${name}.json`);
  if (!existsSync(artifactPath)) {
    console.warn(`  Skip ${name}: artifact not found at ${artifactPath}`);
    continue;
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
  const abi = artifact.abi;
  const outPath = join(OUTPUT_DIR, `${name}.ts`);
  const content = `// Auto-generated from contracts/artifacts/${name}.sol/${name}.json. Do not edit.\n` +
    `export const ${name}Abi = ${JSON.stringify(abi, null, 2)} as const;\n`;
  writeFileSync(outPath, content);
  indexExports.push(`export { ${name}Abi } from "./${name}";`);
  console.log(`  ✓ ${name}.ts`);
}

writeFileSync(
  join(OUTPUT_DIR, "index.ts"),
  `// Auto-generated. Do not edit.\n${indexExports.join("\n")}\n`,
);
console.log(`\nABIs written to ${OUTPUT_DIR}`);
