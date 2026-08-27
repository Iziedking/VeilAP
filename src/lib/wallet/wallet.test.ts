import { describe, expect, it } from "vitest";
import { connectWithCapability } from "./account";
import { MINIMUM_STRK20_WALLET_API, supportsStrk20 } from "./capability";

describe("STRK20 wallet capability", () => {
  it("requires wallet API 0.10.3 or newer", () => {
    expect(supportsStrk20(["0.10.2"])).toBe(false);
    expect(supportsStrk20(["0.10.3"])).toBe(true);
    expect(supportsStrk20(["0.11.0"])).toBe(true);
    expect(supportsStrk20([])).toBe(false);
  });

  it("checks versions before connecting and never probes balances", async () => {
    const calls: string[] = [];
    const result = await connectWithCapability({ id: "ready" }, {
      supportedWalletApi: async () => { calls.push("versions"); return ["0.10.2"]; },
      connect: async () => { calls.push("connect"); return { address: "0x1" }; },
    });
    expect(result).toEqual({ kind: "unsupported", minimum: MINIMUM_STRK20_WALLET_API });
    expect(calls).toEqual(["versions"]);
  });

  it("connects after capability succeeds", async () => {
    const calls: string[] = [];
    const account = { address: "0x123" };
    const result = await connectWithCapability({ id: "ready" }, {
      supportedWalletApi: async () => { calls.push("versions"); return ["0.10.3"]; },
      connect: async () => { calls.push("connect"); return account; },
    });
    expect(result).toEqual({ kind: "connected", account });
    expect(calls).toEqual(["versions", "connect"]);
  });
});
