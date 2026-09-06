import { commitment } from "@/domain/canonical";
import { buildPots, settlePots } from "./pots";
import { applyAction } from "./rules";
import type { LiveCommand, LiveEvent, LiveHandState, LiveHoldemRules, LiveTransition } from "./live-poker-types";

export function applyCommand(state: LiveHandState, command: LiveCommand, rules: LiveHoldemRules, now: Date): LiveTransition {
  if (!command.commandId || !Number.isSafeInteger(command.expectedVersion)) return { ok: false, code: "COMMAND_INVALID" };
  if (state.phase === "complete") return { ok: false, code: "HAND_COMPLETE" };
  if (command.type === "showdown") return settleShowdown(state, command);
  return applyAction(state, command, rules, now);
}

function settleShowdown(state: LiveHandState, command: LiveCommand): LiveTransition {
  if (command.expectedVersion !== state.version) return { ok: false, code: "STALE_STATE" };
  if (state.phase !== "showdown") return { ok: false, code: "SHOWDOWN_NOT_READY" };
  const pots = settlePots({ players: state.players, board: state.fullBoard, buttonSeat: state.buttonSeat });
  const awardsByPlayer = new Map<string, number>();
  const awards: LiveEvent[] = [];
  for (const pot of pots) {
    for (const [playerId, awardMinor] of Object.entries(pot.awards)) {
      awardsByPlayer.set(playerId, (awardsByPlayer.get(playerId) ?? 0) + awardMinor);
      awards.push({ type: "pot_awarded", version: state.version + 1, potId: pot.potId, playerId, awardMinor });
    }
  }
  const players = state.players.map((player) => ({ ...player, stackMinor: player.stackMinor + (awardsByPlayer.get(player.playerId) ?? 0), committedStreetMinor: 0 }));
  const events: LiveEvent[] = [{ type: "showdown_resolved", version: state.version + 1, phase: "showdown" }, ...awards, { type: "hand_completed", version: state.version + 1, phase: "complete" }];
  const nextState: LiveHandState = { ...state, phase: "complete", players, pots: buildPots(state.players).map((pot) => ({ ...pot, id: commitment({ domain: "veil:live-pot-state:v1", pot }) })), board: state.fullBoard, actorPlayerId: undefined, turnId: undefined, turnDeadlineAt: undefined, version: state.version + 1 };
  return { ok: true, state: nextState, events };
}
