import { describe, expect, it } from "vitest";
import { constants } from "starknet";
import { createAuthChallengeService, type AuthChallenge } from "./challenge";
import { createSessionToken, verifyActiveSession, verifySessionToken } from "./session";
import { createMemoryRepositories } from "@/server/db/repositories";

const ORIGIN = "http://127.0.0.1:3000";
const WALLET = "0x123";
const CHAIN_ID = "SN_MAIN";
const NOW = Date.parse("2026-08-27T18:00:00.000Z");
const NONCE = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const SECRET = "veilap-test-session-secret-is-at-least-32-characters";

function makeService(now = NOW) {
  return createAuthChallengeService({ now: () => now, nonce: () => NONCE });
}

function copyChallenge(challenge: AuthChallenge): AuthChallenge {
  return structuredClone(challenge);
}

describe("wallet authentication challenge", () => {
  it("normalizes the mainnet chain id for Starknet typed data", () => {
    const challenge = createAuthChallengeService({ now: () => NOW }).issue({
      walletAddress: WALLET,
      origin: ORIGIN,
      chainId: CHAIN_ID,
    });

    expect(challenge.chainId).toBe(constants.StarknetChainId.SN_MAIN);
    expect(challenge.typedData.domain.chainId).toBe(constants.StarknetChainId.SN_MAIN);
  });

  it("generates a nonce that fits the Starknet felt boundary", () => {
    const challenge = createAuthChallengeService({ now: () => NOW }).issue({
      walletAddress: WALLET,
      origin: ORIGIN,
      chainId: CHAIN_ID,
    });

    expect(challenge.nonce).toMatch(/^0x[0-9a-f]{62}$/);
    expect(BigInt(challenge.nonce)).toBeLessThan(1n << 248n);
  });

  it("accepts one valid signature for the exact challenge", async () => {
    const service = makeService();
    const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
    const result = await service.verify({
      challenge,
      requestOrigin: ORIGIN,
      walletAddress: WALLET,
      signature: ["0x1", "0x2"],
      verifySignature: async (typedData, signature, walletAddress) => {
        expect(typedData).toEqual(challenge.typedData);
        expect(signature).toEqual(["0x1", "0x2"]);
        expect(walletAddress).toBe(challenge.walletAddress);
        return true;
      },
    });
    expect(result).toEqual({ ok: true, walletAddress: challenge.walletAddress });
  });

  it("refuses the wrong browser origin", async () => {
    const service = makeService();
    const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
    const result = await service.verify({
      challenge,
      requestOrigin: "https://attacker.example",
      walletAddress: WALLET,
      signature: ["0x1"],
      verifySignature: async () => true,
    });
    expect(result).toEqual({ ok: false, code: "ORIGIN_MISMATCH" });
  });
});

describe("challenge refusal paths", () => {
  it("refuses a different wallet address", async () => {
    const service = makeService();
    const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
    const result = await service.verify({
      challenge,
      requestOrigin: ORIGIN,
      walletAddress: "0x456",
      signature: ["0x1"],
      verifySignature: async () => true,
    });
    expect(result).toEqual({ ok: false, code: "WALLET_MISMATCH" });
  });

  it("refuses an expired challenge", async () => {
    const service = makeService();
    const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
    service.setClock(() => NOW + 5 * 60_000);
    const result = await service.verify({
      challenge,
      requestOrigin: ORIGIN,
      walletAddress: WALLET,
      signature: ["0x1"],
      verifySignature: async () => true,
    });
    expect(result).toEqual({ ok: false, code: "CHALLENGE_EXPIRED" });
  });

  it("refuses replay after successful verification", async () => {
    const service = makeService();
    const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
    const request = {
      challenge,
      requestOrigin: ORIGIN,
      walletAddress: WALLET,
      signature: ["0x1"],
      verifySignature: async () => true,
    };
    expect(await service.verify(request)).toMatchObject({ ok: true });
    expect(await service.verify(request)).toEqual({ ok: false, code: "CHALLENGE_REPLAYED" });
  });

  it("does not consume a challenge when signature verification fails", async () => {
    const service = makeService();
    const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
    const request = {
      challenge,
      requestOrigin: ORIGIN,
      walletAddress: WALLET,
      signature: ["0x1"],
    };
    await expect(service.verify({ ...request, verifySignature: async () => false })).resolves.toEqual({
      ok: false,
      code: "SIGNATURE_INVALID",
    });
    await expect(service.verify({ ...request, verifySignature: async () => true })).resolves.toMatchObject({ ok: true });
  });

  it("accepts only one concurrent verification", async () => {
    const service = makeService();
    const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
    const request = {
      challenge,
      requestOrigin: ORIGIN,
      walletAddress: WALLET,
      signature: ["0x1"],
      verifySignature: async () => true,
    };
    const results = await Promise.all([service.verify(request), service.verify(request)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({ ok: false, code: "CHALLENGE_REPLAYED" });
  });
});

it("refuses an altered challenge before signature verification", async () => {
  const service = makeService();
  const challenge = service.issue({ walletAddress: WALLET, origin: ORIGIN, chainId: CHAIN_ID });
  const altered = copyChallenge(challenge);
  altered.typedData.message.origin = "https://attacker.example";
  let signatureChecked = false;
  const result = await service.verify({
    challenge: altered,
    requestOrigin: ORIGIN,
    walletAddress: WALLET,
    signature: ["0x1"],
    verifySignature: async () => {
      signatureChecked = true;
      return true;
    },
  });
  expect(result).toEqual({ ok: false, code: "CHALLENGE_ALTERED" });
  expect(signatureChecked).toBe(false);
});

describe("signed session cookie", () => {
  it("round-trips and rejects payload tampering", () => {
    const token = createSessionToken({
      walletAddress: WALLET,
      issuedAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + 60_000).toISOString(),
    }, SECRET);
    expect(verifySessionToken(token, SECRET, NOW)).toMatchObject({
      ok: true,
      session: { walletAddress: expect.stringMatching(/^0x/) },
    });
    const [payload, signature] = token.split(".");
    expect(verifySessionToken(`${payload}A.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      code: "SESSION_INVALID",
    });
  });

  it("refuses an expired session", () => {
    const token = createSessionToken({
      walletAddress: WALLET,
      issuedAt: new Date(NOW - 120_000).toISOString(),
      expiresAt: new Date(NOW - 60_000).toISOString(),
    }, SECRET);
    expect(verifySessionToken(token, SECRET, NOW)).toEqual({
      ok: false,
      code: "SESSION_EXPIRED",
    });
  });

  it("requires a durable, unrevoked session record", async () => {
    const repositories = createMemoryRepositories();
    const sessionId = "session-1";
    const issuedAt = new Date(NOW);
    const expiresAt = new Date(NOW + 60_000);
    const token = createSessionToken({
      sessionId,
      walletAddress: WALLET,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }, SECRET);

    await expect(verifyActiveSession(token, SECRET, repositories.sessions, NOW)).resolves.toEqual({
      ok: false,
      code: "SESSION_INACTIVE",
    });
    await repositories.sessions.saveSession({
      id: sessionId,
      walletFingerprint: "fingerprint",
      issuedAt,
      expiresAt,
    });
    await expect(verifyActiveSession(token, SECRET, repositories.sessions, NOW)).resolves.toMatchObject({ ok: true });
    await repositories.sessions.revokeSession(sessionId, new Date(NOW + 1));
    await expect(verifyActiveSession(token, SECRET, repositories.sessions, NOW + 2)).resolves.toEqual({
      ok: false,
      code: "SESSION_INACTIVE",
    });
  });
});
