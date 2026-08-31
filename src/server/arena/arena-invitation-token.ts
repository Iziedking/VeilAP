import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_VERSION = 1 as const;
const TOKEN_CONTEXT = "veil-arena-private-invitation-v1";
const MAX_TTL_MS = 7 * 24 * 60 * 60_000;

export type ArenaInvitationPayload = Readonly<{
  version: typeof TOKEN_VERSION;
  projectId: string;
  seasonId: string;
  issuedAt: string;
  expiresAt: string;
}>;

function encryptionKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("ARENA_INVITATION_SECRET_INVALID");
  return createHash("sha256").update(TOKEN_CONTEXT).update(secret).digest();
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("ARENA_INVITATION_TOKEN_INVALID");
  return Buffer.from(value, "base64url");
}

export function sealArenaInvitation(input: {
  projectId: string;
  seasonId: string;
  secret: string;
  expiresAt: Date;
  now?: () => number;
}): string {
  const projectId = input.projectId.trim();
  const seasonId = input.seasonId.trim();
  const now = input.now?.() ?? Date.now();
  const expiresAt = input.expiresAt.getTime();
  if (
    !projectId
    || !seasonId
    || !Number.isFinite(expiresAt)
    || expiresAt <= now
    || expiresAt - now > MAX_TTL_MS
  ) {
    throw new Error("ARENA_INVITATION_INPUT_INVALID");
  }

  const payload: ArenaInvitationPayload = {
    version: TOKEN_VERSION,
    projectId,
    seasonId,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(input.secret), iv);
  cipher.setAAD(Buffer.from(TOKEN_CONTEXT));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [TOKEN_VERSION, encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".");
}

export function openArenaInvitation(input: {
  token: string;
  secret: string;
  now?: () => number;
}): ArenaInvitationPayload {
  try {
    const parts = input.token.split(".");
    if (parts.length !== 4 || parts[0] !== String(TOKEN_VERSION)) throw new Error("invalid");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(input.secret), decode(parts[1]!));
    decipher.setAAD(Buffer.from(TOKEN_CONTEXT));
    decipher.setAuthTag(decode(parts[2]!));
    const plaintext = Buffer.concat([decipher.update(decode(parts[3]!)), decipher.final()]).toString("utf8");
    const candidate = JSON.parse(plaintext) as Partial<ArenaInvitationPayload>;
    if (
      candidate.version !== TOKEN_VERSION
      || typeof candidate.projectId !== "string"
      || typeof candidate.seasonId !== "string"
      || typeof candidate.issuedAt !== "string"
      || typeof candidate.expiresAt !== "string"
      || !candidate.projectId.trim()
      || !candidate.seasonId.trim()
    ) throw new Error("invalid");

    const issuedAt = Date.parse(candidate.issuedAt);
    const expiresAt = Date.parse(candidate.expiresAt);
    const now = input.now?.() ?? Date.now();
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) throw new Error("invalid");
    if (expiresAt <= now) throw new Error("expired");
    return {
      version: TOKEN_VERSION,
      projectId: candidate.projectId,
      seasonId: candidate.seasonId,
      issuedAt: candidate.issuedAt,
      expiresAt: candidate.expiresAt,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "expired") throw new Error("ARENA_INVITATION_TOKEN_EXPIRED");
    throw new Error("ARENA_INVITATION_TOKEN_INVALID");
  }
}
