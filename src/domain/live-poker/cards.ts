import { commitment } from "@/domain/canonical";
import type { Card, HandCategory, LiveDeal, Rank, Suit } from "./live-poker-types";

const suits: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const ranks: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const categoryRank = {
  high_card: 0,
  pair: 1,
  two_pair: 2,
  three_kind: 3,
  straight: 4,
  flush: 5,
  full_house: 6,
  four_kind: 7,
  straight_flush: 8,
} as const;

function createDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
}

function randomWord(seed: string, counter: number): number {
  return Number.parseInt(commitment({ domain: "veil:live-deal:v1", counter, seed }).slice(0, 8), 16) >>> 0;
}

function shuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomWord(seed, result.length - index) % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function createDeal(seed: string, playerIds: readonly string[]): LiveDeal {
  if (!seed || playerIds.length < 2 || new Set(playerIds).size !== playerIds.length) throw new Error("LIVE_DEAL_INPUT_INVALID");
  const deck = shuffle(createDeck(), seed);
  const holeCards: Record<string, readonly [Card, Card]> = {};
  let cursor = 0;
  for (const playerId of playerIds) {
    holeCards[playerId] = [deck[cursor]!, deck[cursor + 1]!];
    cursor += 2;
  }
  return { holeCards, board: [deck[cursor]!, deck[cursor + 1]!, deck[cursor + 2]!, deck[cursor + 3]!, deck[cursor + 4]!] };
}

function chooseFive<T>(items: readonly T[]): T[][] {
  const combinations: T[][] = [];
  for (let a = 0; a < items.length - 4; a += 1) {
    for (let b = a + 1; b < items.length - 3; b += 1) {
      for (let c = b + 1; c < items.length - 2; c += 1) {
        for (let d = c + 1; d < items.length - 1; d += 1) {
          for (let e = d + 1; e < items.length; e += 1) combinations.push([items[a]!, items[b]!, items[c]!, items[d]!, items[e]!]);
        }
      }
    }
  }
  return combinations;
}

function straightHigh(cardRanks: readonly number[]): number | null {
  const unique = [...new Set(cardRanks)].sort((left, right) => right - left);
  if (unique.includes(14) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) return 5;
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const window = unique.slice(index, index + 5);
    if (window[0]! - window[4]! === 4) return window[0]!;
  }
  return null;
}

export function compareHandCategories(left: HandCategory, right: HandCategory): number {
  if (left.rank !== right.rank) return left.rank - right.rank;
  const length = Math.max(left.tiebreak.length, right.tiebreak.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.tiebreak[index] ?? 0) - (right.tiebreak[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function evaluateFive(cards: readonly Card[]): HandCategory {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straight = straightHigh(cards.map((card) => card.rank));
  if (flush && straight !== null) return { name: "straight_flush", rank: categoryRank.straight_flush, tiebreak: [straight] };
  if (groups[0]?.[1] === 4) return { name: "four_kind", rank: categoryRank.four_kind, tiebreak: [groups[0][0], groups[1]![0]] };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return { name: "full_house", rank: categoryRank.full_house, tiebreak: [groups[0][0], groups[1][0]] };
  if (flush) return { name: "flush", rank: categoryRank.flush, tiebreak: cards.map((card) => card.rank).sort((left, right) => right - left) };
  if (straight !== null) return { name: "straight", rank: categoryRank.straight, tiebreak: [straight] };
  if (groups[0]?.[1] === 3) return { name: "three_kind", rank: categoryRank.three_kind, tiebreak: [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((left, right) => right - left)] };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return { name: "two_pair", rank: categoryRank.two_pair, tiebreak: [groups[0][0], groups[1][0], groups[2]![0]] };
  if (groups[0]?.[1] === 2) return { name: "pair", rank: categoryRank.pair, tiebreak: [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((left, right) => right - left)] };
  return { name: "high_card", rank: categoryRank.high_card, tiebreak: cards.map((card) => card.rank).sort((left, right) => right - left) };
}

export function evaluateHand(cards: readonly Card[]): HandCategory {
  if (cards.length < 5) throw new Error("LIVE_HAND_REQUIRES_FIVE_CARDS");
  return chooseFive(cards).reduce((best, current) => {
    const candidate = evaluateFive(current);
    return compareHandCategories(candidate, best) > 0 ? candidate : best;
  }, evaluateFive(cards.slice(0, 5)));
}
