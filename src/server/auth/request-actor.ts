import { cookies } from "next/headers";

import {
  getSessionSecret,
  SESSION_COOKIE,
} from "./runtime";
import { verifySessionToken } from "./session";

export async function readRequestActor(): Promise<
  | { ok: true; walletAddress: string }
  | { ok: false; code: "AUTH_REQUIRED" }
> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return { ok: false, code: "AUTH_REQUIRED" };
    const verified = verifySessionToken(token, getSessionSecret());
    if (!verified.ok) return { ok: false, code: "AUTH_REQUIRED" };
    return { ok: true, walletAddress: verified.session.walletAddress };
  } catch {
    return { ok: false, code: "AUTH_REQUIRED" };
  }
}
