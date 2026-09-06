import { describe, expect, it } from "vitest";

import {
  parseTournamentRules,
  buildTournamentSchedule,
  estimateTournamentWorkload,
  resolveTournamentRules,
  tournamentRulesCommitment,
  type TournamentRules,
} from "@/domain/arena/tournament-rules";

const entries = [
  { agentId: "NIGHTJAR", joinedAt: new Date("2026-08-31T10:00:00.000Z") },
  { agentId: "CINDER", joinedAt: new Date("2026-08-31T10:01:00.000Z") },
  { agentId: "ORBIT", joinedAt: new Date("2026-08-31T10:02:00.000Z") },
  { agentId: "VAULT", joinedAt: new Date("2026-08-31T10:03:00.000Z") },
];

function asLegacyV2(rules: TournamentRules, overrides: Partial<TournamentRules> = {}): TournamentRules {
  const legacy = { ...rules, ...overrides, templateVersion: 2 as const };
  delete legacy.scheduleMode;
  delete legacy.qualificationHands;
  return legacy;
}

describe("tournament rules", () => {
  it("preserves version 1 and 2 commitments while requiring the versioned fields", () => {
    const rules = resolveTournamentRules({ templateId: "playground" });
    expect(rules).toMatchObject({
      templateVersion: 3,
      duplicateStrategyPolicy: "reject_exact",
      scheduleMode: "timed_rounds",
      qualificationHands: 500,
    });
    const versionTwo = asLegacyV2(rules);
    expect(parseTournamentRules(versionTwo)).toEqual(versionTwo);
    expect(tournamentRulesCommitment(parseTournamentRules(versionTwo))).toBe(tournamentRulesCommitment(versionTwo));
    const old = { ...versionTwo, templateVersion: 1 as const };
    delete old.duplicateStrategyPolicy;
    expect(parseTournamentRules(old)).toEqual(old);
    expect(tournamentRulesCommitment(parseTournamentRules(old))).toBe(tournamentRulesCommitment(old));
    expect(parseTournamentRules(old)).not.toHaveProperty("duplicateStrategyPolicy");
    const incomplete = { ...versionTwo };
    delete incomplete.duplicateStrategyPolicy;
    expect(() => parseTournamentRules(incomplete)).toThrow("TOURNAMENT_RULES_INVALID");
    const incompleteTimed = { ...rules };
    delete incompleteTimed.qualificationHands;
    expect(() => parseTournamentRules(incompleteTimed)).toThrow("TOURNAMENT_RULES_INVALID");
  });

  it("resolves immutable privacy rules for every preset", () => {
    for (const templateId of ["friend_challenge", "champion_challenge", "playground", "open_league", "sponsored_open", "duel_series", "benchmark_gauntlet", "championship"] as const) {
      const rules = resolveTournamentRules({ templateId });
      expect(rules.strategyVisibility).toBe("sealed");
      expect(rules.revealPolicy).toBe("loser_action_only");
      expect(tournamentRulesCommitment(rules)).toHaveLength(64);
    }
  });

  it("builds a deterministic round robin and estimates its exact workload", () => {
    const rules = asLegacyV2(resolveTournamentRules({ templateId: "open_league" }), { handsPerMatch: 12 });
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
    const rules = asLegacyV2(resolveTournamentRules({ templateId: "duel_series" }), { encountersPerPair: 3 });
    const schedule = buildTournamentSchedule({ rules, entries: entries.slice(0, 2) });
    expect(schedule.map((match) => [match.leftAgentId, match.rightAgentId])).toEqual([
      ["NIGHTJAR", "CINDER"],
      ["CINDER", "NIGHTJAR"],
      ["NIGHTJAR", "CINDER"],
    ]);
  });

  it("keeps friend challenges private and fixed after entry", () => {
    const rules = resolveTournamentRules({ templateId: "friend_challenge" });
    expect(rules).toMatchObject({
      pairingMode: "duel_series",
      entryMode: "invite_only",
      minEntries: 2,
      maxEntries: 2,
      resubmissionPolicy: "fixed",
      rewardPolicy: "optional",
    });
  });

  it("builds the champion challenge as a timed private benchmark", () => {
    expect(resolveTournamentRules({ templateId: "champion_challenge" })).toMatchObject({
      entryMode: "invite_only",
      pairingMode: "duel_series",
      minEntries: 2,
      maxEntries: 2,
      encountersPerPair: 1,
      handsPerMatch: 20,
      scheduleMode: "timed_rounds",
      qualificationHands: 1_000,
      rewardPolicy: "optional",
    });
  });

  it("opens sponsored competitions publicly but requires funding before play", () => {
    expect(resolveTournamentRules({ templateId: "sponsored_open" })).toMatchObject({
      entryMode: "open",
      rewardPolicy: "funded_before_start",
      maxEntries: 16,
    });
  });

  it("requires an enrolled benchmark for a gauntlet", () => {
    const rules = asLegacyV2(resolveTournamentRules({ templateId: "benchmark_gauntlet" }));
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
      pairingCount: 54,
      totalHands: 1_080,
      roundCount: 9,
      decisionsPerAgent: 1_080,
      qualificationHands: 1_000,
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
