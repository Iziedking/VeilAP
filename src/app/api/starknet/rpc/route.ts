import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const READ_ONLY_METHODS = new Set([
  "starknet_call",
  "starknet_chainId",
  "starknet_getBlockWithTxHashes",
  "starknet_getBlockWithTxs",
  "starknet_getClass",
  "starknet_getClassAt",
  "starknet_getClassHashAt",
  "starknet_getEvents",
  "starknet_getNonce",
  "starknet_getStateUpdate",
  "starknet_getStorageAt",
  "starknet_getTransactionByHash",
  "starknet_getTransactionReceipt",
  "starknet_specVersion",
  "starknet_syncing",
]);

const rpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.string(),
  params: z.unknown().optional(),
});

export async function POST(request: Request) {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  if (!rpcUrl) {
    return NextResponse.json({ error: "RPC_NOT_CONFIGURED" }, { status: 503 });
  }
  try {
    const raw = await request.text();
    if (raw.length > 65_536) {
      return NextResponse.json({ error: "RPC_REQUEST_TOO_LARGE" }, { status: 413 });
    }
    const body = rpcSchema.parse(JSON.parse(raw));
    if (!READ_ONLY_METHODS.has(body.method)) {
      return NextResponse.json({ error: "RPC_METHOD_REFUSED" }, { status: 403 });
    }
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "RPC_REQUEST_INVALID" }, { status: 400 });
  }
}
