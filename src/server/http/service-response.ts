import { NextResponse } from "next/server";

const notFoundCodes = new Set([
  "PROJECT_NOT_FOUND",
  "AGREEMENT_NOT_FOUND",
  "CHECKPOINT_NOT_FOUND",
]);
const forbiddenCodes = new Set([
  "PROJECT_ACCESS_REQUIRED",
  "ROLE_FORBIDDEN",
  "CHECKPOINT_NOT_ASSIGNED",
  "EVIDENCE_FORBIDDEN",
  "REVIEWER_NOT_INVITED",
]);

export function serviceResponse(result: { ok: true; value: unknown } | { ok: false; code: string }) {
  if (result.ok) return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  let status = 400;
  if (notFoundCodes.has(result.code)) status = 404;
  else if (forbiddenCodes.has(result.code)) status = 403;
  else if (result.code === "AUTH_REQUIRED") status = 401;
  else if (result.code === "PERSISTENCE_FAILED" || result.code === "ENCRYPTION_FAILED") status = 503;
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
