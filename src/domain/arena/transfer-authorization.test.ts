import { describe, expect, it } from "vitest";

import {
  ARENA_TRANSFER_AUTHORIZATION_TTL_MS,
  buildArenaTransferAuthorizationTypedData,
  createArenaTransferAuthorization,
  type ArenaTransferPlan,
} from "@/domain/arena/transfer-authorization";

const plan: ArenaTransferPlan = {
  network: "SN_MAIN",
  operation: "strk20_transfer",
  projectId: "project-1",
  seasonId: "season-1",
  poolId: "pool-1",
  poolAddress: "0x123",
  tokenAddress: "0x456",
  tokenSymbol: "USDC",
  amountMinor: "1000000",
  recipient: "0x789",
  planDigest: "plan-digest",
};

describe("arena transfer authorization", () => {
  it("creates a five minute authorization bound to one plan and transaction", () => {
    const now = Date.UTC(2026, 7, 30, 12, 0, 0);
    const authorization = createArenaTransferAuthorization(plan, "0xabc", now);

    expect(authorization).toMatchObject({
      schemaVersion: 1,
      chainId: "SN_MAIN",
      operation: "strk20_transfer",
      projectId: "project-1",
      transactionHash: "0xabc",
      planDigest: "plan-digest",
    });
    expect(Date.parse(authorization.expiresAt) - Date.parse(authorization.issuedAt))
      .toBe(ARENA_TRANSFER_AUTHORIZATION_TTL_MS);
  });

  it("builds typed data that mirrors the signed authorization", () => {
    const authorization = createArenaTransferAuthorization(plan, "0xabc", 0);
    const typedData = buildArenaTransferAuthorizationTypedData(authorization);

    expect(typedData.domain).toEqual({ name: "Veil Arena", chainId: "SN_MAIN", version: "1" });
    expect(typedData.primaryType).toBe("VeilArenaTransfer");
    expect(typedData.message).toEqual(authorization);
  });

  it("changes the signed message when the transaction hash changes", () => {
    const first = buildArenaTransferAuthorizationTypedData(
      createArenaTransferAuthorization(plan, "0xabc", 0),
    );
    const second = buildArenaTransferAuthorizationTypedData(
      createArenaTransferAuthorization(plan, "0xdef", 0),
    );

    expect(first.message).not.toEqual(second.message);
    expect(first.message.transactionHash).not.toBe(second.message.transactionHash);
  });
});
