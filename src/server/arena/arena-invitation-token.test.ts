import { describe, expect, it } from "vitest";

import { openArenaInvitation, sealArenaInvitation } from "./arena-invitation-token";

const secret = "private-challenge-secret-with-at-least-thirty-two-characters";
const issuedAt = Date.parse("2026-08-31T09:00:00.000Z");

describe("private arena invitation token", () => {
  it("binds an opaque invitation to one project and season", () => {
    const token = sealArenaInvitation({
      projectId: "project-private",
      seasonId: "season-duel",
      secret,
      now: () => issuedAt,
      expiresAt: new Date(issuedAt + 60_000),
    });

    expect(token).not.toContain("project-private");
    expect(openArenaInvitation({ token, secret, now: () => issuedAt + 1_000 })).toMatchObject({
      projectId: "project-private",
      seasonId: "season-duel",
      expiresAt: "2026-08-31T09:01:00.000Z",
    });
  });

  it("rejects tampering, the wrong secret, expiry, and excessive lifetime", () => {
    const token = sealArenaInvitation({
      projectId: "project-private",
      seasonId: "season-duel",
      secret,
      now: () => issuedAt,
      expiresAt: new Date(issuedAt + 60_000),
    });
    const parts = token.split(".");
    parts[3] = `${parts[3]![0] === "A" ? "B" : "A"}${parts[3]!.slice(1)}`;
    expect(() => openArenaInvitation({ token: parts.join("."), secret })).toThrow("ARENA_INVITATION_TOKEN_INVALID");
    expect(() => openArenaInvitation({ token, secret: `${secret}-wrong` })).toThrow("ARENA_INVITATION_TOKEN_INVALID");
    expect(() => openArenaInvitation({ token, secret, now: () => issuedAt + 60_001 })).toThrow("ARENA_INVITATION_TOKEN_EXPIRED");
    expect(() => sealArenaInvitation({
      projectId: "project-private",
      seasonId: "season-duel",
      secret,
      now: () => issuedAt,
      expiresAt: new Date(issuedAt + 8 * 24 * 60 * 60_000),
    })).toThrow("ARENA_INVITATION_INPUT_INVALID");
  });
});
