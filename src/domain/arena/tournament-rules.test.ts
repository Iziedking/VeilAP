import { describe, expect, it } from "vitest";

import {
  buildTournamentSchedule,
  estimateTournamentWorkload,
  resolveTournamentRules,
  tournamentRulesCommitment,
} from "@/domain/arena/tournament-rules";

const entries = [
  { agentId: "NIGHTJAR", joinedAt: new Date("2026-08-31T10:00:00.000Z") },
  { agentId: "CINDER", joinedAt: new Date("2026-08-31T10:01:00.000Z") },
  { agentId: "ORBIT", joinedAt: new Date("2026-08-31T10:02:00.000Z") },
  { agentId: "VAULT", joinedAt: new Date("2026-08-31T10:03:00.000Z") },
];

describe("tournament rules", () => {
  it("resolves immutable privacy rules for every preset", () => {
    for (const templateId of ["playground", "open_league", "duel_series", "benchmark_gauntlet", "championship"] as const) {
      const rules = resolveTournamentRules({ templateId });
      expect(rules.strategyVisibility).toBe("sealed");
      expect(rules.revealPolicy).toBe("loser_action_only");
      expect(tournamentRulesCommitment(rules)).toHaveLength(64);
    }
  });

  it("builds a deterministic round robin and estimates its exact workload", () => {
    const rules = resolveTournamentRules({ templateId: "open_league" });
    const schedule = buildTournamentSchedule({ rules, entries });
    expect(schedule).toHaveLength(6);
    expect(schedule[0]).toEqual({ sequence: 1, leftAgentId: "NIGHTJAR", rightAgentId: "CINDER", hands: 12 });
    expect(estimateTournamentWorkload({ rules, entryCount: 4 })).toEqual({
      entryCount: 4,
      pairingCount: 6,
      totalHands: 72,
    });
  });

  it("runs a three-match duel without exposing either policy", () => {
    const rules = resolveTournamentRules({ templateId: "duel_series" });
    const schedule = buildTournamentSchedule({ rules, entries: entries.slice(0, 2) });
    expect(schedule.map((match) => [match.leftAgentId, match.rightAgentId])).toEqual([
      ["NIGHTJAR", "CINDER"],
      ["CINDER", "NIGHTJAR"],
      ["NIGHTJAR", "CINDER"],
    ]);
  });

  it("requires an enrolled benchmark for a gauntlet", () => {
    const rules = resolveTournamentRules({ templateId: "benchmark_gauntlet" });
    expect(() => buildTournamentSchedule({ rules, entries })).toThrow("TOURNAMENT_BENCHMARK_REQUIRED");
    const schedule = buildTournamentSchedule({ rules, entries, benchmarkAgentId: "ORBIT" });
    expect(schedule).toHaveLength(3);
    expect(schedule.every((match) => match.leftAgentId === "ORBIT")).toBe(true);
  });

  it("lets custom tournaments compose only audited primitives", () => {
    const rules = resolveTournamentRules({
      templateId: "custom",
      custom: {
        pairingMode: "round_robin",
        entryMode: "open",
        maxEntries: 6,
        handsPerMatch: 20,
        encountersPerPair: 2,
        resubmissionPolicy: "replace_until_lock",
        rewardPolicy: "optional",
      },
    });
    expect(rules.templateId).toBe("custom");
    expect(estimateTournamentWorkload({ rules, entryCount: 4 })).toEqual({
      entryCount: 4,
      pairingCount: 12,
      totalHands: 240,
    });
  });

  it("rejects invalid custom limits and duplicate agents", () => {
    expect(() => resolveTournamentRules({
      templateId: "custom",
      custom: {
        pairingMode: "round_robin",
        entryMode: "open",
        maxEntries: 33,
        handsPerMatch: 10,
        encountersPerPair: 1,
        resubmissionPolicy: "fixed",
        rewardPolicy: "optional",
      },
    })).toThrow("TOURNAMENT_RULES_INVALID");

    expect(() => resolveTournamentRules({
      templateId: "custom",
      custom: {
        pairingMode: "round_robin",
        entryMode: "invite_only",
        maxEntries: 8,
        handsPerMatch: 10,
        encountersPerPair: 1,
        resubmissionPolicy: "replace_until_lock",
        rewardPolicy: "optional",
      },
    })).toThrow("TOURNAMENT_RULES_INVALID");

    const rules = resolveTournamentRules({ templateId: "playground" });
    expect(() => buildTournamentSchedule({
      rules,
      entries: [entries[0], { ...entries[1], agentId: entries[0].agentId }],
    })).toThrow("TOURNAMENT_ENTRY_INVALID");
  });
});
