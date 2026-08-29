import { describe, expect, it } from "vitest";

import { commitment } from "@/domain/canonical";
import {
  createDeal,
  evaluateHand,
  legalActions,
  runMatch,
  type AgentDefinition,
  type Card,
} from "./poker-engine";

const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

const callPolicy: AgentDefinition["policy"] = () => "call";
const raisePolicy: AgentDefinition["policy"] = () => "raise";

describe("poker engine", () => {
  it("rebuilds the same seeded deal exactly", () => {
    expect(createDeal("season-00", 4)).toEqual(createDeal("season-00", 4));
    expect(createDeal("season-00", 4)).not.toEqual(createDeal("season-00", 5));
  });

  it("uses a Fisher-Yates deal with two private cards and five public cards", () => {
    const deal = createDeal("seed-a", 1);
    expect(deal.leftHole).toHaveLength(2);
    expect(deal.rightHole).toHaveLength(2);
    expect(deal.board).toHaveLength(5);
    expect(new Set([...deal.leftHole, ...deal.rightHole, ...deal.board].map(({ rank, suit }) => `${rank}:${suit}`)).size).toBe(9);
  });

  it("ranks a wheel straight below a six-high straight", () => {
    const wheel = evaluateHand([
      card(14, "clubs"), card(2, "diamonds"), card(3, "hearts"), card(4, "spades"), card(5, "clubs"),
    ]);
    const sixHigh = evaluateHand([
      card(2, "clubs"), card(3, "diamonds"), card(4, "hearts"), card(5, "spades"), card(6, "clubs"),
    ]);
    expect(wheel.name).toBe("straight");
    expect(wheel.tiebreak).toEqual([5]);
    expect(sixHigh.tiebreak).toEqual([6]);
  });

  it("rejects a policy action outside the legal action set", () => {
    const result = runMatch({
      agents: [
        { artifactCommitment: commitment("agent-a"), id: "A", policy: () => "invalid" as never },
        { artifactCommitment: commitment("agent-b"), id: "B", policy: callPolicy },
      ],
      hands: 1,
      matchId: "M-001",
      seed: "fixed-seed",
    });
    expect(result).toEqual({ ok: false, code: "ILLEGAL_AGENT_ACTION", agentId: "A", handNumber: 1 });
  });

  it("runs duplicate deals with the seats reversed", () => {
    const result = runMatch({
      agents: [
        { artifactCommitment: commitment("agent-a"), id: "A", policy: callPolicy },
        { artifactCommitment: commitment("agent-b"), id: "B", policy: raisePolicy },
      ],
      hands: 3,
      matchId: "M-002",
      seed: "fixed-seed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected match to run.");
    expect(result.value.hands).toHaveLength(6);
    expect(result.value.hands.filter((hand) => hand.seatSwapped)).toHaveLength(3);
    expect(result.value.hands[0].board).toEqual(result.value.hands[1].board);
    expect(result.value.hands[0].outcomes[0]?.agentId).toBe("A");
    expect(result.value.hands[1].outcomes[0]?.agentId).toBe("A");
    expect(result.value.publicReceipt.transcriptRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and keeps private cards out of the public receipt", () => {
    const input = {
      agents: [
        { artifactCommitment: commitment("agent-a"), id: "A", policy: callPolicy },
        { artifactCommitment: commitment("agent-b"), id: "B", policy: callPolicy },
      ] as const,
      hands: 2,
      matchId: "M-003",
      seed: "fixed-seed",
    };
    const first = runMatch(input);
    const second = runMatch(input);
    expect(first).toEqual(second);
    if (!first.ok) throw new Error("Expected match to run.");
    expect(JSON.stringify(first.value.publicReceipt)).not.toContain("holeCards");
    expect(first.value.publicReceipt.artifactCommitments).toEqual({
      A: commitment("agent-a"),
      B: commitment("agent-b"),
    });
  });

  it("makes the call boundary explicit", () => {
    expect(legalActions(0)).toEqual(["check", "raise", "fold"]);
    expect(legalActions(10)).toEqual(["call", "raise", "fold"]);
  });
});
