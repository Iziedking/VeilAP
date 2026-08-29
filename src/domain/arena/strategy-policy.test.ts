import { describe, expect, it } from "vitest";

import {
  compileStrategyPolicy,
  parseStrategyPolicy,
  strategyArtifactCommitment,
} from "@/domain/arena/strategy-policy";

const policy = {
  schemaVersion: 1 as const,
  displayName: "Pressure Test",
  rules: [
    { minHoleRankTotal: 22, action: "raise" as const },
    { maxToCallMinor: 0, action: "check" as const },
  ],
  fallbackAction: "fold" as const,
};

describe("strategy policy boundary", () => {
  it("accepts only the constrained versioned policy shape", () => {
    expect(parseStrategyPolicy(policy)).toEqual(policy);
    expect(() => parseStrategyPolicy({ ...policy, source: "return process.env" })).toThrow("STRATEGY_POLICY_INVALID");
    expect(() => parseStrategyPolicy({ ...policy, rules: [{ action: "call" }] })).toThrow("STRATEGY_POLICY_INVALID");
  });

  it("commits canonically and always returns a legal action", () => {
    const parsed = parseStrategyPolicy(policy);
    expect(strategyArtifactCommitment(parsed)).toHaveLength(64);
    const compiled = compileStrategyPolicy(parsed);
    const action = compiled({
      agentId: "NIGHTJAR",
      board: [],
      handNumber: 1,
      holeCards: [{ rank: 14, suit: "spades" }, { rank: 12, suit: "hearts" }],
      legalActions: ["fold", "call"],
      matchSeed: "test",
      opponentId: "CINDER",
      potMinor: 20,
      position: "button",
      toCallMinor: 10,
    });
    expect(action).toBe("call");
  });
});
