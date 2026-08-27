import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RpcProvider } from "starknet";
import { z } from "zod";

import type { AuthChallenge } from "@/server/auth/challenge";
import {
  expectedOrigin,
  getAuthChallenges,
  getSessionSecret,
  hasDurableAuthStore,
  requestOrigin,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/server/auth/runtime";
import { createSessionToken } from "@/server/auth/session";

export const runtime = "nodejs";

const bodySchema = z.object({
  challenge: z.object({
    nonce: z.string().startsWith("0x"),
    walletAddress: z.string(),
    origin: z.string(),
    chainId: z.string(),
    issuedAt: z.string(),
    expiresAt: z.string(),
    typedData: z.unknown(),
  }),
  walletAddress: z.string(),
  signature: z.array(z.string()).min(1).max(16),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!hasDurableAuthStore()) {
    return json({ ok: false, code: "AUTH_STORE_NOT_DURABLE" }, 503);
  }
  const origin = requestOrigin(request);
  if (!origin || origin !== expectedOrigin(request)) {
    return json({ ok: false, code: "ORIGIN_MISMATCH" }, 403);
  }
  const rpcUrl = process.env.STARKNET_RPC_URL;
  if (!rpcUrl) return json({ ok: false, code: "RPC_NOT_CONFIGURED" }, 503);

  try {
    const raw = await request.text();
    if (raw.length > 32_768) return json({ ok: false, code: "AUTH_REQUEST_TOO_LARGE" }, 413);
    const input = bodySchema.parse(JSON.parse(raw));
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
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
    const token = createSessionToken(
      {
        walletAddress: result.walletAddress,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      },
      getSessionSecret(),
    );
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return json({ ok: true, walletAddress: result.walletAddress });
  } catch {
    return json({ ok: false, code: "AUTH_REQUEST_INVALID" }, 400);
  }
}
