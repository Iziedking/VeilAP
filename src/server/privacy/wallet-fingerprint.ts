import { createHmac } from "node:crypto";

import { validateAndParseAddress } from "starknet";

export function normalizeWalletAddress(address: string): string {
  return validateAndParseAddress(address);
}

export function fingerprintWallet(address: string, pepper: string): string {
  if (pepper.length < 32) throw new Error("WALLET_HASH_PEPPER_WEAK");
  return createHmac("sha256", pepper).update(normalizeWalletAddress(address)).digest("hex");
}
