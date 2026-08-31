export type CompetitionStatus = "open" | "locked";

export type CompetitionSummary = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  rulesetVersion: string;
  startsAt: string;
  locksAt: string;
  endsAt: string;
  status: CompetitionStatus;
  entryMode: "invite_only" | "open";
  maxEntries: number;
  templateId?: string;
  rulesCommitment?: string;
  entryCount: number;
  prizeStatus?: string;
  matchCount: number;
  completedMatchCount: number;
  runningMatchCount: number;
};

export type CompetitionEntry = {
  id: string;
  seasonId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  joinedAt: string;
};

export type ScheduledMatch = {
  id: string;
  seasonId: string;
  sequence: number;
  hands: number;
  leftAgentId: string;
  rightAgentId: string;
  status: "pending" | "running" | "completed" | "failed";
  matchId?: string;
  createdAt: string;
};

export type TournamentRules = {
  templateId: string;
  templateVersion: number;
  pairingMode: "round_robin" | "duel_series" | "gauntlet";
  entryMode: "invite_only" | "open";
  minEntries: number;
  maxEntries: number;
  handsPerMatch: number;
  encountersPerPair: number;
  resubmissionPolicy: "replace_until_lock" | "fixed";
  rewardPolicy: "optional" | "funded_before_start";
  strategyVisibility: "sealed";
  revealPolicy: "loser_action_only";
};

export type CompetitionSchedule = {
  season: CompetitionSummary & { rules?: TournamentRules };
  entries: CompetitionEntry[];
  matches: ScheduledMatch[];
};

export type LeaderboardEntry = {
  agentId: string;
  artifactCommitment: string;
  displayName: string;
  losses: number;
  points: number;
  wins: number;
  matches: number;
  ties: number;
};

export type PublicHandReceipt = {
  actionCommitment: string;
  actionCommitments: Record<string, string>;
  boardCommitment: string;
  handNumber: number;
  handCommitment: string;
  seatSwapped: boolean;
  winner: string | "tie";
};

export type PublicMatch = {
  matchId: string;
  engineVersion: string;
  players: Array<{
    agentId: string;
    displayName: string;
    artifactCommitment: string;
  }>;
  score: Record<string, number>;
  winner: string | "tie";
  seedCommitment: string;
  transcriptRoot: string;
  handCount: number | null;
  publicHandReceipts?: PublicHandReceipt[];
  signedReceipt?: { publicKeyId: string; signature: string };
  selectiveReveal?: {
    action: "fold" | "check" | "call" | "raise";
    agentId: string;
    handIndex: number;
    handNumber: number;
    position: "button" | "big_blind";
    transcriptRoot: string;
  };
  createdAt: string;
};

export type PublicArena = {
  matches: PublicMatch[];
  leaderboard: LeaderboardEntry[];
};

export type ApiEnvelope<T> = { ok: true; value: T } | { ok: false; code: string };

export function competitionPhase(competition: CompetitionSummary): "open" | "live" | "complete" {
  if (competition.status === "open") return "open";
  if (competition.matchCount > 0 && competition.completedMatchCount === competition.matchCount) return "complete";
  return "live";
}

export function shortCommitment(value?: string): string {
  if (!value) return "NOT SET";
  return value.length > 16 ? value.slice(0, 8) + "..." + value.slice(-6) : value;
}

