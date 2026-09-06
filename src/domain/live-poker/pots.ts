import { commitment } from "@/domain/canonical";
import { compareHandCategories, evaluateHand } from "./cards";
import type { Card, LivePlayerState, LivePot } from "./live-poker-types";

export type PotAward = Readonly<{
  potId: string;
  amountMinor: number;
  winnerPlayerIds: readonly string[];
  awards: Readonly<Record<string, number>>;
}>;

export function buildPots(players: readonly LivePlayerState[]): readonly LivePot[] {
  const levels = [...new Set(players.map((player) => player.committedTotalMinor))].filter((level) => level > 0).sort((left, right) => left - right);
  const pots: LivePot[] = [];
  let previousLevel = 0;
  for (const level of levels) {
    const contributors = players.filter((player) => player.committedTotalMinor >= level);
    const amountMinor = (level - previousLevel) * contributors.length;
    if (amountMinor <= 0) continue;
    const eligiblePlayerIds = contributors.filter((player) => player.status !== "folded").map((player) => player.playerId);
    if (eligiblePlayerIds.length === 0) throw new Error("LIVE_POT_HAS_NO_ELIGIBLE_PLAYER");
    pots.push({ id: commitment({ domain: "veil:live-pot:v1", level, playerIds: contributors.map((player) => player.playerId) }), capMinor: level, amountMinor, eligiblePlayerIds });
    previousLevel = level;
  }
  return pots;
}

function clockwiseSeats(players: readonly LivePlayerState[], buttonSeat: number): readonly string[] {
  return [...players].sort((left, right) => {
    const leftDistance = (left.seat - buttonSeat + players.length) % players.length;
    const rightDistance = (right.seat - buttonSeat + players.length) % players.length;
    return leftDistance - rightDistance;
  }).map((player) => player.playerId);
}

export function settlePots(input: Readonly<{ players: readonly LivePlayerState[]; board: readonly Card[]; buttonSeat: number }>): readonly PotAward[] {
  if (input.board.length !== 5) throw new Error("LIVE_SHOWDOWN_REQUIRES_BOARD");
  const pots = buildPots(input.players);
  const order = clockwiseSeats(input.players, input.buttonSeat);
  return pots.map((pot) => {
    const eligible = input.players.filter((player) => pot.eligiblePlayerIds.includes(player.playerId));
    const best = eligible[0];
    if (!best) throw new Error("LIVE_POT_HAS_NO_ELIGIBLE_PLAYER");
    let winners = [best.playerId];
    let bestCategory = evaluateHand([...best.holeCards, ...input.board]);
    for (const player of eligible.slice(1)) {
      const playerCategory = evaluateHand([...player.holeCards, ...input.board]);
      const comparison = compareHandCategories(playerCategory, bestCategory);
      if (comparison > 0) {
        bestCategory = playerCategory;
        winners = [player.playerId];
      } else if (comparison === 0) {
        winners = [...winners, player.playerId];
      }
    }
    const baseAward = Math.floor(pot.amountMinor / winners.length);
    let remainder = pot.amountMinor - baseAward * winners.length;
    const awards: Record<string, number> = {};
    for (const winnerId of winners) awards[winnerId] = baseAward;
    for (const playerId of order) {
      if (remainder === 0) break;
      if (winners.includes(playerId)) {
        awards[playerId] = (awards[playerId] ?? 0) + 1;
        remainder -= 1;
      }
    }
    return { potId: pot.id, amountMinor: pot.amountMinor, winnerPlayerIds: winners, awards };
  });
}
