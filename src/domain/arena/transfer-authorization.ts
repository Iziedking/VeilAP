import type { TypedData } from "starknet";

export const ARENA_TRANSFER_AUTHORIZATION_TTL_MS = 5 * 60_000;

export type ArenaTransferOperation = "strk20_shield" | "strk20_transfer";

export interface ArenaTransferPlan {
  network: "SN_MAIN";
  operation: ArenaTransferOperation;
  projectId: string;
  seasonId: string;
  poolId: string;
  poolAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amountMinor: string;
  recipient: string;
  planDigest: string;
}

export interface ArenaTransferAuthorization {
  schemaVersion: 1;
  chainId: "SN_MAIN";
  operation: ArenaTransferOperation;
  projectId: string;
  seasonId: string;
  poolId: string;
  poolAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amountMinor: string;
  recipient: string;
  planDigest: string;
  transactionHash: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ArenaTransferAuthorizationTypedData extends TypedData {
  primaryType: "VeilArenaTransfer";
  message: ArenaTransferAuthorization;
}

export function createArenaTransferAuthorization(
  plan: ArenaTransferPlan,
  transactionHash: string,
  now = Date.now(),
): ArenaTransferAuthorization {
  return {
    schemaVersion: 1,
    chainId: plan.network,
    operation: plan.operation,
    projectId: plan.projectId,
    seasonId: plan.seasonId,
    poolId: plan.poolId,
    poolAddress: plan.poolAddress,
    tokenAddress: plan.tokenAddress,
    tokenSymbol: plan.tokenSymbol,
    amountMinor: plan.amountMinor,
    recipient: plan.recipient,
    planDigest: plan.planDigest,
    transactionHash,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ARENA_TRANSFER_AUTHORIZATION_TTL_MS).toISOString(),
  };
}

export function buildArenaTransferAuthorizationTypedData(
  authorization: ArenaTransferAuthorization,
): ArenaTransferAuthorizationTypedData {
  return {
    domain: { name: "Veil Arena", chainId: authorization.chainId, version: "1" },
    types: {
      StarkNetDomain: [
        { name: "name", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "version", type: "felt" },
      ],
      VeilArenaTransfer: [
        { name: "schemaVersion", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "operation", type: "string" },
        { name: "projectId", type: "string" },
        { name: "seasonId", type: "string" },
        { name: "poolId", type: "string" },
        { name: "poolAddress", type: "felt" },
        { name: "tokenAddress", type: "felt" },
        { name: "tokenSymbol", type: "string" },
        { name: "amountMinor", type: "felt" },
        { name: "recipient", type: "felt" },
        { name: "planDigest", type: "string" },
        { name: "transactionHash", type: "felt" },
        { name: "issuedAt", type: "string" },
        { name: "expiresAt", type: "string" },
      ],
    },
    primaryType: "VeilArenaTransfer",
    message: authorization,
  };
}
