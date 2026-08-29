import { randomBytes, randomUUID } from "node:crypto";

import { commitment } from "@/domain/canonical";
import type { PublicMatchReceipt } from "@/domain/arena/poker-engine";
import { revealSealedLosingAction, runSealedMatch, type SealedLosingActionReveal } from "./sealed-match-runner";
import type { KeyProvider } from "@/server/crypto/key-provider";
import { decryptField, encryptField } from "@/server/crypto/envelope";
import { authorizeProject } from "@/server/authorization/authorize";
import type {
  ArenaMatchReceiptRecord,
  ArenaMatchRevealRecord,
  ProjectRepository,
} from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";

export type ArenaMatchServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "STRATEGY_ARTIFACT_NOT_FOUND"
  | "STRATEGY_ARTIFACT_INVALID"
  | "AGENT_POLICY_FAILED"
  | "ILLEGAL_AGENT_ACTION"
  | "ARENA_MATCH_NOT_FOUND"
  | "MATCH_HAND_COUNT_UNAVAILABLE"
  | "REVEAL_HAND_NOT_FOUND"
  | "NO_LOSING_AGENT"
  | "TRANSCRIPT_PROOF_INVALID"
  | "PERSISTENCE_FAILED"
  | "ENCRYPTION_FAILED";

export type ArenaMatchServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ArenaMatchServiceErrorCode };

export interface PublicArenaMatchView {
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
  selectiveReveal?: PublicArenaRevealView;
  createdAt: string;
}

export interface PublicArenaRevealView {
  id: string;
  action: SealedLosingActionReveal["action"];
  actionCommitment: string;
  agentId: string;
  handCommitment: string;
  handIndex: number;
  handNumber: number;
  position: SealedLosingActionReveal["position"];
  proof: unknown;
  publicHandReceipt: unknown;
  seatSwapped: boolean;
  transcriptRoot: string;
  createdAt: string;
}

export interface ArenaLeaderboardEntry {
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
}

export interface PublicArenaView {
  matches: PublicArenaMatchView[];
  leaderboard: ArenaLeaderboardEntry[];
}

export interface ArenaMatchServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  walletHashPepper: string;
  now?: () => Date;
  idFactory?: () => string;
  seedFactory?: () => string;
}

function mapAuthorizationCode(code: string): ArenaMatchServiceErrorCode {
  return code === "PROJECT_ACCESS_REQUIRED" ? "PROJECT_ACCESS_REQUIRED" : "ROLE_FORBIDDEN";
}

function mapRunCode(code: string): ArenaMatchServiceErrorCode {
  if (code === "SEALED_ARTIFACT_NOT_FOUND") return "STRATEGY_ARTIFACT_NOT_FOUND";
  if (code === "STRATEGY_ARTIFACT_INVALID") return "STRATEGY_ARTIFACT_INVALID";
  if (code === "AGENT_POLICY_FAILED") return "AGENT_POLICY_FAILED";
  if (code === "ILLEGAL_AGENT_ACTION") return "ILLEGAL_AGENT_ACTION";
  return "PERSISTENCE_FAILED";
}

function mapRevealCode(code: string): ArenaMatchServiceErrorCode {
  if (code === "SEALED_ARTIFACT_NOT_FOUND") return "STRATEGY_ARTIFACT_NOT_FOUND";
  if (code === "STRATEGY_ARTIFACT_INVALID") return "STRATEGY_ARTIFACT_INVALID";
  if (code === "AGENT_POLICY_FAILED") return "AGENT_POLICY_FAILED";
  if (code === "ILLEGAL_AGENT_ACTION") return "ILLEGAL_AGENT_ACTION";
  if (code === "REVEAL_HAND_NOT_FOUND") return "REVEAL_HAND_NOT_FOUND";
  if (code === "NO_LOSING_AGENT") return "NO_LOSING_AGENT";
  if (code === "TRANSCRIPT_PROOF_INVALID") return "TRANSCRIPT_PROOF_INVALID";
  return "PERSISTENCE_FAILED";
}

function mapError(error: unknown): ArenaMatchServiceErrorCode {
  if (!(error instanceof Error)) return "PERSISTENCE_FAILED";
  if (error.message === "ENVELOPE_AUTH_FAILED" || error.message.includes("KEY_")) return "ENCRYPTION_FAILED";
  if (error.message === "ARENA_MATCH_ALREADY_EXISTS") return "PERSISTENCE_FAILED";
  return "PERSISTENCE_FAILED";
}

function winnerFor(score: Readonly<Record<string, number>>): string | "tie" {
  const entries = Object.entries(score);
  const highest = Math.max(...entries.map(([, points]) => points));
  const leaders = entries.filter(([, points]) => points === highest);
  return leaders.length === 1 ? leaders[0]![0] : "tie";
}

