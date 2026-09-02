import { z } from "zod";

const tokenSchema = z.object({
  token_type: z.string(),
  access_token: z.string().min(1),
}).passthrough();

const userSchema = z.object({
  data: z.object({
    id: z.string().min(1).max(64),
    username: z.string().min(1).max(64),
    profile_image_url: z.string().url().max(2_048).nullable().optional(),
  }),
}).passthrough();

export type XOAuthConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}>;

export type XAuthenticatedUser = Readonly<{
  id: string;
  username: string;
  profileImageUrl: string | null;
}>;

function safeXProfileImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pbs.twimg.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

export function xAuthorizationUrl(input: XOAuthConfig & { state: string; codeChallenge: string }): string {
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: "tweet.read users.read",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeXAuthorizationCode(input: XOAuthConfig & { code: string; codeVerifier: string }): Promise<string> {
  // X OAuth 2.0 Authorization Code with PKCE, verified against docs.x.com on 2026-09-01.
  const response = await fetchWithTimeout("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
  });
  if (!response.ok) throw new Error("X_OAUTH_CODE_EXCHANGE_FAILED");
  return tokenSchema.parse(await response.json()).access_token;
}

export async function getAuthenticatedXUser(accessToken: string): Promise<XAuthenticatedUser> {
  // X GET /2/users/me, verified against docs.x.com on 2026-09-01.
  const response = await fetchWithTimeout("https://api.x.com/2/users/me?user.fields=profile_image_url", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(response.status === 429 ? "X_RATE_LIMITED" : "X_PROFILE_LOOKUP_FAILED");
  const { data } = userSchema.parse(await response.json());
  return {
    id: data.id,
    username: data.username,
    profileImageUrl: safeXProfileImageUrl(data.profile_image_url),
  };
}
