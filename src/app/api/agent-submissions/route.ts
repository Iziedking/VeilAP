import { NextResponse } from "next/server";
import { z } from "zod";

import { ARENA_ENGINE_VERSION } from "@/domain/arena/poker-engine";
import {
  AGENT_PACKAGE_PROTOCOL_VERSION,
  agentPackageCommitment,
  parseAgentPackage,
} from "@/domain/arena/strategy-policy";
import { sealAgentSubmission } from "@/server/arena/agent-submission-token";
import { getSessionSecret } from "@/server/auth/runtime";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  seasonId: z.string().trim().min(1).max(120),
  agentPackage: z.unknown(),
}).strict();

function appOrigin(): string {
  const value = process.env.VEILAP_APP_ORIGIN;
  if (!value) throw new Error("CONFIGURATION_MISSING");
  const parsed = new URL(value);
  if (parsed.origin !== value) throw new Error("CONFIGURATION_MISSING");
  return parsed.origin;
}

function publicProjectId(): string {
  const value = process.env.NEXT_PUBLIC_VEIL_ARENA_PROJECT_ID?.trim();
  if (!value) throw new Error("CONFIGURATION_MISSING");
  return value;
}

export async function GET() {
  try {
    const projectId = publicProjectId();
    const result = await getArenaSeasonService().listPublicSeasons(projectId);
    if (!result.ok) return NextResponse.json(result, { status: 503, headers: { "Cache-Control": "no-store" } });
    const now = Date.now();
    const competitions = result.value
      .filter((season) => (
        season.status === "open"
        && season.entryMode === "open"
        && Date.parse(season.startsAt) <= now
        && now < Date.parse(season.locksAt)
      ))
      .map((season) => ({
        projectId,
        seasonId: season.id,
        name: season.name,
        rulesetVersion: season.rulesetVersion,
        locksAt: season.locksAt,
        seatsRemaining: Math.max(0, season.maxEntries - season.entryCount),
        acceptsNewEntries: season.entryCount < season.maxEntries,
        acceptsReplacement: season.rules?.resubmissionPolicy === "replace_until_lock",
        templateId: season.templateId ?? "legacy",
        pairingMode: season.rules?.pairingMode ?? "round_robin",
        handsPerMatch: season.rules?.handsPerMatch ?? 8,
        encountersPerPair: season.rules?.encountersPerPair ?? 1,
        revealPolicy: season.rules?.revealPolicy ?? "loser_action_only",
        rulesCommitment: season.rulesCommitment,
        rewardMode: season.prizeStatus === "funded"
          ? "funded"
          : season.prizeStatus === "funding_pending"
            ? "pledged"
            : "exhibition",
      }));
    return NextResponse.json({
      ok: true,
      value: {
        protocolVersion: AGENT_PACKAGE_PROTOCOL_VERSION,
        engineVersion: ARENA_ENGINE_VERSION,
        competitions,
        submitUrl: "/api/agent-submissions",
        guideUrl: `${appOrigin()}/AGENT.md`,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error && error.message === "CONFIGURATION_MISSING"
      ? "CONFIGURATION_MISSING"
      : "ARENA_UNAVAILABLE";
    return NextResponse.json({ ok: false, code }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await readJsonBody(request, 64 * 1024));
    const schedule = await getArenaSeasonService().getPublicSchedule(input.projectId, input.seasonId);
    if (!schedule.ok) return NextResponse.json(schedule, { status: 404, headers: { "Cache-Control": "no-store" } });
    const season = schedule.value.season;
    const now = Date.now();
    if (season.status !== "open" || season.entryMode !== "open" || now < Date.parse(season.startsAt) || now >= Date.parse(season.locksAt)) {
      return NextResponse.json({ ok: false, code: "ARENA_SEASON_NOT_OPEN" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const agentPackage = parseAgentPackage(input.agentPackage);
    const token = sealAgentSubmission({
      projectId: input.projectId,
      seasonId: input.seasonId,
      agentPackage,
      secret: getSessionSecret(),
    });
    return NextResponse.json({
      ok: true,
      value: {
        artifactCommitment: agentPackageCommitment(agentPackage),
        claimUrl: `${appOrigin()}/play#submission=${encodeURIComponent(token)}`,
        expiresInSeconds: 24 * 60 * 60,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    const code = error instanceof Error && error.message === "CONFIGURATION_MISSING"
      ? "CONFIGURATION_MISSING"
      : "INVALID_INPUT";
    return NextResponse.json({ ok: false, code }, { status: code === "CONFIGURATION_MISSING" ? 503 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
