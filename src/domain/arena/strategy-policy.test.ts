import { describe, expect, it } from "vitest";

import {
  agentPackageCommitment,
  compileAgentPackage,
  compileStrategyPolicy,
  parseAgentPackage,
  parseStrategyPolicy,
  strategyArtifactCommitment,
} from "@/domain/arena/strategy-policy";
import { ARENA_ENGINE_VERSION } from "@/domain/arena/poker-engine";

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

  it("accepts a coding-agent package and evaluates richer deterministic rules", () => {
    const packageInput = {
      protocolVersion: "veil-agent.v1" as const,
      engineVersion: ARENA_ENGINE_VERSION,
      agentId: "NIGHTJAR_01",
      displayName: "Nightjar",
      policy: {
        rules: [
          {
            when: {
              handCategories: ["flush", "full_house", "four_kind", "straight_flush"] as const,
              position: "button" as const,
            },
            action: "raise" as const,
          },
          {
            when: { pocketPair: true },
            action: "call" as const,
          },
        ],
        fallbackAction: "fold" as const,
      },
    };
    const parsed = parseAgentPackage(packageInput);
    expect(agentPackageCommitment(parsed)).toHaveLength(64);
    const agent = compileAgentPackage(parsed);
    expect(agent.id).toBe("NIGHTJAR_01");
    expect(agent.policy({
      agentId: "NIGHTJAR_01",
      board: [
        { rank: 2, suit: "spades" },
        { rank: 5, suit: "spades" },
        { rank: 8, suit: "spades" },
        { rank: 10, suit: "diamonds" },
        { rank: 11, suit: "clubs" },
      ],
      handNumber: 3,
      holeCards: [{ rank: 14, suit: "spades" }, { rank: 12, suit: "spades" }],
      legalActions: ["fold", "call", "raise"],
      matchSeed: "never-exposed-to-package-rules",
      opponentId: "CINDER",
      potMinor: 100,
      position: "button",
      toCallMinor: 10,
    })).toBe("raise");
  });

  it("rejects executable code, unknown fields and invalid cadence rules", () => {
    const base = {
      protocolVersion: "veil-agent.v1",
      engineVersion: ARENA_ENGINE_VERSION,
      agentId: "NIGHTJAR_01",
      displayName: "Nightjar",
      policy: {
        rules: [{ when: { pocketPair: true }, action: "raise" }],
        fallbackAction: "fold",
      },
    };
    expect(() => parseAgentPackage({ ...base, source: "process.env.SECRET" })).toThrow("AGENT_PACKAGE_INVALID");
    expect(() => parseAgentPackage({
      ...base,
      policy: {
        ...base.policy,
        rules: [{ when: { handNumberModulo: { divisor: 3, remainder: 3 } }, action: "call" }],
      },
    })).toThrow("AGENT_PACKAGE_INVALID");
  });
});
