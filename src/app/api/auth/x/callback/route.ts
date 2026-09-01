import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { expectedOrigin } from "@/server/auth/runtime";
import { openXOAuthFlow, oauthStateMatches, safeOAuthReturnPath } from "@/server/identity/x-flow-token";
import { exchangeXAuthorizationCode, getAuthenticatedXUser } from "@/server/identity/x-oauth-client";
import { getXIdentityRepository, getXOAuthConfig, walletFingerprint, X_OAUTH_COOKIE, xFlowSecret } from "@/server/identity/runtime";

export const runtime = "nodejs";

function clearFlowCookie(store: Awaited<ReturnType<typeof cookies>>) {
  store.set(X_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function resultRedirect(request: Request, returnTo: string, result: string): NextResponse {
  const target = new URL(safeOAuthReturnPath(returnTo), expectedOrigin(request));
  target.searchParams.set("xVerification", result);
  return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const store = await cookies();
  const token = store.get(X_OAUTH_COOKIE)?.value;
  let returnTo = "/play";
  try {
    if (!token) throw new Error("X_OAUTH_FLOW_INVALID");
    const flow = openXOAuthFlow(token, xFlowSecret());
    returnTo = flow.returnTo;
    const url = new URL(request.url);
    if (url.searchParams.get("error")) {
      clearFlowCookie(store);
      return resultRedirect(request, returnTo, "cancelled");
    }
    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!code || !oauthStateMatches(flow.state, state)) throw new Error("X_OAUTH_STATE_INVALID");

    const actor = await readRequestActor();
    if (!actor.ok || walletFingerprint(actor.walletAddress) !== flow.walletFingerprint) {
      throw new Error("X_OAUTH_WALLET_MISMATCH");
    }
    const config = getXOAuthConfig();
    const accessToken = await exchangeXAuthorizationCode({ ...config, code, codeVerifier: flow.codeVerifier });
    const xUser = await getAuthenticatedXUser(accessToken);
    const now = new Date();
    await getXIdentityRepository().linkIdentity({
      xUserId: xUser.id,
      walletFingerprint: flow.walletFingerprint,
      username: xUser.username,
      connectedAt: now,
      lastVerifiedAt: now,
    });
    clearFlowCookie(store);
    return resultRedirect(request, returnTo, "verified");
  } catch (error) {
    clearFlowCookie(store);
    const code = error instanceof Error ? error.message : "X_VERIFICATION_FAILED";
    if (code === "X_ACCOUNT_ALREADY_LINKED" || code === "X_WALLET_ALREADY_LINKED") {
      return resultRedirect(request, returnTo, code.toLowerCase());
    }
    if (code === "X_RATE_LIMITED") return resultRedirect(request, returnTo, "rate_limited");
    if (code === "X_OAUTH_FLOW_EXPIRED") return resultRedirect(request, returnTo, "expired");
    if (code === "X_OAUTH_WALLET_MISMATCH") return resultRedirect(request, returnTo, "wallet_mismatch");
    return resultRedirect(request, returnTo, "failed");
  }
}
