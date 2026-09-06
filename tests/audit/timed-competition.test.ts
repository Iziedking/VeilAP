import { describe, expect, it } from "vitest";

import { arenaMatchStartsAt } from "@/domain/arena/match-schedule";
import {
  buildTournamentSchedule,
  estimateTournamentWorkload,
  resolveTournamentRules,
} from "@/domain/arena/tournament-rules";

const entrants = [
  { agentId: "CINDER", joinedAt: new Date("2026-09-06T10:00:00.000Z") },
  { agentId: "EMBER", joinedAt: new Date("2026-09-06T10:01:00.000Z") },
];

describe("timed competition scheduling", () => {
  it("spreads enough complete rounds across the published window", () => {
    const rules = resolveTournamentRules({ templateId: "friend_challenge", qualificationHands: 400 });
    const startsAt = new Date("2026-09-06T12:00:00.000Z");
    const endsAt = new Date("2026-09-06T13:00:00.000Z");
    const schedule = buildTournamentSchedule({ rules, entries: entrants, startsAt, endsAt });

    expect(rules).toMatchObject({
      templateVersion: 3,
      scheduleMode: "timed_rounds",
      qualificationHands: 400,
      handsPerMatch: 20,
    });
    expect(schedule).toHaveLength(10);
    expect(schedule[0]).toMatchObject({ roundNumber: 1, scheduledFor: startsAt });
    const finalMatch = schedule.at(-1);
    if (!finalMatch?.scheduledFor) throw new Error("TIMED_MATCH_MISSING");
    expect(finalMatch.roundNumber).toBe(10);
    expect(finalMatch.scheduledFor.getTime()).toBeLessThan(endsAt.getTime());
    expect(new Set(schedule.map((match) => match.scheduledFor?.toISOString())).size).toBe(10);

    expect(estimateTournamentWorkload({ rules, entryCount: entrants.length })).toEqual({
      entryCount: 2,
      pairingCount: 10,
      roundCount: 10,
      totalHands: 200,
      decisionsPerAgent: 400,
      qualificationHands: 400,
    });
  });

  it("uses persisted scheduled time for eligibility instead of sequence delay", () => {
    const scheduledFor = new Date("2026-09-06T18:30:00.000Z");
    expect(arenaMatchStartsAt({
      createdAt: new Date("2026-09-06T12:00:00.000Z"),
      sequence: 99,
      scheduledFor,
    })).toEqual(scheduledFor);
  });
});
