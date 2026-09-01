import { NextResponse } from "next/server";

const notFoundCodes = new Set([
  "PROJECT_NOT_FOUND",
  "AGREEMENT_NOT_FOUND",
  "CHECKPOINT_NOT_FOUND",
  "DECISION_NOT_FOUND",
  "RELEASE_NOT_FOUND",
  "REVENUE_EVENT_NOT_FOUND",
  "RECEIPT_NOT_FOUND",
  "STRATEGY_ARTIFACT_NOT_FOUND",
  "ARENA_MATCH_NOT_FOUND",
  "ARENA_SEASON_NOT_FOUND",
  "ARENA_SCHEDULED_MATCH_NOT_FOUND",
  "ARENA_PRIZE_POOL_NOT_FOUND",
]);
const conflictCodes = new Set([
  "STRATEGY_ARTIFACT_ALREADY_EXISTS",
  "IDEMPOTENCY_KEY_REUSED",
  "ARENA_SEASON_ALREADY_LOCKED",
  "ARENA_SEASON_NOT_OPEN",
  "ARENA_SEASON_NOT_PUBLIC",
  "ARENA_SEASON_NOT_STARTED",
  "ARENA_SEASON_CLOSED",
  "ARENA_SEASON_NOT_ACTIVE",
  "ARENA_SEASON_FULL",
  "ARENA_WALLET_ALREADY_ENTERED",
  "ARENA_REPLACEMENT_CONFIRMATION_REQUIRED",
  "ARENA_RESUBMISSION_FORBIDDEN",
  "ARENA_REPLACEMENT_AGENT_ID_REQUIRED",
  "ARENA_SUBMISSION_LIMIT_REACHED",
  "ARENA_ENTRY_VERSION_CONFLICT",
  "ARENA_INVITATION_EXPIRED",
  "ARENA_SEASON_TOO_SMALL",
  "ARENA_BENCHMARK_REQUIRED",
  "ARENA_SEASON_ENTRY_ALREADY_EXISTS",
  "ARENA_SCHEDULED_MATCH_IN_PROGRESS",
  "ARENA_PRIZE_POOL_ALREADY_EXISTS",
  "ARENA_PRIZE_POOL_ALREADY_FUNDED",
  "ARENA_PRIZE_POOL_ALREADY_SETTLED",
  "ARENA_WINNER_TIE",
  "ARENA_WINNER_PAYOUT_NOT_REGISTERED",
  "ARENA_MATCH_NOT_COMPLETE",
  "ARENA_PRIZE_POOL_NOT_FUNDED",
  "ARENA_PRIZE_POOL_NOT_SETTLEMENT_READY",
  "TRANSACTION_NOT_CONFIRMED",
  "TRANSACTION_ALREADY_USED",
  "ARENA_PRIZE_POOL_STATE_CHANGED",
  "TRANSFER_PLAN_MISMATCH",
  "TRANSFER_AUTHORIZATION_EXPIRED",
  "X_ACCOUNT_ALREADY_LINKED",
  "X_WALLET_ALREADY_LINKED",
]);
const forbiddenCodes = new Set([
  "PROJECT_ACCESS_REQUIRED",
  "ROLE_FORBIDDEN",
  "CHECKPOINT_NOT_ASSIGNED",
  "EVIDENCE_FORBIDDEN",
  "REVIEWER_NOT_INVITED",
  "WALLET_FORBIDDEN",
  "ARENA_SPONSOR_WALLET_REQUIRED",
]);

export function serviceResponse(
  result: { ok: true; value: unknown } | { ok: false; code: string },
  metadata?: Record<string, string>,
) {
  if (result.ok) return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  let status = 400;
  if (notFoundCodes.has(result.code)) status = 404;
  else if (conflictCodes.has(result.code)) status = 409;
  else if (forbiddenCodes.has(result.code)) status = 403;
  else if (result.code === "AUTH_REQUIRED") status = 401;
  else if (result.code === "X_VERIFICATION_REQUIRED") status = 403;
  else if (result.code === "NO_LOSING_AGENT") status = 409;
  else if (result.code === "PERSISTENCE_FAILED" || result.code === "ENCRYPTION_FAILED" || result.code === "CONFIGURATION_MISSING" || result.code === "SIGNING_UNAVAILABLE" || result.code === "SIGNATURE_UNAVAILABLE" || result.code === "X_VERIFICATION_UNAVAILABLE") status = 503;
  return NextResponse.json(metadata ? { ...result, ...metadata } : result, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
