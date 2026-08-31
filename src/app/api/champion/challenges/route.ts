import { NextResponse } from "next/server";

import { VEIL_ARENA_CHAMPION, VEIL_ARENA_CHAMPION_AGENT_ID } from "@/domain/arena/veil-arena-champion";
import { getSessionSecret, expectedOrigin } from "@/server/auth/runtime";
import { readRequestActor } from "@/server/auth/request-actor";
import { sealArenaInvitation } from "@/server/arena/arena-invitation-token";
import { serviceResponse } from "@/server/http/service-response";
import {
  getArenaEnrollmentService,
  getArenaSeasonService,
  getProjectService,
} from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);

    const now = new Date();
    const locksAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const endsAt = new Date(now.getTime() + 48 * 60 * 60_000);
    const requestId = crypto.randomUUID();
    const project = await getProjectService().createProject({
      name: "Null Jack challenge",
      walletAddress: actor.walletAddress,
    });
    if (!project.ok) return serviceResponse(project);

    const season = await getArenaSeasonService().createSeason({
      projectId: project.value.id,
      actorWalletAddress: actor.walletAddress,
      idempotencyKey: `champion-season-${requestId}`,
      name: "Challenge Null Jack",
      startsAt: new Date(now.getTime() - 30_000).toISOString(),
      locksAt: locksAt.toISOString(),
      endsAt: endsAt.toISOString(),
      templateId: "champion_challenge",
    });
    if (!season.ok) return serviceResponse(season);

    const champion = await getArenaEnrollmentService().enrollSystem({
      projectId: project.value.id,
      seasonId: season.value.id,
      agentId: VEIL_ARENA_CHAMPION_AGENT_ID,
      policy: VEIL_ARENA_CHAMPION,
      idempotencyKey: `champion-entry-${requestId}`,
    });
    if (!champion.ok) return serviceResponse(champion);

    const invitation = sealArenaInvitation({
      projectId: project.value.id,
      seasonId: season.value.id,
      secret: getSessionSecret(),
      expiresAt: locksAt,
    });
    const joinUrl = new URL("/play", expectedOrigin(request));
    joinUrl.searchParams.set("project", project.value.id);
    joinUrl.searchParams.set("season", season.value.id);
    joinUrl.searchParams.set("invite", invitation);

    return NextResponse.json({
      ok: true,
      value: {
        projectId: project.value.id,
        seasonId: season.value.id,
        joinUrl: joinUrl.toString(),
        roomUrl: `/arena/${encodeURIComponent(project.value.id)}/${encodeURIComponent(season.value.id)}`,
        expiresAt: locksAt.toISOString(),
        champion: {
          agentId: champion.value.agentId,
          displayName: champion.value.displayName,
          artifactCommitment: champion.value.artifactCommitment,
        },
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.endsWith("_REQUIRED")) {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return serviceResponse({ ok: false, code: "PERSISTENCE_FAILED" });
  }
}
