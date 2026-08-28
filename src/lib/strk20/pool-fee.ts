import { RpcProvider } from "starknet";
import { z } from "zod";

import type { PoolFee } from "./types";

const CACHE_TTL_MS = 30_000;
const blockSchema = z.object({ block_number: z.number().int().nonnegative() }).passthrough();

export interface PoolFeeRpc {
  callContract(request: {
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }): Promise<string[]>;
  getBlockWithTxHashes(): Promise<unknown>;
}

export type PoolFeeResult =
  | { ok: true; value: PoolFee }
  | { ok: false; code: "POOL_FEE_UNAVAILABLE" | "POOL_FEE_INVALID" };

export interface PoolFeeReaderDependencies {
  rpc: PoolFeeRpc;
  poolAddress: string;
  now?: () => Date;
}

export class PoolFeeReader {
  private readonly rpc: PoolFeeRpc;
  private readonly poolAddress: string;
  private readonly now: () => Date;
  private cached: { value: PoolFee; expiresAt: number } | undefined;

  constructor(dependencies: PoolFeeReaderDependencies) {
    this.rpc = dependencies.rpc;
    this.poolAddress = dependencies.poolAddress;
    this.now = dependencies.now ?? (() => new Date());
  }

  async read(): Promise<PoolFeeResult> {
    const now = this.now();
    if (this.cached && this.cached.expiresAt > now.getTime()) {
      return { ok: true, value: this.cached.value };
    }

    try {
      const feeValues = await this.rpc.callContract({
        contractAddress: this.poolAddress,
        entrypoint: "get_fee_amount",
        calldata: [],
      });
      if (feeValues.length !== 1) return { ok: false, code: "POOL_FEE_INVALID" };
      const feeMinor = feltToDecimal(feeValues[0]);
      if (feeMinor === undefined) return { ok: false, code: "POOL_FEE_INVALID" };
      const block = blockSchema.safeParse(await this.rpc.getBlockWithTxHashes());
      if (!block.success) return { ok: false, code: "POOL_FEE_UNAVAILABLE" };
      const value = {
        feeMinor,
        blockNumber: block.data.block_number,
        fetchedAt: now.toISOString(),
      } satisfies PoolFee;
      this.cached = { value, expiresAt: now.getTime() + CACHE_TTL_MS };
      return { ok: true, value };
    } catch {
      return { ok: false, code: "POOL_FEE_UNAVAILABLE" };
    }
  }
}

function feltToDecimal(value: string): string | undefined {
  try {
    if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) return undefined;
    const parsed = BigInt(value);
    if (parsed < 0n) return undefined;
    return parsed.toString(10);
  } catch {
    return undefined;
  }
}

// starknet@10.4.0, RpcProvider.callContract and getBlockWithTxHashes in
// node_modules/starknet/dist/index.d.ts, read 2026-08-28. This is the only
// production RPC construction point for the read-only pool fee.
export function createMainnetPoolFeeReader(rpcUrl: string, poolAddress: string): PoolFeeReader {
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  return new PoolFeeReader({
    poolAddress,
    rpc: {
      callContract: (request) => provider.callContract(request),
      getBlockWithTxHashes: () => provider.getBlockWithTxHashes("latest"),
    },
  });
}
