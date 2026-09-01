import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1 as const;
const TOKEN_CONTEXT = "veil-arena-x-oauth-flow-v1";
export const X_OAUTH_FLOW_TTL_MS = 10 * 60_000;

export type XOAuthFlow = Readonly<{
  version: typeof TOKEN_VERSION;
  state: string;
  codeVerifier: string;
  walletFingerprint: string;
  returnTo: string;
  issuedAt: string;
  expiresAt: string;
}>;

function key(secret: string): Buffer {
  if (secret.length < 32) throw new Error("X_OAUTH_FLOW_SECRET_INVALID");
  return createHash("sha256").update(TOKEN_CONTEXT).update(secret).digest();
}

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("X_OAUTH_FLOW_INVALID");
  return Buffer.from(value, "base64url");
}

export function safeOAuthReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/play";
  }
  const parsed = new URL(value, "https://veilap.invalid");
  if (parsed.origin !== "https://veilap.invalid" || !["/play", "/arena"].some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) {
    return "/play";
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function createXOAuthFlow(input: {
  walletFingerprint: string;
  returnTo: string;
  secret: string;
  now?: () => number;
}): { flow: XOAuthFlow; token: string; codeChallenge: string } {
  const now = input.now?.() ?? Date.now();
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const flow: XOAuthFlow = {
    version: TOKEN_VERSION,
    state,
    codeVerifier,
    walletFingerprint: input.walletFingerprint,
    returnTo: safeOAuthReturnPath(input.returnTo),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + X_OAUTH_FLOW_TTL_MS).toISOString(),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(input.secret), iv);
  cipher.setAAD(Buffer.from(TOKEN_CONTEXT));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(flow), "utf8"), cipher.final()]);
  const token = [TOKEN_VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { flow, token, codeChallenge };
}

export function openXOAuthFlow(token: string, secret: string, now = Date.now()): XOAuthFlow {
  try {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== String(TOKEN_VERSION)) throw new Error("invalid");
    const decipher = createDecipheriv("aes-256-gcm", key(secret), decode(parts[1]!));
    decipher.setAAD(Buffer.from(TOKEN_CONTEXT));
    decipher.setAuthTag(decode(parts[2]!));
    const plaintext = Buffer.concat([decipher.update(decode(parts[3]!)), decipher.final()]).toString("utf8");
    const value = JSON.parse(plaintext) as Partial<XOAuthFlow>;
    if (value.version !== TOKEN_VERSION || typeof value.state !== "string" || typeof value.codeVerifier !== "string" || typeof value.walletFingerprint !== "string" || typeof value.returnTo !== "string" || typeof value.issuedAt !== "string" || typeof value.expiresAt !== "string") throw new Error("invalid");
    if (Date.parse(value.expiresAt) <= now || Date.parse(value.issuedAt) > now) throw new Error("expired");
    return value as XOAuthFlow;
  } catch (error) {
    if (error instanceof Error && error.message === "expired") throw new Error("X_OAUTH_FLOW_EXPIRED");
    throw new Error("X_OAUTH_FLOW_INVALID");
  }
}

export function oauthStateMatches(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}
