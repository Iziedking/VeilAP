import { commitment } from "@/domain/canonical";

export const LEGACY_ARENA_ENGINE_VERSION = "holdem-sealed-v0.2" as const;
export const ARENA_ENGINE_VERSION = "holdem-sealed-v0.3" as const;
export const SUPPORTED_ARENA_ENGINE_VERSIONS = [LEGACY_ARENA_ENGINE_VERSION, ARENA_ENGINE_VERSION] as const;
export type ArenaEngineVersion = typeof SUPPORTED_ARENA_ENGINE_VERSIONS[number];

export function isArenaEngineVersion(value: string): value is ArenaEngineVersion {
  return (SUPPORTED_ARENA_ENGINE_VERSIONS as readonly string[]).includes(value);
}

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export type Card = Readonly<{
  rank: Rank;
  suit: Suit;
}>;

export type DecisionAction = "fold" | "check" | "call" | "raise";
export type AgentId = string;

export type DecisionState = Readonly<{
  agentId: AgentId;
  board: readonly Card[];
  handNumber: number;
  holeCards: readonly [Card, Card];
  legalActions: readonly DecisionAction[];
  opponentId: AgentId;
  potMinor: number;
  position: "button" | "big_blind";
  toCallMinor: number;
}>;

export type AgentPolicy = (state: DecisionState) => DecisionAction;

export type AgentDefinition = Readonly<{
  artifactCommitment: string;
  id: AgentId;
  policy: AgentPolicy;
}>;

export type HandOutcome = Readonly<{
  action: DecisionAction;
  agentId: AgentId;
  handNumber: number;
  position: "button" | "big_blind";
  seatSwapped: boolean;
}>;

export type HandResult = Readonly<{
  board: readonly Card[];
  handNumber: number;
  handStrength: Readonly<{
    left: HandCategory;
    right: HandCategory;
  }>;
  outcomes: readonly HandOutcome[];
  scoreDelta: Readonly<Record<AgentId, number>>;
  seatSwapped: boolean;
  winner: AgentId | "tie";
}>;

export type PublicHandReceipt = Readonly<{
  actionCommitment: string;
  actionCommitments: Readonly<Record<AgentId, string>>;
  boardCommitment: string;
  handNumber: number;
  handCommitment: string;
  seatSwapped: boolean;
  scoreDelta?: Readonly<Record<AgentId, number>>;
  winner: AgentId | "tie";
}>;

export type TranscriptProofNode = Readonly<{
  side: "left" | "right";
  sibling: string;
}>;

export type TranscriptProof = readonly TranscriptProofNode[];

type PublicHandReceiptCommitmentInput = Omit<PublicHandReceipt, "handCommitment">;

export type MatchResult = Readonly<{
  engineVersion: string;
  hands: readonly HandResult[];
  matchId: string;
  publicHandReceipts: readonly PublicHandReceipt[];
  publicReceipt: PublicMatchReceipt;
  score: Readonly<Record<AgentId, number>>;
  seedCommitment: string;
}>;

export type PublicMatchReceipt = Readonly<{
  artifactCommitments: Readonly<Record<AgentId, string>>;
  engineVersion: string;
  matchId: string;
  score: Readonly<Record<AgentId, number>>;
  seedCommitment: string;
  transcriptRoot: string;
}>;

export type MatchRunResult =
  | { ok: true; value: MatchResult }
  | { ok: false; code: "AGENT_POLICY_FAILED" | "ILLEGAL_AGENT_ACTION"; agentId: AgentId; handNumber: number };

export type HandCategory = Readonly<{
  name: "flush" | "four_kind" | "full_house" | "high_card" | "pair" | "straight" | "straight_flush" | "three_kind" | "two_pair";
  rank: number;
  tiebreak: readonly number[];
}>;

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
  return Number.parseInt(commitment({ counter, seed }).slice(0, 8), 16) >>> 0;
}

function shuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomWord(seed, result.length - index) % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function chooseFive<T>(items: readonly T[]): T[][] {
  const combinations: T[][] = [];
  for (let a = 0; a < items.length - 4; a += 1) {
    for (let b = a + 1; b < items.length - 3; b += 1) {
      for (let c = b + 1; c < items.length - 2; c += 1) {
        for (let d = c + 1; d < items.length - 1; d += 1) {
          for (let e = d + 1; e < items.length; e += 1) {
            combinations.push([items[a], items[b], items[c], items[d], items[e]]);
          }
        }
      }
    }
  }
  return combinations;
}

function straightHigh(cardRanks: readonly number[]): number | null {
  const unique = [...new Set(cardRanks)].sort((a, b) => b - a);
  if (unique.includes(14) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) {
    return 5;
  }
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const window = unique.slice(index, index + 5);
    if (window[0] - window[4] === 4) return window[0];
  }
  return null;
}

