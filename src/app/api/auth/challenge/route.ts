import { NextResponse } from "next/server";
import { z } from "zod";

import {
  expectedOrigin,
  getAuthChallenges,
  hasAuthStore,
  requestOrigin,
} from "@/server/auth/runtime";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";

export const runtime = "nodejs";

const requestSchema = z.object({
  walletAddress: z.string().min(3).max(80),
  chainId: z.literal("SN_MAIN"),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!hasAuthStore()) {
    return json(
      {
        ok: false,
        code: "CONFIGURATION_MISSING",
        message: "Wallet sign-in is unavailable until persisted security configuration is installed.",
      },
      503,
    );
  }

  const origin = requestOrigin(request);
  if (!origin || origin !== expectedOrigin(request)) {
    return json({ ok: false, code: "ORIGIN_MISMATCH" }, 403);
  }

  try {
    const input = requestSchema.parse(await readJsonBody(request));
    const challenge = await getAuthChallenges().issue({ ...input, origin });
    return json({ ok: true, challenge });
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return json({ ok: false, code: "CHALLENGE_REQUEST_INVALID" }, 400);
  }
}
