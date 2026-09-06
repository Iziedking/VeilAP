import { LIVE_POKER_ENGINE_VERSION, type Card, type LiveAction, type LiveCommand, type LiveDeal, type LiveEvent, type LiveHandState, type LiveHoldemRules, type LivePhase, type LivePlayerState, type LiveTransition } from "./live-poker-types";

const iso = (value: Date): string => value.toISOString();

function playerAt(players: readonly LivePlayerState[], playerId: string): LivePlayerState | undefined {
  return players.find((player) => player.playerId === playerId);
}

function nextSeat(players: readonly LivePlayerState[], currentSeat: number, predicate: (player: LivePlayerState) => boolean): LivePlayerState | undefined {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const seat = (currentSeat + offset) % players.length;
    const candidate = players.find((player) => player.seat === seat);
    if (candidate && predicate(candidate)) return candidate;
  }
  return undefined;
}

function firstPostflopActor(players: readonly LivePlayerState[], buttonSeat: number): LivePlayerState | undefined {
  if (players.length === 2) return players.find((player) => player.seat === buttonSeat);
  return nextSeat(players, buttonSeat, (player) => player.status === "active");
}

export function validateRules(rules: LiveHoldemRules): void {
  if (rules.engineVersion !== LIVE_POKER_ENGINE_VERSION) throw new Error("LIVE_RULES_VERSION_UNSUPPORTED");
  if (!Number.isInteger(rules.playerCountMax) || rules.playerCountMax < 2 || rules.playerCountMax > 6) throw new Error("LIVE_RULES_PLAYER_COUNT_INVALID");
  if (!Number.isSafeInteger(rules.smallBlindMinor) || rules.smallBlindMinor <= 0) throw new Error("LIVE_RULES_SMALL_BLIND_INVALID");
  if (!Number.isSafeInteger(rules.bigBlindMinor) || rules.bigBlindMinor < rules.smallBlindMinor) throw new Error("LIVE_RULES_BIG_BLIND_INVALID");
  if (!Number.isSafeInteger(rules.anteMinor) || rules.anteMinor < 0) throw new Error("LIVE_RULES_ANTE_INVALID");
  if (!Number.isSafeInteger(rules.startingStackMinor) || rules.startingStackMinor < rules.bigBlindMinor) throw new Error("LIVE_RULES_STACK_INVALID");
  if (!Number.isSafeInteger(rules.turnTimeoutMs) || rules.turnTimeoutMs < 1_000) throw new Error("LIVE_RULES_TIMEOUT_INVALID");
}

function commitPlayer(player: LivePlayerState, amountMinor: number): LivePlayerState {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > player.stackMinor) throw new Error("LIVE_COMMITMENT_INVALID");
  const stackMinor = player.stackMinor - amountMinor;
  return { ...player, stackMinor, committedTotalMinor: player.committedTotalMinor + amountMinor, committedStreetMinor: player.committedStreetMinor + amountMinor, status: stackMinor === 0 ? "all_in" : player.status };
}

function postBlind(player: LivePlayerState, amountMinor: number): LivePlayerState {
  return commitPlayer(player, Math.min(player.stackMinor, amountMinor));
}

export function createInitialHand(input: Readonly<{ rules: LiveHoldemRules; handId: string; players: readonly { playerId: string; seat: number; holeCards: readonly [Card, Card] }[]; buttonSeat: number; deal: LiveDeal; startedAt: Date }>): LiveHandState {
  validateRules(input.rules);
  if (!input.handId || input.players.length < input.rules.playerCountMin || input.players.length > input.rules.playerCountMax) throw new Error("LIVE_HAND_INPUT_INVALID");
  if (new Set(input.players.map((player) => player.playerId)).size !== input.players.length) throw new Error("LIVE_HAND_PLAYERS_DUPLICATE");
  const players: LivePlayerState[] = input.players.map((player) => ({ playerId: player.playerId, seat: player.seat, stackMinor: input.rules.startingStackMinor, committedTotalMinor: 0, committedStreetMinor: 0, status: "active", holeCards: player.holeCards }));
  const button = players.find((player) => player.seat === input.buttonSeat);
  const smallBlind = players.length === 2 ? button : nextSeat(players, input.buttonSeat, () => true);
  const bigBlind = smallBlind ? nextSeat(players, smallBlind.seat, () => true) : undefined;
  if (!button || !smallBlind || !bigBlind) throw new Error("LIVE_HAND_SEATS_INVALID");
  const withAnte = players.map((player) => commitPlayer(player, input.rules.anteMinor));
  const withSmallBlind = withAnte.map((player) => player.playerId === smallBlind.playerId ? postBlind(player, input.rules.smallBlindMinor) : player);
  const posted = withSmallBlind.map((player) => player.playerId === bigBlind.playerId ? postBlind(player, input.rules.bigBlindMinor) : player);
  const firstActor = nextSeat(posted, bigBlind.seat, (player) => player.status === "active");
  const deadline = new Date(input.startedAt.getTime() + input.rules.turnTimeoutMs);
  return { engineVersion: LIVE_POKER_ENGINE_VERSION, handId: input.handId, phase: "preflop", buttonSeat: input.buttonSeat, players: posted, board: [], fullBoard: input.deal.board, currentBetMinor: Math.max(...posted.map((player) => player.committedStreetMinor)), minimumRaiseMinor: input.rules.bigBlindMinor, actedSinceFullRaise: [], actorPlayerId: firstActor?.playerId, turnId: firstActor ? `${input.handId}:turn:1` : undefined, turnDeadlineAt: firstActor ? iso(deadline) : undefined, version: 0, pots: [] };
}