export function compareHandCategories(left: HandCategory, right: HandCategory): number {
  if (left.rank !== right.rank) return left.rank - right.rank;
  const size = Math.max(left.tiebreak.length, right.tiebreak.length);
  for (let index = 0; index < size; index += 1) {
    const difference = (left.tiebreak[index] ?? 0) - (right.tiebreak[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function invokePolicy(
  agent: AgentDefinition,
  state: DecisionState,
): { ok: true; action: DecisionAction } | { ok: false } {
  try {
    return { ok: true, action: agent.policy(state) };
  } catch {
    return { ok: false };
  }
}

function evaluateFive(cards: readonly Card[]): HandCategory {
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straight = straightHigh(cards.map((card) => card.rank));
  if (flush && straight !== null) return { name: "straight_flush", rank: categoryRank.straight_flush, tiebreak: [straight] };
  if (groups[0]?.[1] === 4) return { name: "four_kind", rank: categoryRank.four_kind, tiebreak: [groups[0][0], groups[1][0]] };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return { name: "full_house", rank: categoryRank.full_house, tiebreak: [groups[0][0], groups[1][0]] };
  if (flush) return { name: "flush", rank: categoryRank.flush, tiebreak: cards.map((card) => card.rank).sort((a, b) => b - a) };
  if (straight !== null) return { name: "straight", rank: categoryRank.straight, tiebreak: [straight] };
  if (groups[0]?.[1] === 3) return { name: "three_kind", rank: categoryRank.three_kind, tiebreak: [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)] };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return { name: "two_pair", rank: categoryRank.two_pair, tiebreak: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0]?.[1] === 2) return { name: "pair", rank: categoryRank.pair, tiebreak: [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)] };
  return { name: "high_card", rank: categoryRank.high_card, tiebreak: cards.map((card) => card.rank).sort((a, b) => b - a) };
}

export function evaluateHand(cards: readonly Card[]): HandCategory {
  if (cards.length < 5) throw new Error("POKER_HAND_REQUIRES_FIVE_CARDS");
  return chooseFive(cards).reduce((best, current) => {
    const candidate = evaluateFive(current);
    return compareHandCategories(candidate, best) > 0 ? candidate : best;
  }, evaluateFive(cards.slice(0, 5)));
}

export function legalActions(toCallMinor: number): readonly DecisionAction[] {
  if (!Number.isInteger(toCallMinor) || toCallMinor < 0) throw new Error("POKER_CALL_AMOUNT_INVALID");
  return toCallMinor === 0 ? ["check", "raise", "fold"] : ["call", "raise", "fold"];
}

export function createDeal(matchSeed: string, handNumber: number): Readonly<{
  board: readonly Card[];
  leftHole: readonly [Card, Card];
  rightHole: readonly [Card, Card];
}> {
  if (!matchSeed || !Number.isSafeInteger(handNumber) || handNumber < 1) throw new Error("POKER_DEAL_INPUT_INVALID");
  const deck = shuffle(createDeck(), `${matchSeed}:${handNumber}`);
  return {
    leftHole: [deck[0], deck[1]],
    rightHole: [deck[2], deck[3]],
    board: deck.slice(4, 9),
  };
}

export function estimateShowdownEquityPermille(input: Readonly<{
  board: readonly Card[];
  holeCards: readonly [Card, Card];
}>): number {
  if (input.board.length !== 5) throw new Error("POKER_EQUITY_REQUIRES_COMPLETE_BOARD");
  const visible = new Set([...input.board, ...input.holeCards].map(({ rank, suit }) => `${rank}:${suit}`));
  if (visible.size !== 7) throw new Error("POKER_EQUITY_DUPLICATE_CARD");
  const remaining = createDeck().filter(({ rank, suit }) => !visible.has(`${rank}:${suit}`));
  const ownCategory = evaluateHand([...input.holeCards, ...input.board]);
  let wins = 0;
  let ties = 0;
  let total = 0;
  for (let first = 0; first < remaining.length - 1; first += 1) {
    for (let second = first + 1; second < remaining.length; second += 1) {
      const opponentCategory = evaluateHand([remaining[first]!, remaining[second]!, ...input.board]);
      const comparison = compareHandCategories(ownCategory, opponentCategory);
      if (comparison > 0) wins += 1;
      else if (comparison === 0) ties += 1;
      total += 1;
    }
  }
  return Math.round(((wins * 1_000) + (ties * 500)) / total);
}

export function transcriptRoot(receipts: readonly PublicHandReceipt[]): string {
  let level = receipts.map((receipt) => receipt.handCommitment);
  if (level.length === 0) return commitment([]);
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(commitment({ left: level[index], right: level[index + 1] ?? level[index] }));
    }
    level = next;
  }
  return level[0];
}

