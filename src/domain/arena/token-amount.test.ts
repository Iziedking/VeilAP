import { describe, expect, it } from "vitest";

import { formatTokenAmountFromMinor, parseTokenAmountToMinor } from "./token-amount";

describe("token amount conversion", () => {
  it("converts exact decimal USDC input to minor units without floating point math", () => {
    expect(parseTokenAmountToMinor("1", 6)).toBe("1000000");
    expect(parseTokenAmountToMinor("10.5", 6)).toBe("10500000");
    expect(parseTokenAmountToMinor("0.000001", 6)).toBe("1");
    expect(parseTokenAmountToMinor("0.29", 6)).toBe("290000");
  });

  it("rejects empty, negative, zero, and over-precision amounts", () => {
    expect(parseTokenAmountToMinor("", 6)).toBeNull();
    expect(parseTokenAmountToMinor("-1", 6)).toBeNull();
    expect(parseTokenAmountToMinor("0", 6)).toBeNull();
    expect(parseTokenAmountToMinor("1.0000001", 6)).toBeNull();
  });

  it("formats minor units for readable funding status", () => {
    expect(formatTokenAmountFromMinor("1000000", 6)).toBe("1");
    expect(formatTokenAmountFromMinor("10500000", 6)).toBe("10.5");
  });
});
