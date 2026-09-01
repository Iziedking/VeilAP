import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { expectedOrigin, requestOrigin } from "@/server/auth/runtime";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { createXOAuthFlow, safeOAuthReturnPath, X_OAUTH_FLOW_TTL_MS } from "@/server/identity/x-flow-token";
import { xAuthorizationUrl } from "@/server/identity/x-oauth-client";
import { getXOAuthConfig, walletFingerprint, X_OAUTH_COOKIE, xFlowSecret } from "@/server/identity/runtime";

export const runtime = "nodejs";

const bodySchema = z.object({
  returnTo: z.string().max(2_048).optional(),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  if (!origin || origin !== expectedOrigin(request)) return json({ ok: false, code: "ORIGIN_MISMATCH" }, 403);
  const actor = await readRequestActor();
  if (!actor.ok) return json(actor, 401);
  try {
    const config = getXOAuthConfig();
    const body = bodySchema.parse(await readJsonBody(request));
    const { flow, token, codeChallenge } = createXOAuthFlow({
      walletFingerprint: walletFingerprint(actor.walletAddress),
      returnTo: safeOAuthReturnPath(body.returnTo),
      secret: xFlowSecret(),
    });
    (await cookies()).set(X_OAUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: X_OAUTH_FLOW_TTL_MS / 1_000,
    });
    return json({
      ok: true,
      value: { authorizationUrl: xAuthorizationUrl({ ...config, state: flow.state, codeChallenge }) },
    });
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && error.message === "X_VERIFICATION_UNAVAILABLE") {
      return json({ ok: false, code: "X_VERIFICATION_UNAVAILABLE" }, 503);
    }
    return json({ ok: false, code: "X_VERIFICATION_START_FAILED" }, 503);
  }
}
