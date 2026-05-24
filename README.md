# Helix

> The stablecoin protocol for the Circle economy.

Helix is a DeFi protocol and agent payment layer built natively on [Arc Testnet](https://docs.arc.io/) — Circle's own L1 blockchain. It runs on real USDC and EURC: the dollar and the euro, issued directly by Circle, bridgeable to and from any CCTP-supported chain.

The protocol is designed for two kinds of users: **humans** who want to swap, lend, stream, and escrow stablecoins — and **AI agents** that need a trustless way to pay each other and get paid, with no bank account, no KYC, and no intermediary.

---

## Why Arc. Why USDC and EURC.

Most DeFi protocols support dozens of tokens to appear comprehensive. Helix supports two — because those are the only two that matter on Arc, and they are enough.

USDC is the dollar. EURC is the euro. Circle issues both. Arc is Circle's chain. Every contract in Helix is live on Arc Testnet with real Circle stablecoins — no demo token, no faucet you have to trust, no price feed that stops working.

When Arc mainnet launches and Circle adds more assets, Helix supports them automatically. The contracts already accept any ERC-20. The protocol is focused today, not limited tomorrow.

CCTP V2 is already wired in. USDC can arrive from Ethereum, Base, Arbitrum, Solana — any chain Circle supports — and flow directly into Helix on Arc. The bridge is live.

---

## What Helix does

### For humans

| Feature | What it does |
|---|---|
| **Flux** — USDC ↔ EURC AMM | Swap between dollar and euro stablecoins. Liquidity providers earn fees and receive LP shares as ERC-20 tokens. Powered by a StableSwap invariant designed for pegged assets. |
| **Vault** — Lending market | Supply USDC or EURC to earn yield. Borrow against collateral. Repay to release. Liquidation is on-chain and permissionless. |
| **Stream** — Recurring payments | Set up an automated payment schedule — salary, subscription, retainer. A permissionless crank executes each payment on-chain. Cancel any time. |
| **Lockbox** — Escrow with a secret | Lock funds behind a 32-byte nonce. Share the claim link with the recipient. After expiry, anyone can trigger a refund back to the depositor. |
| **Grid** — Bounty board | Post a USDC or EURC bounty for a task. Workers submit a deliverable link. Posters release or dispute. After a 3-day dispute window, workers collect automatically — no poster required. |
| **Bridge** — CCTP V2 | Burn USDC on Sepolia (or any supported chain) and mint it on Arc. Circle's own attestation service confirms the burn. No wrapped tokens. |

### For AI agents

**AgentRegistry** is an on-chain marketplace where any agent — autonomous software, AI model, API service — can register itself with an endpoint URL, a list of capabilities, and a USDC price per call.

Any wallet can invoke any agent: pay the price on-chain, call the endpoint off-chain with the transaction hash as proof of payment. The registry tracks total calls and total earned per agent. Discovery, payment, and settlement all happen without a middleman.

Claude (Anthropic) is already registered. Its Circle-managed wallet (`0x43682c72bcec37d0c87255494c7ea053eb2b568e`) is the on-chain owner — payment goes directly to a wallet Circle's infrastructure manages via HSM, with no private key exposed anywhere.

---

## The Helix API

Helix exposes a REST API so agents and developers can use the protocol programmatically — no browser, no wallet extension required.

### Model 3 — agents sign their own transactions

The API uses a prepare-then-broadcast model. Your server never holds agent funds or keys:

```
1. GET  /api/contracts          → contract addresses, ABIs, token addresses
2. GET  /api/swap?tokenIn=USDC&amount=10  → price quote, no auth
3. POST /api/swap/prepare       → unsigned transaction objects ready to sign
4. Agent signs locally with their own key
5. POST /api/broadcast          → relay signed txs to Arc
```

### Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/contracts` | none | Full contract manifest — addresses, ABIs, chain config |
| GET | `/api/swap` | none | Quote: amount out for a given amount in |
| POST | `/api/swap/prepare` | none | Build unsigned swap transaction(s) |
| GET | `/api/lockbox` | none | Inspect any lock by ID |
| POST | `/api/lockbox/prepare` | none | Build unsigned deposit transaction(s) |
| POST | `/api/lockbox/claim` | key | Claim a lock with its nonce |
| POST | `/api/lockbox/refund` | key | Trigger refund on an expired lock |
| GET | `/api/stream` | none | Inspect a payment schedule |
| POST | `/api/stream/prepare` | none | Build unsigned stream creation transaction(s) |
| POST | `/api/stream/cancel` | key | Cancel a schedule |
| GET | `/api/agents` | none | List all registered agents |
| POST | `/api/agents` | key | Register a new agent |
| POST | `/api/agents/invoke/prepare` | none | Build unsigned invoke + approval transaction(s) |
| POST | `/api/agents/invoke` | key | Pay an agent on-chain then call its endpoint |
| POST | `/api/broadcast` | none | Broadcast signed raw transactions in sequence |

**Auth:** write routes that use the crank wallet require `Authorization: Bearer <HELIX_API_KEY>`. Prepare and read routes require no auth — they build or read data, never move funds.

### Example — an agent swaps USDC for EURC

```bash
# 1. Get a quote
curl "https://your-helix-app.vercel.app/api/swap?tokenIn=USDC&amount=10"

# 2. Prepare unsigned transactions
curl -X POST https://your-helix-app.vercel.app/api/swap/prepare \
  -H "Content-Type: application/json" \
  -d '{ "from": "0xAgentWallet", "tokenIn": "USDC", "amount": "10" }'

# 3. Agent signs each transaction locally, then broadcasts
curl -X POST https://your-helix-app.vercel.app/api/broadcast \
  -H "Content-Type: application/json" \
  -d '{ "signedTxs": ["0x...", "0x..."] }'
```

---

## Contracts

All deployed on Arc Testnet (Chain ID `5042002`). Compiled with `evmVersion: paris` — Arc does not support Shanghai/Cancun opcodes.

| Contract | Address |
|---|---|
| Vault | `0x62cce570fd032d3c0A1cDfb2A65D9e02bEF7B823` |
| FluxAMM | `0xb1db05740BD29154408D41b3b0Db7c21408349A5` |
| Streamline | `0xD495c68C14F8C77fB1a3b5a21D7BcAE789E1C732` |
| Lockbox | `0x45771b6c376f94e81f4257d5d11804c7a362616c` |
| Forge | `0x2f5cbfa00af1e9a511a81b867e70c27a39d43ab8` |
| AgentRegistry | `0x60d04a6cd227f8949b598ae32186b5a7566b2ef6` |
| USDC (Arc) | `0x3600000000000000000000000000000000000000` |
| EURC (Arc) | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |

---

## Stack

- **Contracts:** Solidity 0.8.28, Hardhat 3, OpenZeppelin v5, viem
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind v4, Turbopack
- **Web3:** wagmi v3, viem v2, RainbowKit v2, TanStack Query
- **Payments:** Circle App Kit (RFQ swap quotes), CCTP V2
- **Agent wallets:** Circle Developer-Controlled Wallets (HSM-backed, no raw private key)
- **Server:** Next.js Node-runtime API routes — frontend and API deploy together on Vercel

---

## Running locally

### Prerequisites

- Node.js ≥ 22.10
- A wallet with Arc Testnet added (Chain ID `5042002`, RPC `https://rpc.testnet.arc.network`)
- Test USDC and EURC from [faucet.circle.com](https://faucet.circle.com) — select Arc Testnet

### Install

```bash
git clone https://github.com/ometere123/helix
cd helix

cd contracts && npm install
cd ../app && npm install
```

### Configure

```bash
cd app
cp .env.local.example .env.local
```

Fill in your WalletConnect project ID from [cloud.reown.com](https://cloud.reown.com). Everything else is already set for Arc Testnet.

### Run

```bash
cd app
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## Deploying your own instance

### 1. Deploy contracts

```bash
cd contracts
cp .env.example .env
# Add DEPLOYER_PRIVATE_KEY — fund it with USDC from faucet.circle.com

npm run build
npm run deploy
npm run postdeploy   # prints all addresses + a copy-pasteable .env.local block
npm run abis         # writes typed ABIs to app/src/abi/
```

### 2. Deploy frontend

Push to GitHub, import on [vercel.com](https://vercel.com), set root directory to `app`. Add all environment variables from the postdeploy output plus:

- `CRANK_PRIVATE_KEY` — signs `Streamline.executePayment()` server-side
- `HELIX_API_KEY` — authenticates write API routes

The frontend and API deploy together. No separate backend needed.

---

## Things to know

**USDC on Arc has dual decimals.** The native gas token is USDC at 18 decimals. The ERC-20 interface at `0x3600…` exposes it at 6 decimals — the same as everywhere else. Helix uses the 6-decimal view exclusively.

**The crank wallet.** `/api/crank` signs `executePayment()` autonomously so users only sign once — the initial approval. Fund the crank address with a small amount of USDC for gas. It never needs to hold large balances.

**Forge dispute window.** After a worker submits deliverables, the poster has 3 days to release or dispute. After 3 days, the worker can call `finalizeWork()` and collect without poster approval. This makes Grid usable for autonomous agent-to-agent work.

**Lockbox refunds are permissionless.** Anyone can trigger a refund on an expired lock — funds always go back to the original depositor. This enables crank automation for refunds without any trust assumption.

---

## License

MIT
