import { z } from "zod";

const ringSchema = z.object({
  currentKeyId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  keys: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), z.string().regex(/^[a-f0-9]{64}$/i)),
  legacySessionSecrets: z.array(z.string().min(32)).max(8).optional(),
}).strict().refine((ring) => Boolean(ring.keys[ring.currentKeyId]));

export function readParticipantVaultKeys(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.NODE_ENV !== "production" && env.NEXT_PUBLIC_VEILAP_PREVIEW_MODE === "1") {
    return { currentKeyId: "preview-only", keys: { "preview-only": "a1".repeat(32) } };
  }
  if (!env.VEILAP_PARTICIPANT_VAULT_KEYS) return undefined;
  try { return ringSchema.parse(JSON.parse(env.VEILAP_PARTICIPANT_VAULT_KEYS)); }
  catch { throw new Error("PARTICIPANT_VAULT_KEY_INVALID"); }
}
