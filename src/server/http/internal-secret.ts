import { timingSafeEqual } from "node:crypto";

export function hasMatchingInternalSecret(expected: string | undefined, provided: string | null): boolean {
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
