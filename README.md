# Helix

> Two currencies. One protocol.

Stablecoin-first DeFi + Agent Economy on [Arc Testnet](https://docs.arc.io/), Circle's L1. Built on real USDC and EURC — no custom demo token, no custom faucet.

Seven on-chain contracts, nine pages, one server-side crank, one CCTP V2 bridge.

---

## What's in the box

| Surface | Contract | Page |
|---|---|---|
| Lending market — supply, borrow, repay, withdraw, **liquidate** | `Vault.sol` | `/vault` |
| USDC ↔ EURC AMM with **ERC-20 LP shares** | `FluxAMM.sol` + `HelixLP.sol` | `/flux` |
| Recurring payments executed by a permissionless crank | `Streamline.sol` | `/stream` + `/api/crank` |
| Commit-reveal claim links | `Lockbox.sol` | `/lockbox` |
| Agent Task Market (bounty escrow) | `Forge.sol` | `/grid` |
| **On-chain agent registry + x402-style pay-per-call settlement** | `AgentRegistry.sol` | `/agents` |
| Cross-chain USDC via Circle's CCTP V2 (Sepolia → Arc) | external | `/bridge` |
| Wallet + balances + activity | — | `/account` |

---

## Stack

- **Contracts:** Solidity 0.8.28, [Hardhat 3](https://hardhat.org), OpenZeppelin v5, viem
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind v4, Turbopack
- **Web3:** wagmi v3, viem v2, RainbowKit v2, @tanstack/react-query
- **Server crank:** Next.js Node-runtime API route with viem `privateKeyToAccount`
- **Deploy target:** Vercel (frontend + crank API), Arc Testnet (contracts)

---

## Prerequisites

- **Node.js ≥ 22.10** (Hardhat 3 requirement; Node 24 recommended)
- **npm ≥ 10**
- **git**
- A wallet (MetaMask / Rabby) with Arc Testnet added
- Test USDC and EURC from Circle's faucet (see below)

### Adding Arc Testnet to your wallet

| Field | Value |
|---|---|
| Network Name | Arc Testnet |
| Chain ID | `5042002` |
| RPC URL | `https://rpc.testnet.arc.network` |
| Native Currency | USDC (18 decimals as gas; 6 decimals via the ERC-20 interface) |
| Block Explorer | `https://testnet.arcscan.app` |

**Get test USDC and EURC:** [faucet.circle.com](https://faucet.circle.com) — select Arc Testnet, choose the token, paste your address.

---

## Repo layout

```
helix/
├── contracts/                  Hardhat 3 workspace
│   ├── contracts/              7 .sol files + MockERC20 for tests
│   ├── test/                   49 tests across all contracts
│   ├── ignition/modules/       Deploy module
│   └── scripts/                postDeploy.ts, extractAbis.mjs
├── app/                        Next.js 16 frontend
│   └── src/
│       ├── app/                Routes (9 pages + /api/crank)
│       ├── components/         Header, BalancePill, TxButton, …
│       ├── hooks/              One per feature + useBalances, useTheme, …
│       ├── lib/                chain, wagmi, tokens, contracts, bridgeKit, format
│       └── abi/                Auto-generated typed ABIs
└── README.md
```

---

## Setup

```bash
git clone <your-repo>
cd helix

# Install contract deps
cd contracts && npm install

# Install app deps
cd ../app && npm install
```

---

## 1. Build & test the contracts

```bash
cd contracts
npm run build          # compile all 7 contracts
npm test               # 49/49 should pass
```

---

## 2. Deploy to Arc Testnet

### a) Set up the deployer key

```bash
cd contracts
cp .env.example .env
```

Open `contracts/.env` and set:

```bash
ARC_RPC_URL=https://rpc.testnet.arc.network
DEPLOYER_PRIVATE_KEY=0x<your_deployer_private_key>

# Optional — seed the FluxAMM pool with this much liquidity from the deployer (6-dec units)
SEED_USDC_AMOUNT=1000000000     # 1000 USDC
SEED_EURC_AMOUNT=900000000      # 900 EURC
```

**Fund the deployer first.** Hit [faucet.circle.com](https://faucet.circle.com) → Arc Testnet → request USDC for the deployer address. ~5 USDC covers all 6 deployments and the seed. If you're seeding the pool, also request EURC.

### b) Deploy

```bash
npm run deploy
```

Hardhat Ignition deploys six contracts (HelixLP auto-deploys inside FluxAMM):

- `Vault`
- `FluxAMM` (+ `HelixLP` ERC-20)
- `Streamline`
- `Lockbox`
- `Forge`
- `AgentRegistry`

### c) Post-deploy summary + AMM seed

```bash
npm run postdeploy
```

This prints a copy-pasteable summary:

```
═══════════════════════════════════════════════════════════════
  HELIX DEPLOYED — Arc Testnet (chain 5042002)
═══════════════════════════════════════════════════════════════
  Vault:          0x…
  FluxAMM:        0x…
  Streamline:     0x…
  Lockbox:        0x…
  Forge:          0x…
  AgentRegistry:  0x…

  USDC (Arc):     0x3600000000000000000000000000000000000000
  EURC (Arc):     0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a

  CRANK WALLET — fund this address with USDC for gas:
    0x…
    Get test USDC at https://faucet.circle.com
    (~5 USDC covers thousands of crank executions)

  Paste these into app/.env.local:
    NEXT_PUBLIC_VAULT_ADDRESS=0x…
    NEXT_PUBLIC_FLUX_ADDRESS=0x…
    …
```

If `SEED_USDC_AMOUNT` / `SEED_EURC_AMOUNT` are set, it also approves and `addLiquidity()`s the FluxAMM pool with those amounts. The deployer needs USDC + EURC balances ≥ the seed amounts.

---

## 3. Extract ABIs into the app

```bash
cd contracts
npm run abis
```

Writes typed `const` ABIs to `app/src/abi/`. Re-run this any time you change a contract.

---

## 4. Configure the frontend

```bash
cd app
cp .env.local.example .env.local
```

Open `app/.env.local` and fill in:

```bash
# Already correct — leave as is
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_CHAIN_ID=5042002
NEXT_PUBLIC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_EURC_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a

# WalletConnect — get a free projectId at https://cloud.reown.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your_projectId>

# Paste from `npm run postdeploy` above
NEXT_PUBLIC_VAULT_ADDRESS=0x…
NEXT_PUBLIC_FLUX_ADDRESS=0x…
NEXT_PUBLIC_STREAMLINE_ADDRESS=0x…
NEXT_PUBLIC_LOCKBOX_ADDRESS=0x…
NEXT_PUBLIC_FORGE_ADDRESS=0x…
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=0x…

# Server-only — never NEXT_PUBLIC_ — signs Streamline.executePayment
CRANK_PRIVATE_KEY=0x<crank_wallet_private_key>
```

### About the crank wallet

`/api/crank` uses `CRANK_PRIVATE_KEY` to sign and broadcast `Streamline.executePayment()` for active schedules. It runs server-side so users only sign once (the initial approval) — every scheduled payment after that is autonomous.

**Funding it:**
1. The address is printed by `npm run postdeploy` at deploy time (or simply derive it from the private key).
2. Hit [faucet.circle.com](https://faucet.circle.com) → Arc Testnet → USDC → paste the crank address.
3. ~5 USDC is enough for thousands of crank executions.

**Security:**
- The crank private key never touches the browser. It lives in server env vars only.
- On Vercel: set `CRANK_PRIVATE_KEY` in **Project Settings → Environment Variables** (Production + Preview), **never** prefix with `NEXT_PUBLIC_`.
- Use a fresh, low-balance key per environment. The crank only needs gas — no need to hold large balances.

---

## 5. Run the app

```bash
cd app
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). Connect a wallet → hit each page.

---

## 6. Deploy the frontend to Vercel

```bash
cd app
npx vercel
```

Set all `NEXT_PUBLIC_*` vars **and** `CRANK_PRIVATE_KEY` in the Vercel dashboard. The `app/` folder is the project root.

---

## Stack quirks & things to know

### USDC on Arc has dual decimals

Arc's native gas token is USDC at **18 decimals internally**. Every Helix contract talks to the **ERC-20 interface at `0x3600…0000`**, which exposes USDC at **6 decimals** — the same number Circle uses everywhere else. The two views point to the same balance. The UI exclusively uses the 6-decimal view.

### Windows line endings

`.gitattributes` in `contracts/` forces LF on `.sol` / `.ts` / `.json`. If you see weird Hardhat or Solidity errors on Windows, check `git config core.autocrlf` — set it to `false` or `input`.

### Hardhat 3 deprecation warning

You may see `hre.network.connect() is deprecated`. The toolbox-viem package will update — non-blocking.

### CCTP V2 attestation latency

The `/bridge` page polls Circle's Iris API every 5 seconds for up to ~5 minutes. Testnet attestations usually arrive in 15–60 seconds. If it times out, the burn tx is already on Sepolia — you can re-fetch the attestation manually and call `MessageTransmitterV2.receiveMessage()` later.

### Vault liquidation pricing

The Vault treats USDC and EURC as 1:1 for v1 (testnet demo). A real deployment would use a Chainlink/Pyth oracle for EUR/USD. The liquidation logic is implemented correctly — only the pricing assumption is simplified.

---

## Troubleshooting

- **"insufficient funds for gas"** — your wallet doesn't have USDC on Arc. Hit the faucet.
- **"execution reverted: InsufficientLiquidity"** — the Vault has no supply for that token, or the FluxAMM pool is empty. Supply / seed first.
- **`/api/crank` returns 500 "CRANK_PRIVATE_KEY is not set"** — `.env.local` missing the var, or the Vercel env wasn't applied to the deployed build.
- **Schedule never executes** — check the crank wallet has USDC for gas, and that the user's allowance to `Streamline` ≥ `amount × totalPayments`.
- **MetaMask shows "USDC" balance much larger than expected** — that's the 18-decimal native view. Open `/account` for the canonical 6-decimal balance.

---

## Sources

- Arc Testnet RPC + chain config: [docs.arc.io/arc/references/connect-to-arc](https://docs.arc.io/arc/references/connect-to-arc)
- USDC + EURC contract addresses on Arc: [developers.circle.com](https://developers.circle.com/stablecoins/eurc-contract-addresses)
- CCTP V2 contracts (domain 26): [docs.arc.io/arc/references/contract-addresses](https://docs.arc.io/arc/references/contract-addresses)
- Hardhat 3 docs: [hardhat.org/docs](https://hardhat.org/docs)
- wagmi: [wagmi.sh](https://wagmi.sh) · viem: [viem.sh](https://viem.sh) · RainbowKit: [rainbowkit.com](https://rainbowkit.com)

---

## License

MIT
