import { NextResponse } from "next/server";

import { getSessionSecret, expectedOrigin } from "@/server/auth/runtime";
import { readRequestActor } from "@/server/auth/request-actor";
import { sealArenaInvitation } from "@/server/arena/arena-invitation-token";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService, getProjectService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const maximumInvitationLifetimeMs = 7 * 24 * 60 * 60_000;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    const project = await getProjectService().getProject({
      projectId,
      walletAddress: actor.walletAddress,
    });
    if (!project.ok) return serviceResponse(project);
    if (!project.value.roles.includes("company")) {
      return serviceResponse({ ok: false, code: "ROLE_FORBIDDEN" });
    }

    const schedule = await getArenaSeasonService().getPublicSchedule(projectId, seasonId);
    if (!schedule.ok) return serviceResponse(schedule);
    if (schedule.value.season.status !== "open" || schedule.value.season.entryMode !== "invite_only") {
      return serviceResponse({ ok: false, code: "INVALID_INPUT" });
    }

    const now = Date.now();
    const lockTime = Date.parse(schedule.value.season.locksAt);
    const expiresAt = Math.min(lockTime, now + maximumInvitationLifetimeMs);
    if (!Number.isFinite(lockTime) || expiresAt - now < 60_000) {
      return serviceResponse({ ok: false, code: "ARENA_SEASON_CLOSED" });
    }

    const invitation = sealArenaInvitation({
      projectId,
      seasonId,
      secret: getSessionSecret(),
      expiresAt: new Date(expiresAt),
    });
    const url = new URL("/play", expectedOrigin(request));
    url.searchParams.set("project", projectId);
    url.searchParams.set("season", seasonId);
    url.searchParams.set("invite", invitation);
    return NextResponse.json({
      ok: true,
      value: {
        url: url.toString(),
        expiresAt: new Date(expiresAt).toISOString(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("_REQUIRED")) {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return serviceResponse({ ok: false, code: "INVALID_INPUT" });
  }
}
