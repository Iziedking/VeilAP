import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { parseAgentPackage, type AgentPackage } from "@/domain/arena/strategy-policy";

const TOKEN_VERSION = 1 as const;
const TOKEN_CONTEXT = "veil-arena-agent-submission-v1";
const DEFAULT_TTL_MS = 24 * 60 * 60_000;

type SubmissionPayload = Readonly<{
  version: typeof TOKEN_VERSION;
  projectId: string;
  seasonId: string;
  agentPackage: AgentPackage;
  issuedAt: string;
  expiresAt: string;
}>;

function encryptionKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("AGENT_SUBMISSION_SECRET_INVALID");
  return createHash("sha256").update(TOKEN_CONTEXT).update(secret).digest();
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("AGENT_SUBMISSION_TOKEN_INVALID");
  return Buffer.from(value, "base64url");
}

export function sealAgentSubmission(input: {
  projectId: string;
  seasonId: string;
  agentPackage: unknown;
  secret: string;
  now?: () => number;
  ttlMs?: number;
}): string {
  const projectId = input.projectId.trim();
  const seasonId = input.seasonId.trim();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  if (!projectId || !seasonId || !Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > DEFAULT_TTL_MS) {
    throw new Error("AGENT_SUBMISSION_INPUT_INVALID");
  }
  const now = input.now?.() ?? Date.now();
  const payload: SubmissionPayload = {
    version: TOKEN_VERSION,
    projectId,
    seasonId,
    agentPackage: parseAgentPackage(input.agentPackage),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(input.secret), iv);
  cipher.setAAD(Buffer.from(TOKEN_CONTEXT));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [TOKEN_VERSION, encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(".");
}

export function openAgentSubmission(input: {
  token: string;
  secret: string;
  now?: () => number;
}): SubmissionPayload {
  try {
    const parts = input.token.split(".");
    if (parts.length !== 4 || parts[0] !== String(TOKEN_VERSION)) throw new Error("invalid");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(input.secret), decode(parts[1]!));
    decipher.setAAD(Buffer.from(TOKEN_CONTEXT));
    decipher.setAuthTag(decode(parts[2]!));
    const plaintext = Buffer.concat([decipher.update(decode(parts[3]!)), decipher.final()]).toString("utf8");
    const candidate = JSON.parse(plaintext) as Partial<SubmissionPayload>;
    if (candidate.version !== TOKEN_VERSION || typeof candidate.projectId !== "string" || typeof candidate.seasonId !== "string" || typeof candidate.issuedAt !== "string" || typeof candidate.expiresAt !== "string") {
      throw new Error("invalid");
    }
    const payload: SubmissionPayload = {
      version: TOKEN_VERSION,
      projectId: candidate.projectId,
      seasonId: candidate.seasonId,
      agentPackage: parseAgentPackage(candidate.agentPackage),
      issuedAt: candidate.issuedAt,
      expiresAt: candidate.expiresAt,
    };
    const now = input.now?.() ?? Date.now();
    if (!Number.isFinite(Date.parse(payload.issuedAt)) || !Number.isFinite(Date.parse(payload.expiresAt))) throw new Error("invalid");
    if (Date.parse(payload.expiresAt) <= now) throw new Error("expired");
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message === "expired") throw new Error("AGENT_SUBMISSION_TOKEN_EXPIRED");
    throw new Error("AGENT_SUBMISSION_TOKEN_INVALID");
  }
}