function publicReveal(record: ArenaMatchRevealRecord): PublicArenaRevealView {
  return {
    id: record.id,
    action: record.action,
    actionCommitment: record.actionCommitment,
    agentId: record.agentId,
    handCommitment: record.handCommitment,
    handIndex: record.handIndex,
    handNumber: record.handNumber,
    position: record.position,
    proof: record.proof,
    publicHandReceipt: record.publicHandReceipt,
    seatSwapped: record.seatSwapped,
    transcriptRoot: record.transcriptRoot,
    createdAt: record.createdAt.toISOString(),
  };
}

function publicView(record: ArenaMatchReceiptRecord, reveal?: ArenaMatchRevealRecord): PublicArenaMatchView {
  const receipt = record.publicReceipt as PublicMatchReceipt;
  return {
    matchId: receipt.matchId,
    engineVersion: receipt.engineVersion,
    players: [
      {
        agentId: record.leftAgentId,
        displayName: record.leftDisplayName,
        artifactCommitment: receipt.artifactCommitments[record.leftAgentId]!,
      },
      {
        agentId: record.rightAgentId,
        displayName: record.rightDisplayName,
        artifactCommitment: receipt.artifactCommitments[record.rightAgentId]!,
      },
    ],
    score: { ...receipt.score },
    winner: winnerFor(receipt.score),
    seedCommitment: receipt.seedCommitment,
    transcriptRoot: receipt.transcriptRoot,
    handCount: record.handCount ?? null,
    selectiveReveal: reveal ? publicReveal(reveal) : undefined,
    createdAt: record.createdAt.toISOString(),
  };
}

