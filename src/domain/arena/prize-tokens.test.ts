import { describe, expect, it } from "vitest";

import { ARENA_PRIZE_TOKENS } from "./prize-tokens";

describe("arena prize tokens", () => {
  it("offers only canonical Starknet Mainnet STRK and USDC assets", () => {
    expect(Object.keys(ARENA_PRIZE_TOKENS).sort()).toEqual(["STRK", "USDC"]);
    expect(ARENA_PRIZE_TOKENS.STRK.decimals).toBe(18);
    expect(ARENA_PRIZE_TOKENS.USDC.decimals).toBe(6);
    expect(ARENA_PRIZE_TOKENS.STRK.address).toMatch(/^0x[0-9a-f]{63,64}$/i);
    expect(ARENA_PRIZE_TOKENS.USDC.address).toMatch(/^0x[0-9a-f]{63,64}$/i);
  });
});
