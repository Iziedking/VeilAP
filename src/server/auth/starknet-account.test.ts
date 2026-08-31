import { describe, expect, it, vi } from "vitest";
import { RpcError, type RpcProvider } from "starknet";

import { checkWalletAccountReadiness } from "./starknet-account";

function providerWith(getClassHashAt: RpcProvider["getClassHashAt"]) {
  return { getClassHashAt } as Pick<RpcProvider, "getClassHashAt">;
}

describe("Starknet wallet account readiness", () => {
  it("accepts an account contract that exists on the selected network", async () => {
    const getClassHashAt = vi.fn().mockResolvedValue("0x123");

    await expect(checkWalletAccountReadiness(providerWith(getClassHashAt), "0x456"))
      .resolves.toEqual({ ok: true });
    expect(getClassHashAt).toHaveBeenCalledWith("0x456");
  });

  it("identifies a counterfactual account that has not been deployed", async () => {
    const notFound = new RpcError(
      { code: 20, message: "Contract not found" } as never,
      "starknet_getClassHashAt",
      [],
    );
    const getClassHashAt = vi.fn().mockRejectedValue(notFound);

    await expect(checkWalletAccountReadiness(providerWith(getClassHashAt), "0x456"))
      .resolves.toEqual({ ok: false, code: "WALLET_ACCOUNT_NOT_DEPLOYED" });
  });

  it("does not misreport an unavailable RPC as an undeployed wallet", async () => {
    const getClassHashAt = vi.fn().mockRejectedValue(new Error("network unavailable"));

    await expect(checkWalletAccountReadiness(providerWith(getClassHashAt), "0x456"))
      .resolves.toEqual({ ok: false, code: "RPC_UNAVAILABLE" });
  });
});
