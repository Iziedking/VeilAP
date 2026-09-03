import {
  ARENA_ENGINE_VERSION,
  runMatch,
  type AgentDefinition,
  type DecisionAction,
  type MatchResult,
} from "@/domain/arena/poker-engine";
import {
  AGENT_PACKAGE_PROTOCOL_VERSION,
  compileAgentPackage,
  parseAgentPackage,
  type AgentPackage,
} from "@/domain/arena/strategy-policy";
import { VEIL_ARENA_CHAMPION } from "@/domain/arena/veil-arena-champion";

const DEVELOPMENT_SEEDS = 24;
const HELD_OUT_SEEDS = 24;
const HANDS_PER_MATCH = 12;
const QUICK_SEEDS = 8;

type MatchCounts = {
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  allHandsTied: number;
  handWins: number;
  handLosses: number;
  handTies: number;
  scoreDifferenceTotal: number;
  failures: number;
};

type BenchmarkRow = MatchCounts & { opponent: string };

function createPackage(
  agentId: string,
  displayName: string,
  rules: AgentPackage["policy"]["rules"],
  fallbackAction: DecisionAction,
): AgentPackage {
  return parseAgentPackage({
    protocolVersion: AGENT_PACKAGE_PROTOCOL_VERSION,
    engineVersion: ARENA_ENGINE_VERSION,
    agentId,
    displayName,
    policy: { rules, fallbackAction },
  });
}

const BASELINES: readonly AgentPackage[] = [
  createPackage("FOLD_BOT", "Always Fold", [{ when: { minHoleRankTotal: 4 }, action: "fold" }], "fold"),
  createPackage("CALL_BOT", "Always Call", [{ when: { minHoleRankTotal: 4 }, action: "call" }], "call"),
  createPackage("RAISE_BOT", "Always Raise", [{ when: { minHoleRankTotal: 4 }, action: "raise" }], "raise"),
  createPackage(
    "VALUE_BOT",
    "Value Bot",
    [
      { when: { minEquityPermille: 700 }, action: "raise" },
      { when: { minEquityPermille: 450 }, action: "call" },
    ],
    "fold",
  ),
  createPackage(
    "NULL_JACK_V1",
    "Null Jack v1",
    [
      { when: { minEquityPermille: 625 }, action: "raise" },
      { when: { minEquityPermille: 500 }, action: "call" },
    ],
    "fold",
  ),
];

function emptyCounts(): MatchCounts {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    allHandsTied: 0,
    handWins: 0,
    handLosses: 0,
    handTies: 0,
    scoreDifferenceTotal: 0,
    failures: 0,
  };
}

function addResult(counts: MatchCounts, result: MatchResult, championId: string, opponentId: string): void {
  counts.matches += 1;
  const championScore = result.score[championId] ?? 0;
  const opponentScore = result.score[opponentId] ?? 0;
  counts.scoreDifferenceTotal += championScore - opponentScore;
  if (championScore > opponentScore) counts.wins += 1;
  else if (championScore < opponentScore) counts.losses += 1;
  else counts.ties += 1;

  const tiedHands = result.hands.every((hand) => hand.winner === "tie");
  if (tiedHands) counts.allHandsTied += 1;
  for (const hand of result.hands) {
    if (hand.winner === championId) counts.handWins += 1;
    else if (hand.winner === opponentId) counts.handLosses += 1;
    else counts.handTies += 1;
  }
}

function seedFor(split: "dev" | "held-out", index: number): string {
  return `null-jack-benchmark:v1:${split}:${index + 1}`;
}

function runAgainst(championPackage: AgentPackage, opponent: AgentDefinition, split: "dev" | "held-out", count: number): MatchCounts {
  const champion = compileAgentPackage(championPackage);
  const counts = emptyCounts();
  for (let index = 0; index < count; index += 1) {
    const result = runMatch({
      agents: [champion, opponent],
      engineVersion: ARENA_ENGINE_VERSION,
      hands: HANDS_PER_MATCH,
      matchId: `null-jack-${split}-${opponent.id}-${index + 1}`,
      seed: seedFor(split, index),
    });
    if (!result.ok) {
      counts.failures += 1;
      continue;
    }
    addResult(counts, result.value, champion.id, opponent.id);
  }
  return counts;
}

function runControl(championPackage: AgentPackage, split: "dev" | "held-out", count: number): MatchCounts {
  const champion = compileAgentPackage(championPackage);
  const controlPackage = parseAgentPackage({ ...championPackage, agentId: "NULL_JACK_CONTROL", displayName: "Null Jack Control" });
  const control = compileAgentPackage(controlPackage);
  const counts = emptyCounts();
  for (let index = 0; index < count; index += 1) {
    const result = runMatch({
      agents: [champion, control],
      engineVersion: ARENA_ENGINE_VERSION,
      hands: HANDS_PER_MATCH,
      matchId: `null-jack-control-${split}-${index + 1}`,
      seed: seedFor(split, index),
    });
    if (!result.ok) {
      counts.failures += 1;
      continue;
    }
    addResult(counts, result.value, champion.id, control.id);
  }
  return counts;
}

function formatRow(row: BenchmarkRow): string {
  const meanScore = row.matches === 0 ? 0 : row.scoreDifferenceTotal / row.matches;
  return [
    row.opponent.padEnd(18),
    `W/L/T ${row.wins}/${row.losses}/${row.ties}`.padEnd(15),
    `hands ${row.handWins}/${row.handLosses}/${row.handTies}`.padEnd(18),
    `mean score ${meanScore.toFixed(2)}`.padEnd(17),
    `all-tie ${row.allHandsTied}`,
    `failures ${row.failures}`,
  ].join(" | ");
}

function printSplit(name: string, rows: readonly BenchmarkRow[]): void {
  console.log(`\n${name}`);
  for (const row of rows) console.log(formatRow(row));
}

function rowsFor(championPackage: AgentPackage, split: "dev" | "held-out", count: number): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];
  const opponentArgument = process.argv.find((argument) => argument.startsWith("--opponent="));
  const selectedBaselineId = opponentArgument?.slice("--opponent=".length);
  const baselines = selectedBaselineId === undefined
    ? BASELINES
    : BASELINES.filter((baseline) => baseline.agentId === selectedBaselineId);
  for (const baseline of baselines) {
    rows.push({ opponent: baseline.displayName, ...runAgainst(championPackage, compileAgentPackage(baseline), split, count) });
  }
  const control = runControl(championPackage, split, Math.min(count, 8));
  rows.push({ opponent: "Same-policy control", ...control });
  return rows;
}

const championPackage = VEIL_ARENA_CHAMPION;
const developmentSeedCount = process.argv.includes("--quick") ? QUICK_SEEDS : DEVELOPMENT_SEEDS;
const heldOutSeedCount = process.argv.includes("--quick") ? QUICK_SEEDS : HELD_OUT_SEEDS;
console.log("Null Jack benchmark");
const opponentArgument = process.argv.find((argument) => argument.startsWith("--opponent="));
console.log(`policy=${championPackage.displayName}${opponentArgument ? ` ${opponentArgument.slice(2)}` : ""}`);
console.log(`engine=${ARENA_ENGINE_VERSION} handsPerMatch=${HANDS_PER_MATCH} devSeeds=${developmentSeedCount} heldOutSeeds=${heldOutSeedCount}`);
console.log("Champion outcome order: W/L/T is match wins, losses, ties. hands is hand wins, losses, ties.");
printSplit("Development set", rowsFor(championPackage, "dev", developmentSeedCount));
printSplit("Held-out set", rowsFor(championPackage, "held-out", heldOutSeedCount));
