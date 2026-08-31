import { describe, expect, it } from "vitest";

import { compileAgentPackage } from "@/domain/arena/strategy-policy";
import {
  VEIL_ARENA_CHAMPION,
  VEIL_ARENA_CHAMPION_AGENT_ID,
} from "@/domain/arena/veil-arena-champion";

describe("Veil Arena Champion", () => {
  it("is a valid deterministic agent package", () => {
    const compiled = compileAgentPackage(VEIL_ARENA_CHAMPION);
    expect(compiled.id).toBe(VEIL_ARENA_CHAMPION_AGENT_ID);
    expect(compiled.artifactCommitment).toHaveLength(64);
  });
});
