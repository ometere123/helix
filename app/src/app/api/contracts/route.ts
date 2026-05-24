import { NextResponse } from "next/server";
import { CONTRACTS } from "@/lib/contracts";
import { FluxAMMAbi } from "@/abi/FluxAMM";
import { LockboxAbi } from "@/abi/Lockbox";
import { StreamlineAbi } from "@/abi/Streamline";
import { AgentRegistryAbi } from "@/abi/AgentRegistry";

export const runtime = "nodejs";

/**
 * GET /api/contracts
 * Returns contract addresses, ABIs, and token addresses for this deployment.
 * No auth required — public discovery endpoint.
 */
export async function GET() {
  return NextResponse.json({
    chain: {
      id: 5042002,
      name: "Arc Testnet",
      rpc: process.env.NEXT_PUBLIC_RPC_URL,
      explorer: process.env.NEXT_PUBLIC_EXPLORER_URL,
    },
    tokens: {
      USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS,
      EURC: process.env.NEXT_PUBLIC_EURC_ADDRESS,
    },
    contracts: {
      FluxAMM:       { address: CONTRACTS.FluxAMM,       abi: FluxAMMAbi },
      Lockbox:       { address: CONTRACTS.Lockbox,       abi: LockboxAbi },
      Streamline:    { address: CONTRACTS.Streamline,    abi: StreamlineAbi },
      AgentRegistry: { address: CONTRACTS.AgentRegistry, abi: AgentRegistryAbi },
    },
    api: {
      quote:           "GET  /api/swap?tokenIn=USDC&amount=10",
      swapPrepare:     "POST /api/swap/prepare",
      lockboxPrepare:  "POST /api/lockbox/prepare",
      streamPrepare:   "POST /api/stream/prepare",
      invokePrepare:   "POST /api/agents/invoke/prepare",
      broadcast:       "POST /api/broadcast",
      agents:          "GET  /api/agents",
      lockboxInspect:  "GET  /api/lockbox?lockId=0x…",
      streamInspect:   "GET  /api/stream?scheduleId=0x…",
    },
  });
}