export class ArenaMatchService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly walletHashPepper: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly seedFactory: () => string;

  constructor(dependencies: ArenaMatchServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
    this.seedFactory = dependencies.seedFactory ?? (() => randomBytes(32).toString("hex"));
  }

  async runMatch(input: {
    projectId: string;
    actorWalletAddress: string;
    leftAgentId: string;
    rightAgentId: string;
    hands: number;
  }): Promise<ArenaMatchServiceResult<PublicArenaMatchView>> {
    const projectId = input.projectId.trim();
    const leftAgentId = input.leftAgentId.trim();
    const rightAgentId = input.rightAgentId.trim();
    if (
      !projectId
      || !leftAgentId
      || !rightAgentId
      || leftAgentId === rightAgentId
      || !Number.isSafeInteger(input.hands)
      || input.hands < 1
      || input.hands > 100
    ) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "run_arena_match",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };

      const [leftRecord, rightRecord] = await Promise.all([
        this.repositories.getArenaStrategyArtifact(projectId, leftAgentId),
        this.repositories.getArenaStrategyArtifact(projectId, rightAgentId),
      ]);
      if (!leftRecord) return { ok: false, code: "STRATEGY_ARTIFACT_NOT_FOUND" };
      if (!rightRecord) return { ok: false, code: "STRATEGY_ARTIFACT_NOT_FOUND" };

      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, projectId);
      const matchId = this.idFactory();
      const seed = this.seedFactory();
      const result = await runSealedMatch({
        projectId,
        leftAgentId,
        rightAgentId,
        matchId,
        seed,
        hands: input.hands,
        keyMaterial: { dataKey, wrappedKey: project.wrappedDataKey },
        store: {
          get: (requestedProjectId, agentId) => this.repositories.getArenaStrategyArtifact(requestedProjectId, agentId),
          save: async () => {
            throw new Error("ARENA_MATCH_STORE_READ_ONLY");
          },
        },
      });
      if (!result.ok) return { ok: false, code: mapRunCode(result.code) };

      const createdAt = this.now();
      const encryptedSeed = encryptField(
        seed,
        { projectId, recordType: "arena_match", recordId: matchId, fieldName: "seed" },
        { dataKey, wrappedKey: project.wrappedDataKey },
      );
      const record: ArenaMatchReceiptRecord = {
        id: matchId,
        projectId,
        leftAgentId,
        rightAgentId,
        leftDisplayName: leftRecord.displayName,
        rightDisplayName: rightRecord.displayName,
        publicReceipt: result.value.publicReceipt,
        encryptedSeed,
        handCount: input.hands,
        status: "completed",
        createdAt,
      };
      await this.repositories.saveArenaMatchReceipt(record);
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId,
        actorFingerprint,
        eventType: "arena_match_completed",
        payloadDigest: commitment({
          matchId,
          transcriptRoot: result.value.publicReceipt.transcriptRoot,
          seedCommitment: result.value.publicReceipt.seedCommitment,
        }),
        createdAt,
      });
      return { ok: true, value: publicView(record) };
    } catch (error) {
      return { ok: false, code: mapError(error) };
    }
  }

  async revealLosingAction(input: {
    projectId: string;
    actorWalletAddress: string;
    matchId: string;
    handIndex: number;
  }): Promise<ArenaMatchServiceResult<PublicArenaRevealView>> {
    const projectId = input.projectId.trim();
    const matchId = input.matchId.trim();
    if (!projectId || !matchId || !Number.isSafeInteger(input.handIndex) || input.handIndex < 1) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "reveal_losing_action",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };

      const match = await this.repositories.getArenaMatchReceipt(projectId, matchId);
      if (!match) return { ok: false, code: "ARENA_MATCH_NOT_FOUND" };
      if (!match.handCount) return { ok: false, code: "MATCH_HAND_COUNT_UNAVAILABLE" };
      const existing = await this.repositories.getArenaMatchReveal(projectId, matchId);
      if (existing) return { ok: true, value: publicReveal(existing) };

      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, projectId);
      const seed = decryptField(
        match.encryptedSeed,
        { projectId, recordType: "arena_match", recordId: matchId, fieldName: "seed" },
        { dataKey, wrappedKey: project.wrappedDataKey },
      );
      const result = await revealSealedLosingAction({
        projectId,
        leftAgentId: match.leftAgentId,
        rightAgentId: match.rightAgentId,
        matchId,
        seed,
        hands: match.handCount,
        handIndex: input.handIndex,
        keyMaterial: { dataKey, wrappedKey: project.wrappedDataKey },
        store: {
          get: (requestedProjectId, agentId) => this.repositories.getArenaStrategyArtifact(requestedProjectId, agentId),
          save: async () => {
            throw new Error("ARENA_MATCH_STORE_READ_ONLY");
          },
        },
      });
      if (!result.ok) return { ok: false, code: mapRevealCode(result.code) };

      const createdAt = this.now();
      const record: ArenaMatchRevealRecord = {
        id: this.idFactory(),
        projectId,
        matchId,
        agentId: result.value.agentId,
        handIndex: result.value.handIndex,
        handNumber: result.value.handNumber,
        position: result.value.position,
        action: result.value.action,
        seatSwapped: result.value.seatSwapped,
        actionCommitment: result.value.actionCommitment,
        handCommitment: result.value.handCommitment,
        transcriptRoot: result.value.transcriptRoot,
        publicHandReceipt: result.value.publicHandReceipt,
        proof: result.value.proof,
        createdAt,
      };
      await this.repositories.saveArenaMatchReveal(record);
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId,
        actorFingerprint,
        eventType: "arena_losing_action_revealed",
        payloadDigest: commitment({
          matchId,
          agentId: record.agentId,
          handIndex: record.handIndex,
          actionCommitment: record.actionCommitment,
          transcriptRoot: record.transcriptRoot,
        }),
        createdAt,
      });
      return { ok: true, value: publicReveal(record) };
    } catch (error) {
      return { ok: false, code: mapError(error) };
    }
  }

  async getPublicArena(projectId: string): Promise<ArenaMatchServiceResult<PublicArenaView>> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) return { ok: false, code: "INVALID_INPUT" };
    try {
      if (!(await this.repositories.getProject(normalizedProjectId))) {
        return { ok: false, code: "PROJECT_NOT_FOUND" };
      }
      const [matches, artifacts, reveals] = await Promise.all([
        this.repositories.listArenaMatchReceipts(normalizedProjectId),
        this.repositories.listArenaStrategyArtifacts(normalizedProjectId),
        this.repositories.listArenaMatchReveals(normalizedProjectId),
      ]);
      const revealByMatchId = new Map(reveals.map((reveal) => [reveal.matchId, reveal]));
      const leaderboard = new Map<string, ArenaLeaderboardEntry>(
        artifacts.map((artifact) => [artifact.agentId, {
          agentId: artifact.agentId,
          displayName: artifact.displayName,
          artifactCommitment: artifact.artifactCommitment,
          matches: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
        }]),
      );
      for (const record of matches) {
        const view = publicView(record, revealByMatchId.get(record.id));
        const winner = view.winner;
        for (const player of view.players) {
          const entry = leaderboard.get(player.agentId);
          if (!entry) continue;
          entry.matches += 1;
          if (winner === "tie") {
            entry.ties += 1;
            entry.points += 1;
          } else if (winner === player.agentId) {
            entry.wins += 1;
            entry.points += 3;
          } else {
            entry.losses += 1;
          }
        }
      }
      return {
        ok: true,
        value: {
          matches: matches.map((match) => publicView(match, revealByMatchId.get(match.id))).reverse(),
          leaderboard: [...leaderboard.values()].sort(
            (left, right) => right.points - left.points || right.wins - left.wins || left.displayName.localeCompare(right.displayName),
          ),
        },
      };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }
}
