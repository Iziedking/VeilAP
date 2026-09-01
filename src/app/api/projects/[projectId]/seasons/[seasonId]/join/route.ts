import { NextResponse } from "next/server";
import { z } from "zod";

import { openArenaInvitation } from "@/server/arena/arena-invitation-token";
import { openAgentSubmission } from "@/server/arena/agent-submission-token";
import { readRequestActor } from "@/server/auth/request-actor";
import { getSessionSecret } from "@/server/auth/runtime";
import { JsonBodyError, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaEnrollmentService, getArenaSeasonService } from "@/server/projects/runtime";
import { hasXOAuthConfig } from "@/server/env";
import { getXIdentityRepository, walletFingerprint } from "@/server/identity/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  agentId: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/),
  policy: z.unknown().optional(),
  submissionToken: z.string().trim().min(32).max(96 * 1024).optional(),
  replaceExisting: z.boolean().optional().default(false),
  invitationToken: z.string().trim().min(32).max(4_096).optional(),
}).strict().refine((input) => (input.policy !== undefined) !== (input.submissionToken !== undefined), {
  message: "JOIN_REQUIRES_ONE_STRATEGY_SOURCE",
});

type JoinRouteContext = {
  params: Promise<{ projectId: string; seasonId: string }>;
};

export async function POST(request: Request, context: JoinRouteContext) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    if (!hasXOAuthConfig()) return serviceResponse({ ok: false, code: "X_VERIFICATION_UNAVAILABLE" });
    const xIdentity = await getXIdentityRepository().getByWalletFingerprint(walletFingerprint(actor.walletAddress));
    if (!xIdentity) return serviceResponse({ ok: false, code: "X_VERIFICATION_REQUIRED" });
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) return serviceResponse({ ok: false, code: "INVALID_INPUT" });
    const { projectId, seasonId } = await context.params;
    const input = requestSchema.parse(await readJsonBody(request));
    let policy = input.policy;
    if (input.submissionToken) {
      const submission = openAgentSubmission({ token: input.submissionToken, secret: getSessionSecret() });
      if (
        submission.projectId !== projectId
        || submission.seasonId !== seasonId
        || submission.agentPackage.agentId !== input.agentId.trim().toUpperCase()
      ) return serviceResponse({ ok: false, code: "INVALID_INPUT" });
      policy = submission.agentPackage;
    }
    let admission: "public" | "invite" = "public";
    if (input.invitationToken) {
      const invitation = openArenaInvitation({ token: input.invitationToken, secret: getSessionSecret() });
      if (invitation.projectId !== projectId || invitation.seasonId !== seasonId) {
        return serviceResponse({ ok: false, code: "ARENA_INVITATION_INVALID" });
      }
      admission = "invite";
    }
    const enrollment = await getArenaEnrollmentService().enroll({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
      agentId: input.agentId,
      policy,
      idempotencyKey,
      replaceExisting: input.replaceExisting,
      admission,
    });
    if (enrollment.ok) {
      const seasonService = getArenaSeasonService();
      const schedule = await seasonService.getPublicSchedule(projectId, seasonId);
      if (
        schedule.ok
        && schedule.value.season.templateId === "champion_challenge"
        && schedule.value.season.status === "open"
        && schedule.value.entries.length === 2
      ) {
        await seasonService.lockSeason({
          projectId,
          seasonId,
          actorWalletAddress: actor.walletAddress,
          idempotencyKey: `champion-lock-${seasonId}`,
        });
      }
    }
    return serviceResponse(enrollment);
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ ok: false, code: error.code }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    if (error instanceof Error && error.message === "ARENA_INVITATION_TOKEN_EXPIRED") {
      return serviceResponse({ ok: false, code: "ARENA_INVITATION_EXPIRED" });
    }
    if (error instanceof Error && error.message === "ARENA_INVITATION_TOKEN_INVALID") {
      return serviceResponse({ ok: false, code: "ARENA_INVITATION_INVALID" });
    }
    if (error instanceof Error && error.message === "AGENT_SUBMISSION_TOKEN_EXPIRED") {
      return serviceResponse({ ok: false, code: "INVALID_INPUT" });
    }
    if (error instanceof Error && error.message === "AGENT_SUBMISSION_TOKEN_INVALID") {
      return serviceResponse({ ok: false, code: "INVALID_INPUT" });
    }
    return serviceResponse({ ok: false, code: "INVALID_INPUT" });
  }
}

export async function GET(_request: Request, context: JoinRouteContext) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    return serviceResponse(await getArenaEnrollmentService().getMyEntry({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return serviceResponse({ ok: false, code: "INVALID_INPUT" });
  }
}
