import { describe, expect, it } from "vitest";

import { ARENA_ENGINE_VERSION } from "@/domain/arena/poker-engine";

import { openAgentSubmission, sealAgentSubmission } from "./agent-submission-token";

const secret = "submission-secret-with-at-least-thirty-two-characters";
const agentPackage = {
  protocolVersion: "veil-agent.v1" as const,
  engineVersion: ARENA_ENGINE_VERSION,
  agentId: "NIGHTJAR_01",
  displayName: "Nightjar",
  policy: {
    rules: [{ when: { pocketPair: true }, action: "raise" as const }],
    fallbackAction: "fold" as const,
  },
};

describe("agent submission claim token", () => {
  it("round-trips a validated package without exposing plaintext in the token", () => {
    const token = sealAgentSubmission({
      projectId: "project-1",
      seasonId: "season-1",
      agentPackage,
      secret,
      now: () => Date.parse("2026-08-31T09:00:00.000Z"),
    });
    expect(token).not.toContain("NIGHTJAR");
    expect(openAgentSubmission({
      token,
      secret,
      now: () => Date.parse("2026-08-31T10:00:00.000Z"),
    })).toMatchObject({ projectId: "project-1", seasonId: "season-1", agentPackage });
  });

  it("rejects tampering, the wrong secret and expired links", () => {
    const token = sealAgentSubmission({
      projectId: "project-1",
      seasonId: "season-1",
      agentPackage,
      secret,
      now: () => Date.parse("2026-08-31T09:00:00.000Z"),
      ttlMs: 60_000,
    });
    const parts = token.split(".");
    parts[3] = `${parts[3]![0] === "A" ? "B" : "A"}${parts[3]!.slice(1)}`;
    expect(() => openAgentSubmission({ token: parts.join("."), secret })).toThrow("AGENT_SUBMISSION_TOKEN_INVALID");
    expect(() => openAgentSubmission({ token, secret: `${secret}-wrong` })).toThrow("AGENT_SUBMISSION_TOKEN_INVALID");
    expect(() => openAgentSubmission({
      token,
      secret,
      now: () => Date.parse("2026-08-31T09:01:00.001Z"),
    })).toThrow("AGENT_SUBMISSION_TOKEN_EXPIRED");
  });
});