export function legalActions(state: LiveHandState, playerId: string): readonly LiveAction[] {
  const player = playerAt(state.players, playerId);
  if (!player || player.status !== "active" || state.actorPlayerId !== playerId) return [];
  const toCall = Math.max(0, state.currentBetMinor - player.committedStreetMinor);
  const actions: LiveAction[] = ["fold"];
  if (toCall === 0) actions.push("check");
  else if (toCall <= player.stackMinor) actions.push("call");
  if (player.stackMinor > 0 && !state.actedSinceFullRaise.includes(playerId)) actions.push(state.currentBetMinor === 0 ? "bet" : "raise");
  if (player.stackMinor > 0) actions.push("all_in");
  return actions;
}

function applyActionContext(state: LiveHandState, command: LiveCommand, rules: LiveHoldemRules, now: Date, bypassDeadline = false): LiveTransition {
  if (command.type !== "act" && command.type !== "timeout") return { ok: false, code: "COMMAND_INVALID" };
  if (!command.playerId || command.playerId !== state.actorPlayerId || !command.turnId || command.turnId !== state.turnId) return { ok: false, code: "TURN_NOT_ACTIVE" };
  if (command.expectedVersion !== state.version) return { ok: false, code: "STALE_STATE" };
  if (!bypassDeadline && command.type === "act" && state.turnDeadlineAt && now.getTime() >= Date.parse(state.turnDeadlineAt)) return { ok: false, code: "TURN_EXPIRED" };
  if (command.type === "timeout") {
    if (!state.turnDeadlineAt || now.getTime() < Date.parse(state.turnDeadlineAt)) return { ok: false, code: "TURN_NOT_ACTIVE" };
    const action: LiveAction = legalActions(state, command.playerId).includes("check") ? "check" : "fold";
    const applied = applyActionContext(state, { ...command, type: "act", action }, rules, now, true);
    if (!applied.ok) return applied;
    return { ok: true, state: applied.state, events: [{ type: "turn_timed_out", version: state.version + 1, playerId: command.playerId, reason: action }, ...applied.events] };
  }
  if (!command.action || !legalActions(state, command.playerId).includes(command.action)) return { ok: false, code: "ACTION_NOT_LEGAL" };
  const player = playerAt(state.players, command.playerId);
  if (!player) return { ok: false, code: "PLAYER_NOT_ELIGIBLE" };
  const toCall = Math.max(0, state.currentBetMinor - player.committedStreetMinor);
  const minimumTarget = state.currentBetMinor === 0 ? rules.bigBlindMinor : state.currentBetMinor + state.minimumRaiseMinor;
  let amountMinor = 0;
  let fullRaise = false;
  if (command.action === "call") amountMinor = toCall;
  else if (command.action === "all_in") {
    amountMinor = player.stackMinor;
    const target = player.committedStreetMinor + amountMinor;
    fullRaise = target > state.currentBetMinor && target >= minimumTarget;
  } else if (command.action === "bet" || command.action === "raise") {
    if (!Number.isSafeInteger(command.amountMinor)) return { ok: false, code: "AMOUNT_INVALID" };
    const target = command.amountMinor;
    if (typeof target !== "number" || !Number.isSafeInteger(target)) return { ok: false, code: "AMOUNT_INVALID" };
    const maxTarget = player.committedStreetMinor + player.stackMinor;
    if (target <= state.currentBetMinor || target > maxTarget) return { ok: false, code: "AMOUNT_INVALID" };
    if (target < minimumTarget && target !== maxTarget) return { ok: false, code: "AMOUNT_INVALID" };
    amountMinor = target - player.committedStreetMinor;
    fullRaise = target >= minimumTarget;
  }
  if (amountMinor > player.stackMinor) return { ok: false, code: "AMOUNT_INVALID" };
  const nextPlayer = commitPlayer(player, amountMinor);
  const players = state.players.map((candidate) => candidate.playerId === player.playerId ? nextPlayer : candidate);
  if (command.action === "fold") {
    const folded = players.map((candidate) => candidate.playerId === player.playerId ? { ...candidate, status: "folded" as const } : candidate);
    return { ok: true, state: { ...state, players: folded, version: state.version + 1, actorPlayerId: undefined, turnId: undefined, turnDeadlineAt: undefined, showdownReason: "fold", phase: "showdown" }, events: [{ type: "action_accepted", version: state.version + 1, playerId: player.playerId, action: command.action }] };
  }
  const actedSinceFullRaise = fullRaise ? [player.playerId] : [...new Set([...state.actedSinceFullRaise, player.playerId])];
  const currentBetMinor = Math.max(state.currentBetMinor, nextPlayer.committedStreetMinor);
  const updated: LiveHandState = { ...state, players, currentBetMinor, minimumRaiseMinor: fullRaise ? Math.max(rules.bigBlindMinor, nextPlayer.committedStreetMinor - state.currentBetMinor) : state.minimumRaiseMinor, actedSinceFullRaise, version: state.version + 1, pots: [] };
  return finishOrAdvance(updated, [{ type: "action_accepted", version: updated.version, playerId: player.playerId, action: command.action, amountMinor }], rules, now);
}

