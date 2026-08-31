import { ARENA_ENGINE_VERSION } from "@/domain/arena/poker-engine";
import {
  AGENT_PACKAGE_PROTOCOL_VERSION,
  parseAgentPackage,
  type AgentPackage,
} from "@/domain/arena/strategy-policy";

export const VEIL_ARENA_CHAMPION_AGENT_ID = "NULL_JACK" as const;

// The benchmark is deterministic and runs through the same sealed artifact,
// scheduling, execution, and receipt path as every player-built agent.
export const VEIL_ARENA_CHAMPION: AgentPackage = parseAgentPackage({
  protocolVersion: AGENT_PACKAGE_PROTOCOL_VERSION,
  engineVersion: ARENA_ENGINE_VERSION,
  agentId: VEIL_ARENA_CHAMPION_AGENT_ID,
  displayName: "Null Jack",
  policy: {
    rules: [
      { when: { minHandStrength: 6 }, action: "raise" },
      { when: { minHandStrength: 4, maxToCallMinor: 1_000_000_000 }, action: "raise" },
      { when: { minHandStrength: 3, maxToCallMinor: 1_000_000_000 }, action: "call" },
      { when: { pocketPair: true, minHighCardRank: 10 }, action: "raise" },
      { when: { pocketPair: true, maxToCallMinor: 240 }, action: "call" },
      { when: { minHoleRankTotal: 25 }, action: "raise" },
      { when: { suited: true, minHoleRankTotal: 21, maxToCallMinor: 180 }, action: "call" },
      { when: { position: "button", minHighCardRank: 12, maxToCallMinor: 120 }, action: "call" },
      { when: { boardPaired: true, maxToCallMinor: 0 }, action: "check" },
      { when: { position: "button", handNumberModulo: { divisor: 7, remainder: 3 } }, action: "raise" },
      { when: { handCategories: ["high_card"], position: "big_blind", maxHoleRankTotal: 12, handNumberModulo: { divisor: 4, remainder: 0 } }, action: "fold" },
      { when: { maxToCallMinor: 0 }, action: "check" },
    ],
    fallbackAction: "call",
  },
});
