import { describe, expect, it } from "vitest";

import { createDeal } from "./cards";
import { buildPots } from "./pots";
import { createInitialHand, legalActions } from "./rules";
import { applyCommand } from "./reducer";
import { LIVE_POKER_ENGINE_VERSION, type LiveHoldemRules, type LivePlayerState } from "./live-poker-types";

const rules: LiveHoldemRules = { engineVersion: LIVE_POKER_ENGINE_VERSION, playerCountMin: 2, playerCountMax: 6, smallBlindMinor: 5, bigBlindMinor: 10, anteMinor: 0, startingStackMinor: 100, turnTimeoutMs: 10_000, timeoutAction: "check_then_fold", oddChipOrder: "button_left_clockwise" };

function playersForPots(overrides: Partial<LivePlayerState>[]): LivePlayerState[] {
  const deal = createDeal("pot-test", ["P1", "P2", "P3"]);
  return overrides.map((override, index) => ({ playerId: `P${index + 1}`, seat: index, stackMinor: 0, committedTotalMinor: 0, committedStreetMinor: 0, status: "active", holeCards: deal.holeCards[`P${index + 1}`]!, ...override }));
}

describe("live poker rules core", () => {
  it("creates a deterministic multi-player deal without duplicate cards", () => {
    const first = createDeal("live-seed", ["A", "B", "C"]);
    expect(first).toEqual(createDeal("live-seed", ["A", "B", "C"]));
    expect(new Set([...first.board, ...Object.values(first.holeCards).flat()].map((card) => `${card.rank}:${card.suit}`)).size).toBe(11);
  });

  it("posts blinds, sets the preflop actor, and exposes only legal actions", () => {
    const deal = createDeal("hand-seed", ["A", "B"]);
    const state = createInitialHand({ rules, handId: "H-1", players: [{ playerId: "A", seat: 0, holeCards: deal.holeCards.A! }, { playerId: "B", seat: 1, holeCards: deal.holeCards.B! }], buttonSeat: 0, deal, startedAt: new Date("2026-09-06T20:00:00.000Z") });
    expect(state.actorPlayerId).toBe("A");
    expect(state.currentBetMinor).toBe(10);
    expect(state.players.find((player) => player.playerId === "B")?.committedStreetMinor).toBe(10);
    expect(state.players.find((player) => player.playerId === "A")?.committedStreetMinor).toBe(5);
    expect(legalActions(state, "A")).toEqual(["fold", "call", "raise", "all_in"]);
  });

  it("rejects an under-sized non-all-in raise", () => {
    const deal = createDeal("raise-seed", ["A", "B"]);
    const state = createInitialHand({ rules, handId: "H-2", players: [{ playerId: "A", seat: 0, holeCards: deal.holeCards.A! }, { playerId: "B", seat: 1, holeCards: deal.holeCards.B! }], buttonSeat: 0, deal, startedAt: new Date("2026-09-06T20:00:00.000Z") });
    expect(applyCommand(state, { type: "act", commandId: "C-1", expectedVersion: 0, playerId: "A", turnId: state.turnId, action: "raise", amountMinor: 15 }, rules, new Date("2026-09-06T20:00:01.000Z"))).toEqual({ ok: false, code: "AMOUNT_INVALID" });
  });

  it("conserves chips across main and side pots", () => {
    const players = playersForPots([{ committedTotalMinor: 100, status: "all_in" }, { committedTotalMinor: 250, status: "active" }, { committedTotalMinor: 250, status: "folded" }]);
    const pots = buildPots(players);
    expect(pots.map((pot) => pot.amountMinor)).toEqual([300, 300]);
    expect(pots[0]?.eligiblePlayerIds).toEqual(["P1", "P2"]);
    expect(pots[1]?.eligiblePlayerIds).toEqual(["P2"]);
    expect(pots.reduce((sum, pot) => sum + pot.amountMinor, 0)).toBe(600);
  });

  it("accepts exactly one timeout path and records the timeout event", () => {
    const deal = createDeal("timeout-seed", ["A", "B"]);
    const state = createInitialHand({ rules, handId: "H-3", players: [{ playerId: "A", seat: 0, holeCards: deal.holeCards.A! }, { playerId: "B", seat: 1, holeCards: deal.holeCards.B! }], buttonSeat: 0, deal, startedAt: new Date("2026-09-06T20:00:00.000Z") });
    const result = applyCommand(state, { type: "timeout", commandId: "TIMEOUT-1", expectedVersion: 0, playerId: "A", turnId: state.turnId, now: "2026-09-06T20:00:11.000Z" }, rules, new Date("2026-09-06T20:00:11.000Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected timeout to be accepted.");
    expect(result.events[0]).toMatchObject({ type: "turn_timed_out", playerId: "A" });
    expect(result.events.some((event) => event.type === "action_accepted")).toBe(true);
  });

  it("rejects a client action after the persisted deadline", () => {
    const deal = createDeal("deadline-seed", ["A", "B"]);
    const state = createInitialHand({ rules, handId: "H-4", players: [{ playerId: "A", seat: 0, holeCards: deal.holeCards.A! }, { playerId: "B", seat: 1, holeCards: deal.holeCards.B! }], buttonSeat: 0, deal, startedAt: new Date("2026-09-06T20:00:00.000Z") });
    expect(applyCommand(state, { type: "act", commandId: "LATE-1", expectedVersion: 0, playerId: "A", turnId: state.turnId, action: "fold" }, rules, new Date("2026-09-06T20:00:10.000Z"))).toEqual({ ok: false, code: "TURN_EXPIRED" });
  });

  it("advances through every street and conserves the starting stack at showdown", () => {
    const deal = createDeal("streets-seed", ["A", "B"]);
    let state = createInitialHand({ rules, handId: "H-5", players: [{ playerId: "A", seat: 0, holeCards: deal.holeCards.A! }, { playerId: "B", seat: 1, holeCards: deal.holeCards.B! }], buttonSeat: 0, deal, startedAt: new Date("2026-09-06T20:00:00.000Z") });
    const act = (playerId: string, action: "call" | "check") => {
      const result = applyCommand(state, { type: "act", commandId: `${state.version + 1}-${playerId}`, expectedVersion: state.version, playerId, turnId: state.turnId, action }, rules, new Date("2026-09-06T20:00:01.000Z"));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Expected ${action} to be accepted.`);
      state = result.state;
    };
    act("A", "call");
    act("B", "check");
    expect(state.phase).toBe("flop");
    expect(state.board).toHaveLength(3);
    act("A", "check");
    act("B", "check");
    expect(state.phase).toBe("turn");
    expect(state.board).toHaveLength(4);
    act("A", "check");
    act("B", "check");
    expect(state.phase).toBe("river");
    expect(state.board).toHaveLength(5);
    act("A", "check");
    act("B", "check");
    expect(state.phase).toBe("showdown");
    const result = applyCommand(state, { type: "showdown", commandId: "SHOWDOWN-1", expectedVersion: state.version }, rules, new Date("2026-09-06T20:00:02.000Z"));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected showdown to be accepted.");
    expect(result.state.phase).toBe("complete");
    expect(result.state.players.reduce((sum, player) => sum + player.stackMinor, 0)).toBe(200);
    expect(result.events.some((event) => event.type === "hand_completed")).toBe(true);
  });
});
