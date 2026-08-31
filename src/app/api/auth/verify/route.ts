import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { constants, RpcProvider } from "starknet";
import { z } from "zod";

import type { AuthChallenge } from "@/server/auth/challenge";
import {
  expectedOrigin,
  getAuthRepositories,
  getAuthChallenges,
  getSessionSecret,
  getWalletHashPepper,
  hasAuthStore,
  requestOrigin,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/server/auth/runtime";
import { createSessionToken } from "@/server/auth/session";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { checkWalletAccountReadiness } from "@/server/auth/starknet-account";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

const bodySchema = z.object({
  challenge: z.object({
    nonce: z.string().startsWith("0x").max(130),
    walletAddress: z.string().min(3).max(80),
    origin: z.string().url().max(2_048),
    chainId: z.literal(constants.StarknetChainId.SN_MAIN),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    typedData: z.unknown(),
  }).strict(),
  walletAddress: z.string().min(3).max(80),
  signature: z.array(z.string()).min(1).max(16),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!hasAuthStore()) {
    return json({ ok: false, code: "CONFIGURATION_MISSING" }, 503);
  }
  const origin = requestOrigin(request);
  if (!origin || origin !== expectedOrigin(request)) {
    return json({ ok: false, code: "ORIGIN_MISMATCH" }, 403);
  }
  const rpcUrl = process.env.STARKNET_RPC_URL;
  if (!rpcUrl) return json({ ok: false, code: "RPC_NOT_CONFIGURED" }, 503);

  try {
    const input = bodySchema.parse(await readJsonBody(request));
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const readiness = await checkWalletAccountReadiness(provider, input.walletAddress);
    if (!readiness.ok) {
      return json(readiness, readiness.code === "WALLET_ACCOUNT_NOT_DEPLOYED" ? 409 : 503);
    }
    const result = await getAuthChallenges().verify({
      challenge: input.challenge as AuthChallenge,
      requestOrigin: origin,
      walletAddress: input.walletAddress,
      signature: input.signature,
      // starknet@10.4.0 ProviderInterface.verifyMessageInStarknet, read 2026-08-27.
      verifySignature: (typedData, signature, walletAddress) =>
        provider.verifyMessageInStarknet(typedData, signature, walletAddress),
    });
    if (!result.ok) return json(result, 401);

    const now = Date.now();
    const sessionId = randomBytes(16).toString("hex");
    const token = createSessionToken(
      {
        sessionId,
        walletAddress: result.walletAddress,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      },
      getSessionSecret(),
    );
    await getAuthRepositories().sessions.saveSession({
      id: sessionId,
      walletFingerprint: fingerprintWallet(result.walletAddress, getWalletHashPepper()),
      issuedAt: new Date(now),
      expiresAt: new Date(now + SESSION_TTL_MS),
    });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return json({ ok: true, walletAddress: result.walletAddress });
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return json({ ok: false, code: "AUTH_REQUEST_INVALID" }, 400);
  }
}
