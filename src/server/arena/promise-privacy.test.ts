import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { commitment } from "@/domain/canonical";
import { runMatch, actionNonce, privateActionCommitment } from "@/domain/arena/poker-engine";

describe("receipt disclosure boundaries", () => {
  it("blocks individual and combined action enumeration and omits action-revealing deltas", () => {
    const seed = randomBytes(32).toString("hex");
    const input = { agents: [{ id: "A", artifactCommitment: "a", policy: () => "raise" as const }, { id: "B", artifactCommitment: "b", policy: () => "call" as const }] as const, hands: 2, matchId: "privacy", seed };
    const result = runMatch(input);
    expect(result.ok).toBe(true); if (!result.ok) return;
    const guesses = ["fold", "check", "call", "raise"];
    for (const hand of result.value.publicHandReceipts) {
      expect(hand.receiptVersion).toBe(2);
      expect(hand.scoreDelta).toBeUndefined();
      for (const action of guesses) {
        expect(hand.actionCommitments.A).not.toBe(commitment({ agentId: "A", action }));
        for (const other of guesses) expect(hand.actionCommitment).not.toBe(commitment([{ agentId: "A", action }, { agentId: "B", action: other }]));
      }
    }
    const hand = result.value.publicHandReceipts[0]!;
    const nonce = actionNonce(seed, "privacy", 1, false, "A");
    const opening = { nonce, matchId: "privacy", handNumber: 1, seatSwapped: false, agentId: "A", action: "raise" as const };
    expect(privateActionCommitment(opening)).toBe(hand.actionCommitments.A);
    expect(privateActionCommitment({ ...opening, seatSwapped: true })).not.toBe(hand.actionCommitments.A);
    expect(JSON.stringify(result.value.publicHandReceipts)).not.toContain(nonce);
    const legacy = runMatch({ ...input, receiptVersion: 1 });
    expect(legacy.ok).toBe(true); if (!legacy.ok) return;
    expect(legacy.value.score).toEqual(result.value.score);
    expect(legacy.value.publicHandReceipts[0]!.actionCommitments.A).toBe(commitment({ agentId: "A", action: "raise" }));
    expect(runMatch({ ...input, receiptVersion: 1 })).toEqual(legacy);
  });
});
