import { randomBytes } from "node:crypto";

import { createAuthChallengeService } from "./challenge";

export const SESSION_COOKIE = "veilap_session";
export const SESSION_TTL_MS = 8 * 60 * 60_000;

const authChallenges = createAuthChallengeService();
const developmentSecret = randomBytes(32).toString("hex");

export function hasDurableAuthStore(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function getAuthChallenges() {
  return authChallenges;
}

export function getSessionSecret(): string {
  const configured = process.env.VEILAP_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return developmentSecret;
  throw new Error("VEILAP_SESSION_SECRET_REQUIRED");
}

export function expectedOrigin(request: Request): string {
  const candidate = process.env.VEILAP_APP_ORIGIN ?? new URL(request.url).origin;
  const parsed = new URL(candidate);
  if (parsed.origin !== candidate) throw new Error("VEILAP_APP_ORIGIN_INVALID");
  return parsed.origin;
}

export function requestOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;
  try {
    return new URL(origin).origin === origin ? origin : undefined;
  } catch {
    return undefined;
  }
}