function finishOrAdvance(state: LiveHandState, events: readonly LiveEvent[], rules: LiveHoldemRules, now: Date): LiveTransition {
  const remaining = state.players.filter((player) => player.status !== "folded");
  if (remaining.length <= 1 || remaining.every((player) => player.status === "all_in")) return { ok: true, state: { ...state, board: state.fullBoard, actorPlayerId: undefined, turnId: undefined, turnDeadlineAt: undefined, phase: "showdown", showdownReason: remaining.length <= 1 ? "fold" : "all_in" }, events: [...events, { type: "street_started", version: state.version, phase: "showdown" }] };
  const canClose = remaining.filter((player) => player.status === "active").every((player) => player.committedStreetMinor === state.currentBetMinor && state.actedSinceFullRaise.includes(player.playerId));
  if (!canClose) {
    const currentSeat = state.players.find((player) => player.playerId === state.actorPlayerId)?.seat ?? state.buttonSeat;
    const next = nextSeat(state.players, currentSeat, (player) => player.status === "active" && (!state.actedSinceFullRaise.includes(player.playerId) || player.committedStreetMinor < state.currentBetMinor));
    if (!next) return { ok: false, code: "TURN_NOT_ACTIVE" };
    return { ok: true, state: { ...state, actorPlayerId: next.playerId, turnId: `${state.handId}:turn:${state.version + 1}`, turnDeadlineAt: iso(new Date(now.getTime() + rules.turnTimeoutMs)) }, events };
  }
  const nextPhase: LivePhase = state.phase === "preflop" ? "flop" : state.phase === "flop" ? "turn" : state.phase === "turn" ? "river" : "showdown";
  if (nextPhase === "showdown") return { ok: true, state: { ...state, board: state.fullBoard, phase: "showdown", actorPlayerId: undefined, turnId: undefined, turnDeadlineAt: undefined, showdownReason: "river" }, events: [...events, { type: "street_started", version: state.version, phase: "showdown" }] };
  const boardCount = nextPhase === "flop" ? 3 : nextPhase === "turn" ? 4 : 5;
  const next = firstPostflopActor(state.players, state.buttonSeat);
  const resetPlayers = state.players.map((player) => ({ ...player, committedStreetMinor: 0 }));
  return { ok: true, state: { ...state, phase: nextPhase, board: state.fullBoard.slice(0, boardCount), players: resetPlayers, currentBetMinor: 0, minimumRaiseMinor: rules.bigBlindMinor, actedSinceFullRaise: [], actorPlayerId: next?.playerId, turnId: next ? `${state.handId}:turn:${state.version + 1}` : undefined, turnDeadlineAt: next ? iso(new Date(now.getTime() + rules.turnTimeoutMs)) : undefined }, events: [...events, { type: "street_started", version: state.version, phase: nextPhase }] };
}

export function applyAction(state: LiveHandState, command: LiveCommand, rules: LiveHoldemRules, now: Date): LiveTransition {
  return applyActionContext(state, command, rules, now);
}
