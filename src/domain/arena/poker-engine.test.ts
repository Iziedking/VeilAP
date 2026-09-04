import { describe, expect, it } from "vitest";

import { commitment } from "@/domain/canonical";
import {
  ARENA_ENGINE_VERSION,
  LEGACY_ARENA_ENGINE_VERSION,
  createDeal,
  estimateShowdownEquityPermille,
  evaluateHand,
  legalActions,
  runMatch,
  transcriptProof,
  verifyTranscriptProof,
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

  it("creates inclusion proofs for every public transcript leaf", () => {
    const result = runMatch({
      agents: [
        { artifactCommitment: commitment("agent-a"), id: "A", policy: callPolicy },
        { artifactCommitment: commitment("agent-b"), id: "B", policy: raisePolicy },
      ],
      hands: 3,
      matchId: "M-PROOF",
      seed: "fixed-seed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected match to run.");
    expect(result.value.publicHandReceipts).toHaveLength(6);
    result.value.publicHandReceipts.forEach((receipt, index) => {
      const proof = transcriptProof(result.value.publicHandReceipts, index);
      expect(verifyTranscriptProof(receipt, proof, result.value.publicReceipt.transcriptRoot)).toBe(true);
      expect(JSON.stringify({ receipt, proof })).not.toContain("holeCards");
    });
  });

  it("rejects a transcript leaf when any public receipt field is changed", () => {
    const result = runMatch({
      agents: [
        { artifactCommitment: commitment("agent-a"), id: "A", policy: callPolicy },
        { artifactCommitment: commitment("agent-b"), id: "B", policy: raisePolicy },
      ],
      hands: 2,
      matchId: "M-TAMPER",
      seed: "fixed-seed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected match to run.");

    const receipt = result.value.publicHandReceipts[0]!;
    const proof = transcriptProof(result.value.publicHandReceipts, 0);
    const changedWinner = {
      ...receipt,
      winner: receipt.winner === "tie" ? "A" : "tie",
    } as const;
    const changedActionCommitments = {
      ...receipt,
      actionCommitments: { ...receipt.actionCommitments, A: commitment("changed") },
    };

    expect(verifyTranscriptProof(changedWinner, proof, result.value.publicReceipt.transcriptRoot)).toBe(false);
    expect(verifyTranscriptProof(changedActionCommitments, proof, result.value.publicReceipt.transcriptRoot)).toBe(false);
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

  it("keeps archived v0.2 win-count scoring reproducible", () => {
    const result = runMatch({
      agents: [
        { artifactCommitment: commitment("agent-a"), id: "A", policy: raisePolicy },
        { artifactCommitment: commitment("agent-b"), id: "B", policy: callPolicy },
      ],
      engineVersion: LEGACY_ARENA_ENGINE_VERSION,
      hands: 1,
      matchId: "M-LEGACY",
      seed: "fixed-seed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected match to run.");
    expect(result.value.score).toEqual({ A: 1, B: 1 });
    expect(result.value.publicHandReceipts.every((receipt) => receipt.scoreDelta === undefined)).toBe(true);
  });

  it("makes uncalibrated v0.3 raising lose more than a safe call", () => {
    const result = runMatch({
      agents: [
        { artifactCommitment: commitment("agent-a"), id: "A", policy: raisePolicy },
        { artifactCommitment: commitment("agent-b"), id: "B", policy: callPolicy },
      ],
      engineVersion: ARENA_ENGINE_VERSION,
      hands: 1,
      matchId: "M-CONVICTION",
      receiptVersion: 1, // Historical v0.3 receipts retain their original public deltas.
      seed: "fixed-seed",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected match to run.");
    expect(result.value.score.B).toBeGreaterThan(result.value.score.A);
    expect(result.value.publicHandReceipts.every((receipt) => receipt.scoreDelta !== undefined)).toBe(true);
  });

  it("computes deterministic showdown equity without opponent cards or the match seed", () => {
    const equity = estimateShowdownEquityPermille({
      board: [
        card(14, "hearts"), card(13, "hearts"), card(12, "hearts"), card(11, "hearts"), card(2, "clubs"),
      ],
      holeCards: [card(10, "hearts"), card(3, "diamonds")],
    });
    expect(equity).toBe(1_000);
    expect(estimateShowdownEquityPermille({
      board: [
        card(14, "hearts"), card(13, "hearts"), card(12, "hearts"), card(11, "hearts"), card(2, "clubs"),
      ],
      holeCards: [card(10, "hearts"), card(3, "diamonds")],
    })).toBe(equity);
  });
});
