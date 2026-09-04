// Node crypto createHmac and local @types/node/crypto.d.ts, read 2026-09-04.
// https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
import { createHmac } from "node:crypto";
import { canonicalize } from "@/domain/canonical";
import { parseStrategyArtifactPayload } from "@/domain/arena/strategy-policy";
import type { TournamentRules } from "@/domain/arena/tournament-rules";

export function strategyFingerprint(input: {
  projectId: string; seasonId: string; dataKey: Uint8Array;
  rules?: TournamentRules; policy: unknown;
}): string | undefined {
  if (input.rules?.duplicateStrategyPolicy !== "reject_exact") return undefined;
  if (input.dataKey.byteLength !== 32) throw new Error("KEY_LENGTH_INVALID");
  const payload = parseStrategyArtifactPayload(input.policy);
  const normalized = "protocolVersion" in payload
    ? { format: payload.protocolVersion, engine: input.rules.engineVersion, policy: payload.policy }
    : { format: "legacy.v1", engine: input.rules.engineVersion, policy: { rules: payload.rules, fallbackAction: payload.fallbackAction } };
  const seasonKey = createHmac("sha256", input.dataKey).update(canonicalize({
    domain: "veil.strategy-fingerprint-key.v1", projectId: input.projectId, seasonId: input.seasonId,
  })).digest();
  try {
    return createHmac("sha256", seasonKey).update(canonicalize(normalized)).digest("hex");
  } finally { seasonKey.fill(0); }
}
