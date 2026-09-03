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
      { when: { minEquityPermille: 700 }, action: "raise" },
      { when: { minEquityPermille: 525 }, action: "call" },
    ],
    fallbackAction: "fold",
  },
});
