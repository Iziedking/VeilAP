import { describe, expect, it } from "vitest";

import { hasXOAuthConfig } from "@/server/env";
import { createMemoryXIdentityRepository } from "./x-identity-repository";
import { createXOAuthFlow, oauthStateMatches, openXOAuthFlow, safeOAuthReturnPath } from "./x-flow-token";
import { xAuthorizationUrl } from "./x-oauth-client";

const SECRET = "veil-arena-x-flow-test-secret-with-more-than-32-characters";
const NOW = Date.parse("2026-09-01T12:00:00.000Z");

describe("X OAuth flow envelope", () => {
  it("accepts only complete production HTTPS configuration", () => {
    const complete = {
      NODE_ENV: "production",
      X_OAUTH_CLIENT_ID: "client-id",
      X_OAUTH_CLIENT_SECRET: "client-secret",
      X_OAUTH_REDIRECT_URI: "https://api.veilap.xyz/api/auth/x/callback",
    };
    expect(hasXOAuthConfig(complete)).toBe(true);
    expect(hasXOAuthConfig({ ...complete, X_OAUTH_CLIENT_SECRET: "" })).toBe(false);
    expect(hasXOAuthConfig({ ...complete, X_OAUTH_REDIRECT_URI: "http://api.veilap.xyz/api/auth/x/callback" })).toBe(false);
    expect(hasXOAuthConfig({
      ...complete,
      NODE_ENV: "development",
      X_OAUTH_REDIRECT_URI: "http://127.0.0.1:3011/api/auth/x/callback",
    })).toBe(true);
  });

  it("round-trips a wallet-bound PKCE flow and rejects tampering", () => {
    const created = createXOAuthFlow({
      walletFingerprint: "wallet-fingerprint",
      returnTo: "/play?project=project-1",
      secret: SECRET,
      now: () => NOW,
    });
    const opened = openXOAuthFlow(created.token, SECRET, NOW + 1_000);
    expect(opened.walletFingerprint).toBe("wallet-fingerprint");
    expect(opened.returnTo).toBe("/play?project=project-1");
    expect(created.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(oauthStateMatches(opened.state, created.flow.state)).toBe(true);
    expect(() => openXOAuthFlow(`${created.token}A`, SECRET, NOW + 1_000)).toThrow("X_OAUTH_FLOW_INVALID");
  });

  it("expires quickly and blocks external return URLs", () => {
    const created = createXOAuthFlow({
      walletFingerprint: "wallet-fingerprint",
      returnTo: "//attacker.example/steal",
      secret: SECRET,
      now: () => NOW,
    });
    expect(created.flow.returnTo).toBe("/play");
    expect(safeOAuthReturnPath("/arena/project/season")).toBe("/arena/project/season");
    expect(() => openXOAuthFlow(created.token, SECRET, NOW + 10 * 60_000)).toThrow("X_OAUTH_FLOW_EXPIRED");
  });

  it("uses S256 and read-only identity scopes", () => {
    const url = new URL(xAuthorizationUrl({
      clientId: "client-id",
      clientSecret: "not-in-url",
      redirectUri: "https://api.veilap.xyz/api/auth/x/callback",
      state: "state",
      codeChallenge: "challenge",
    }));
    expect(url.origin).toBe("https://x.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("tweet.read users.read");
    expect(url.toString()).not.toContain("not-in-url");
  });
});

describe("participant X identity repository", () => {
  const identity = {
    xUserId: "123456789",
    walletFingerprint: "wallet-a",
    username: "veil_player",
    connectedAt: new Date(NOW),
    lastVerifiedAt: new Date(NOW),
  };

  it("binds one immutable X id to one wallet while allowing profile refresh", async () => {
    const repository = createMemoryXIdentityRepository();
    await repository.linkIdentity(identity);
    const refreshed = await repository.linkIdentity({
      ...identity,
      username: "new_handle",
      lastVerifiedAt: new Date(NOW + 1_000),
      connectedAt: new Date(NOW + 1_000),
    });
    expect(refreshed.username).toBe("new_handle");
    expect(refreshed.connectedAt).toEqual(new Date(NOW));
    expect(await repository.getByWalletFingerprint("wallet-a")).toMatchObject({ xUserId: "123456789" });
  });

  it("refuses account reuse and wallet relinking", async () => {
    const repository = createMemoryXIdentityRepository();
    await repository.linkIdentity(identity);
    await expect(repository.linkIdentity({ ...identity, walletFingerprint: "wallet-b" }))
      .rejects.toThrow("X_ACCOUNT_ALREADY_LINKED");
    await expect(repository.linkIdentity({ ...identity, xUserId: "987654321" }))
      .rejects.toThrow("X_WALLET_ALREADY_LINKED");
  });
});
