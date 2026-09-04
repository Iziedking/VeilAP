import { describe, it, expect } from "vitest";
import { runMatch } from "./poker-engine";
import { replayScore, seasonStandings, matchWinner } from "./scoring";
const engineVersion = "holdem-sealed-v0.3";
describe("shared scoring", () => {
  it("accumulates every historical v0.3 delta and equals the engine at completion", () => {
    const run = runMatch({ agents: [{ id: "LEFT", artifactCommitment: "a", policy: () => "raise" }, { id: "RIGHT", artifactCommitment: "b", policy: () => "call" }], hands: 2, matchId: "audit-receipt", seed: "audit-seed", receiptVersion: 1 });
    if (!run.ok) throw new Error(run.code);
    const expected = { LEFT: 0, RIGHT: 0 };
    run.value.hands.forEach((hand, index) => {
      expected.LEFT += hand.scoreDelta.LEFT;
      expected.RIGHT += hand.scoreDelta.RIGHT;
      expect(replayScore(run.value.publicReceipt, run.value.publicHandReceipts, index)).toEqual(expected);
    });
    expect(expected).toEqual(run.value.score);
  });
  it("uses legacy winner-count scoring only for v0.2 and keeps v2 intermediates private", () => {
    const receipts = [{ winner: "LEFT" }, { winner: "tie" }];
    expect(replayScore({ engineVersion: "holdem-sealed-v0.2", score: { LEFT: 1, RIGHT: 0 } }, receipts, 0)).toEqual({ LEFT: 1, RIGHT: 0 });
    expect(replayScore({ engineVersion, receiptVersion: 2, score: { LEFT: -4, RIGHT: 2 } }, receipts, 0)).toBeNull();
    expect(replayScore({ engineVersion, receiptVersion: 2, score: { LEFT: -4, RIGHT: 2 } }, receipts, 1)).toEqual({ LEFT: -4, RIGHT: 2 });
  });
  it("awards one point per tie, three per win, and does not invent an overall winner", () => {
    const rows = seasonStandings([{ engineVersion, score: { LEFT: 3, RIGHT: -1 } }, { engineVersion, score: { LEFT: 1, RIGHT: 1 } }]);
    expect(rows[0]).toMatchObject({ agentId: "LEFT", points: 4, wins: 1, ties: 1 });
    expect(rows[1]).toMatchObject({ agentId: "RIGHT", points: 1, losses: 1, ties: 1 });
    const tied = seasonStandings([{ engineVersion, score: { LEFT: 1, RIGHT: 0 } }, { engineVersion, score: { LEFT: 0, RIGHT: 1 } }]);
    expect(tied[0].points).toBe(tied[1].points);
    expect(() => matchWinner({ LEFT: NaN, RIGHT: 1 })).toThrow("SCORE_INVALID");
  });
});
