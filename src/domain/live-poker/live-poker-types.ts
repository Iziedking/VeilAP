export const LIVE_POKER_ENGINE_VERSION = "holdem-live-v1" as const;

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Card = Readonly<{ rank: Rank; suit: Suit }>;

export type LiveAction = "check" | "call" | "fold" | "bet" | "raise" | "all_in";
export type LivePhase = "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";
export type LivePlayerStatus = "active" | "folded" | "all_in";

export type HandCategory = Readonly<{
  name: "flush" | "four_kind" | "full_house" | "high_card" | "pair" | "straight" | "straight_flush" | "three_kind" | "two_pair";
  rank: number;
  tiebreak: readonly number[];
}>;

export type LiveHoldemRules = Readonly<{
  engineVersion: typeof LIVE_POKER_ENGINE_VERSION;
  playerCountMin: 2;
  playerCountMax: number;
  smallBlindMinor: number;
  bigBlindMinor: number;
  anteMinor: number;
  startingStackMinor: number;
  turnTimeoutMs: number;
  timeoutAction: "check_then_fold";
  oddChipOrder: "button_left_clockwise";
}>;

export type LivePlayerState = Readonly<{
  playerId: string;
  seat: number;
  stackMinor: number;
  committedTotalMinor: number;
  committedStreetMinor: number;
  status: LivePlayerStatus;
  holeCards: readonly [Card, Card];
}>;

export type LivePot = Readonly<{
  id: string;
  capMinor: number;
  amountMinor: number;
  eligiblePlayerIds: readonly string[];
}>;

export type LiveDeal = Readonly<{
  board: readonly [Card, Card, Card, Card, Card];
  holeCards: Readonly<Record<string, readonly [Card, Card]>>;
}>;

export type LiveHandState = Readonly<{
  engineVersion: typeof LIVE_POKER_ENGINE_VERSION;
  handId: string;
  phase: LivePhase;
  buttonSeat: number;
  players: readonly LivePlayerState[];
  board: readonly Card[];
  fullBoard: readonly [Card, Card, Card, Card, Card];
  currentBetMinor: number;
  minimumRaiseMinor: number;
  actedSinceFullRaise: readonly string[];
  actorPlayerId?: string;
  turnId?: string;
  turnDeadlineAt?: string;
  version: number;
  pots: readonly LivePot[];
  showdownReason?: "fold" | "all_in" | "river";
}>;

export type LiveCommand = Readonly<{
  commandId: string;
  expectedVersion: number;
  type: "act" | "timeout" | "showdown";
  playerId?: string;
  action?: LiveAction;
  amountMinor?: number;
  turnId?: string;
  now?: string;
}>;

export type LiveEvent = Readonly<{
  type: "action_accepted" | "turn_timed_out" | "street_started" | "showdown_resolved" | "pot_awarded" | "hand_completed";
  version: number;
  playerId?: string;
  action?: LiveAction;
  amountMinor?: number;
  phase?: LivePhase;
  potId?: string;
  awardMinor?: number;
  winnerPlayerIds?: readonly string[];
  reason?: string;
}>;

export type LiveRefusalCode =
  | "COMMAND_INVALID"
  | "STALE_STATE"
  | "TURN_NOT_ACTIVE"
  | "TURN_EXPIRED"
  | "PLAYER_NOT_ELIGIBLE"
  | "ACTION_NOT_LEGAL"
  | "AMOUNT_INVALID"
  | "SHOWDOWN_NOT_READY"
  | "HAND_COMPLETE";

export type LiveTransition =
  | { ok: true; state: LiveHandState; events: readonly LiveEvent[] }
  | { ok: false; code: LiveRefusalCode };
