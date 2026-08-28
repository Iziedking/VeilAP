import { NextResponse } from "next/server";

import {
  createMainnetPoolFeeReader,
  type PoolFeeReader,
} from "@/lib/strk20/pool-fee";

export const runtime = "nodejs";

let cachedReader: { key: string; reader: PoolFeeReader } | undefined;

export async function GET() {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const poolAddress = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS;
  if (!rpcUrl || !poolAddress) {
    return NextResponse.json(
      { ok: false, code: "POOL_FEE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const key = `${rpcUrl}:${poolAddress}`;
  if (!cachedReader || cachedReader.key !== key) {
    cachedReader = { key, reader: createMainnetPoolFeeReader(rpcUrl, poolAddress) };
  }
  const result = await cachedReader.reader.read();
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