export function publicHandReceiptCommitment(
  receipt: PublicHandReceiptCommitmentInput,
): string {
  return commitment({
    actionCommitment: receipt.actionCommitment,
    actionCommitments: receipt.actionCommitments,
    boardCommitment: receipt.boardCommitment,
    handNumber: receipt.handNumber,
    seatSwapped: receipt.seatSwapped,
    ...(receipt.scoreDelta ? { scoreDelta: receipt.scoreDelta } : {}),
    winner: receipt.winner,
  });
}

export function transcriptProof(receipts: readonly PublicHandReceipt[], index: number): TranscriptProof {
  if (!Number.isSafeInteger(index) || index < 0 || index >= receipts.length) {
    throw new Error("TRANSCRIPT_LEAF_INDEX_INVALID");
  }
  let level = receipts.map((receipt) => receipt.handCommitment);
  let levelIndex = index;
  const proof: TranscriptProofNode[] = [];
  while (level.length > 1) {
    const siblingIndex = levelIndex % 2 === 0 ? levelIndex + 1 : levelIndex - 1;
    proof.push({
      side: levelIndex % 2 === 0 ? "right" : "left",
      sibling: level[siblingIndex] ?? level[levelIndex]!,
    });
    const next: string[] = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) {
      next.push(commitment({ left: level[cursor], right: level[cursor + 1] ?? level[cursor] }));
    }
    level = next;
    levelIndex = Math.floor(levelIndex / 2);
  }
  return proof;
}

export function verifyTranscriptProof(
  receipt: PublicHandReceipt,
  proof: TranscriptProof,
  root: string,
): boolean {
  const { handCommitment, ...content } = receipt;
  if (publicHandReceiptCommitment(content) !== handCommitment) return false;
  let current = receipt.handCommitment;
  for (const node of proof) {
    current = node.side === "left"
      ? commitment({ left: node.sibling, right: current })
      : commitment({ left: current, right: node.sibling });
  }
  return current === root;
}

function runHand(
  leftAgent: AgentDefinition,
  rightAgent: AgentDefinition,
  matchSeed: string,
  handNumber: number,
  seatSwapped: boolean,
  engineVersion: ArenaEngineVersion,
): { ok: true; value: HandResult } | { ok: false; code: "AGENT_POLICY_FAILED" | "ILLEGAL_AGENT_ACTION"; agentId: AgentId } {
  const deal = createDeal(matchSeed, handNumber);
  const leftHole = seatSwapped ? deal.rightHole : deal.leftHole;
  const rightHole = seatSwapped ? deal.leftHole : deal.rightHole;
  const leftPosition = seatSwapped ? "big_blind" : "button";
  const rightPosition = seatSwapped ? "button" : "big_blind";
  const leftState: DecisionState = {
    agentId: leftAgent.id,
    board: deal.board,
    handNumber,
    holeCards: leftHole,
    legalActions: legalActions(10),
    opponentId: rightAgent.id,
    potMinor: 100,
    position: leftPosition,
    toCallMinor: 10,
  };
  const rightState: DecisionState = {
    agentId: rightAgent.id,
    board: deal.board,
    handNumber,
    holeCards: rightHole,
    legalActions: legalActions(10),
    opponentId: leftAgent.id,
    potMinor: 100,
    position: rightPosition,
    toCallMinor: 10,
  };

  const leftPolicy = invokePolicy(leftAgent, leftState);
  if (!leftPolicy.ok) return { ok: false, code: "AGENT_POLICY_FAILED", agentId: leftAgent.id };
  const rightPolicy = invokePolicy(rightAgent, rightState);
  if (!rightPolicy.ok) return { ok: false, code: "AGENT_POLICY_FAILED", agentId: rightAgent.id };
  const leftAction = leftPolicy.action;
  const rightAction = rightPolicy.action;
  if (!leftState.legalActions.includes(leftAction)) return { ok: false, code: "ILLEGAL_AGENT_ACTION", agentId: leftAgent.id };
  if (!rightState.legalActions.includes(rightAction)) return { ok: false, code: "ILLEGAL_AGENT_ACTION", agentId: rightAgent.id };

  const leftCategory = evaluateHand([...leftHole, ...deal.board]);
  const rightCategory = evaluateHand([...rightHole, ...deal.board]);
  const showdown = compareHandCategories(leftCategory, rightCategory);
  let winner: AgentId | "tie";
  if (leftAction === "fold" && rightAction === "fold") {
    winner = "tie";
  } else if (leftAction === "fold" && rightAction !== "fold") {
    winner = rightAgent.id;
  } else if (rightAction === "fold" && leftAction !== "fold") {
    winner = leftAgent.id;
  } else if (showdown > 0) {
    winner = leftAgent.id;
  } else if (showdown < 0) {
    winner = rightAgent.id;
  } else {
    winner = "tie";
  }

  const scoreDelta: Record<AgentId, number> = { [leftAgent.id]: 0, [rightAgent.id]: 0 };
  if (engineVersion === LEGACY_ARENA_ENGINE_VERSION) {
    if (winner !== "tie") scoreDelta[winner] = 1;
  } else if (winner !== "tie") {
    const loser = winner === leftAgent.id ? rightAgent.id : leftAgent.id;
    const winnerAction = winner === leftAgent.id ? leftAction : rightAction;
    const loserAction = loser === leftAgent.id ? leftAction : rightAction;
    if (loserAction === "fold") {
      scoreDelta[winner] = 1;
    } else {
      scoreDelta[winner] = winnerAction === "raise" ? 3 : 1;
      scoreDelta[loser] = loserAction === "raise" ? -5 : -1;
    }
  }

  return {
    ok: true,
    value: {
      board: deal.board,
      handNumber,
      handStrength: { left: leftCategory, right: rightCategory },
      outcomes: [
        { action: leftAction, agentId: leftAgent.id, handNumber, position: leftPosition, seatSwapped },
        { action: rightAction, agentId: rightAgent.id, handNumber, position: rightPosition, seatSwapped },
      ],
      scoreDelta,
      seatSwapped,
      winner,
    },
  };
}

