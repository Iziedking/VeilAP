// @noble/hashes 2.3.0, sha2.d.ts and utils.d.ts, read 2026-08-27.
// This is the single synchronous SHA-256 seam shared by browser preview and server proof code.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("CANONICAL_NUMBER_INVALID");
  return JSON.stringify(value);
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return canonicalNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (typeof value !== "object") throw new Error("CANONICAL_VALUE_INVALID");

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("CANONICAL_OBJECT_INVALID");
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);

  return `{${entries.join(",")}}`;
}

export function commitment(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalize(value))));
}

export function digestArtifact(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? utf8ToBytes(value) : value;
  return bytesToHex(sha256(bytes));
}
