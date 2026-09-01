import { NextResponse } from "next/server";
import { z } from "zod";

import { agentPackageCommitment } from "@/domain/arena/strategy-policy";
import { openAgentSubmission } from "@/server/arena/agent-submission-token";
import { getSessionSecret } from "@/server/auth/runtime";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";

export const runtime = "nodejs";

const requestSchema = z.object({ token: z.string().min(32).max(96 * 1024) }).strict();

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await readJsonBody(request, 128 * 1024));
    const submission = openAgentSubmission({ token: input.token, secret: getSessionSecret() });
    return NextResponse.json({
      ok: true,
      value: {
        projectId: submission.projectId,
        seasonId: submission.seasonId,
        agent: {
          agentId: submission.agentPackage.agentId,
          displayName: submission.agentPackage.displayName,
          protocolVersion: submission.agentPackage.protocolVersion,
          engineVersion: submission.agentPackage.engineVersion,
          ruleCount: submission.agentPackage.policy.rules.length,
        },
        artifactCommitment: agentPackageCommitment(submission.agentPackage),
        expiresAt: submission.expiresAt,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    const code = error instanceof Error && error.message === "AGENT_SUBMISSION_TOKEN_EXPIRED"
      ? "AGENT_SUBMISSION_TOKEN_EXPIRED"
      : "AGENT_SUBMISSION_TOKEN_INVALID";
    return NextResponse.json({ ok: false, code }, { status: code.endsWith("EXPIRED") ? 410 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