export function runMatch(input: Readonly<{
  agents: readonly [AgentDefinition, AgentDefinition];
  engineVersion?: ArenaEngineVersion;
  hands: number;
  matchId: string;
  seed: string;
}>): MatchRunResult {
  const [firstAgent, secondAgent] = input.agents;
  const engineVersion = input.engineVersion ?? ARENA_ENGINE_VERSION;
  if (!input.matchId || !input.seed || !Number.isSafeInteger(input.hands) || input.hands < 1 || firstAgent.id === secondAgent.id) {
    throw new Error("POKER_MATCH_INPUT_INVALID");
  }
  const handResults: HandResult[] = [];
  const receiptLeaves: PublicHandReceipt[] = [];
  const score: Record<AgentId, number> = { [firstAgent.id]: 0, [secondAgent.id]: 0 };
  for (let handNumber = 1; handNumber <= input.hands; handNumber += 1) {
    for (const seatSwapped of [false, true]) {
      const result = runHand(firstAgent, secondAgent, input.seed, handNumber, seatSwapped, engineVersion);
      if (!result.ok) return { ok: false, code: result.code, agentId: result.agentId, handNumber };
      handResults.push(result.value);
      for (const agent of input.agents) score[agent.id] += result.value.scoreDelta[agent.id] ?? 0;
      const actionCommitment = commitment(result.value.outcomes.map((outcome) => ({ agentId: outcome.agentId, action: outcome.action })));
      const actionCommitments: Record<AgentId, string> = {};
      for (const outcome of result.value.outcomes) {
        actionCommitments[outcome.agentId] = commitment({ agentId: outcome.agentId, action: outcome.action });
      }
      const boardCommitment = commitment(result.value.board);
      const publicHandContent = {
        actionCommitment,
        actionCommitments,
        boardCommitment,
        handNumber,
        seatSwapped,
        ...(engineVersion === ARENA_ENGINE_VERSION ? { scoreDelta: result.value.scoreDelta } : {}),
        winner: result.value.winner,
      } satisfies PublicHandReceiptCommitmentInput;
      const publicHand = {
        ...publicHandContent,
        handCommitment: publicHandReceiptCommitment(publicHandContent),
      } satisfies PublicHandReceipt;
      receiptLeaves.push(publicHand);
    }
  }
  const seedCommitment = commitment({ engineVersion, matchId: input.matchId, seed: input.seed });
  return {
    ok: true,
    value: {
      engineVersion,
      hands: handResults,
      matchId: input.matchId,
      publicHandReceipts: receiptLeaves,
      publicReceipt: {
        artifactCommitments: { [firstAgent.id]: firstAgent.artifactCommitment, [secondAgent.id]: secondAgent.artifactCommitment },
        engineVersion,
        matchId: input.matchId,
        score,
        seedCommitment,
        transcriptRoot: transcriptRoot(receiptLeaves),
      },
      score,
      seedCommitment,
    },
  };
}
