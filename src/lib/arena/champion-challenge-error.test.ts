import { describe, expect, it } from "vitest";

import { championChallengeErrorMessage } from "./champion-challenge-error";

describe("championChallengeErrorMessage", () => {
  it("explains the failing setup stage and gives a safe reference", () => {
    expect(championChallengeErrorMessage({
      code: "PERSISTENCE_FAILED",
      stage: "project",
      requestId: "request-123",
    })).toBe("We could not finish creating your private arena. The arena could not save the challenge. Reference request-123.");
  });

  it("keeps unknown server codes visible for diagnosis", () => {
    expect(championChallengeErrorMessage({ code: "ARENA_UNKNOWN" })).toContain("The server returned ARENA_UNKNOWN.");
  });
});
