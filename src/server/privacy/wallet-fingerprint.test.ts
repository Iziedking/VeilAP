import { describe, expect, it } from "vitest";

import { fingerprintWallet, normalizeWalletAddress } from "./wallet-fingerprint";

describe("wallet fingerprints", () => {
  it("normalizes equivalent Starknet addresses before hashing", () => {
    const lower = "0x0123456789abcdef";
    const padded = "0x0000000000000000000000000000000000000000000000000123456789abcdef";

    expect(normalizeWalletAddress(lower)).toBe(normalizeWalletAddress(padded));
    expect(fingerprintWallet(lower, "pepper-that-is-at-least-32-characters")).toBe(
      fingerprintWallet(padded, "pepper-that-is-at-least-32-characters"),
    );
  });

  it("does not return the wallet address or pepper", () => {
    const address = "0x0123456789abcdef";
    const pepper = "pepper-that-is-at-least-32-characters";
    const fingerprint = fingerprintWallet(address, pepper);

    expect(fingerprint).not.toContain(address);
    expect(fingerprint).not.toContain(pepper);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a weak pepper", () => {
    expect(() => fingerprintWallet("0x1", "short")).toThrow("WALLET_HASH_PEPPER_WEAK");
  });
});
