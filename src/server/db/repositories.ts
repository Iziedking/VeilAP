import { and, asc, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import type { AuthChallenge } from "@/server/auth/challenge";
import { parseTournamentRules, type TournamentRules } from "@/domain/arena/tournament-rules";
import type { EncryptedField } from "@/server/crypto/envelope";
import type { VeilapDatabase } from "./client";
import {
  arenaEntryVersions,
  arenaStrategyArtifacts,
  arenaMatchReceipts,
  arenaMatchReveals,
  arenaPrizePools,
  arenaPrizeTransactions,
  arenaScheduledMatches,
  arenaSeasonEntries,
  arenaSeasons,
  agreementVersions,
  auditEvents,
  authNonces,
  authSessions,
  chainOperations,
  checkpoints,
  decisions,
  projectMembers,
  projects,
  participantAgentPackages,
  releases,
  revenueEvents,
  selectiveReceipts,
  verificationRuns,
} from "./schema";

export interface AuthNonceRecord {
  nonce: string;
  walletFingerprint: string;
  challenge: AuthChallenge;
  digest: string;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface AuthNonceRepository {
  saveNonce(record: AuthNonceRecord): Promise<void>;
  getNonce(nonce: string): Promise<AuthNonceRecord | undefined>;
  consumeNonce(nonce: string, now: Date): Promise<AuthNonceRecord | "REPLAYED" | undefined>;
}

export interface SessionRecord {
  id: string;
  walletFingerprint: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface StoredSessionRecord extends SessionRecord {
  revokedAt?: Date;
}

export interface SessionRepository {
  saveSession(record: SessionRecord): Promise<void>;
  getSession(id: string): Promise<StoredSessionRecord | undefined>;
  revokeSession(id: string, now: Date): Promise<void>;
}

export interface ProjectKeyRecord {
  id: string;
  name: string;
  ownerFingerprint: string;
  wrappedDataKey: string;
  createdAt: Date;
}

export interface ProjectKeyRepository {
  saveProject(record: ProjectKeyRecord): Promise<void>;
  getProject(id: string): Promise<ProjectKeyRecord | undefined>;
}

export type ProjectRole = "company" | "contributor" | "reviewer" | "auditor";

export interface ProjectMemberRecord {
  projectId: string;
  walletFingerprint: string;
  role: ProjectRole;
  createdAt: Date;
}

export interface AgreementVersionRecord {
  id: string;
  projectId: string;
  version: number;
  encryptedTerms: EncryptedField;
  termsDigest: string;
  createdBy: string;
  createdAt: Date;
}

export interface EncryptedCheckpointPayload {
  artifact: EncryptedField;
  metadata: EncryptedField;
}

export interface CheckpointRecord {
  id: string;
  projectId: string;
  agreementVersionId: string;
  sequence: number;
  encryptedPayload: EncryptedCheckpointPayload;
  payloadDigest: string;
  status: "submitted" | "verified" | "rejected";
  createdBy: string;
  assignedReviewerFingerprint?: string;
  createdAt: Date;
}

export interface AuditEventRecord {
  id: string;
  projectId: string;
  actorFingerprint: string;
  eventType: string;
  payloadDigest: string;
  createdAt: Date;
}

export type VerificationRunStatus = "completed" | "unavailable" | "rejected";

export interface VerificationRunRecord {
  id: string;
  checkpointId: string;
  verifierFingerprint: string;
  status: VerificationRunStatus;
  result?: unknown;
  createdAt: Date;
}

export type DecisionKind = "accept" | "reject";

export interface DecisionRecord {
  id: string;
  checkpointId: string;
  schemaVersion: 1;
  projectId: string;
  agreementVersion: number;
  agreementDigest: string;
  checkpointDigest: string;
  verificationDigest: string;
  decision: DecisionKind;
  releaseAmountMinor?: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  signature: string[];
  decidedBy: string;
  createdAt: Date;
}

export type ReleaseKind = "milestone" | "royalty";
export type ReleaseStatus = "prepared" | "wallet_prompted" | "submitted" | "unknown" | "confirmed" | "reverted";

export interface ReleaseRecord {
  id: string;
  kind: ReleaseKind;
  sourceId: string;
  projectId: string;
  decisionId: string;
  amountMinor: string;
  idempotencyKey: string;
  status: ReleaseStatus;
  createdAt: Date;
}

export type ChainOperationStatus = ReleaseStatus;

export interface ChainOperationRecord {
  id: string;
  releaseId: string;
  operationType: "private_transfer";
  status: ChainOperationStatus;
  transactionHash?: string;
  receiptDigest?: string;
  reason?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface RevenueEventRecord {
  id: string;
  projectId: string;
  eventType: "reported_revenue";
  encryptedAmount: EncryptedField;
  currency: "USDC";
  createdAt: Date;
}

export interface SelectiveReceiptRecord {
  id: string;
  projectId: string;
  checkpointId?: string;
  receiptType: "company" | "contributor" | "auditor";
  encryptedPayload: EncryptedField;
  proof: unknown;
  revoked: boolean;
  createdAt: Date;
}

export interface ArenaStrategyArtifactRecord {
  id: string;
  projectId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  encryptedPolicy: EncryptedField;
  ownerFingerprint?: string;
  encryptedOwnerWallet?: EncryptedField;
  status: "sealed";
  createdAt: Date;
}

export interface ParticipantAgentPackageRecord {
  id: string;
  ownerFingerprint: string;
  agentId: string;
  displayName: string;
  protocolVersion: string;
  engineVersion: string;
  ruleCount: number;
  artifactCommitment: string;
  encryptedPackage: EncryptedField;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ArenaMatchReceiptRecord {
  id: string;
  projectId: string;
  leftAgentId: string;
  rightAgentId: string;
  leftDisplayName: string;
  rightDisplayName: string;
  publicReceipt: unknown;
  publicHandReceipts?: unknown[];
  signedReceipt?: unknown;
  encryptedSeed: EncryptedField;
  handCount?: number;
  idempotencyKey?: string;
  requestDigest?: string;
  status: "completed";
  createdAt: Date;
}

export type ArenaMatchRevealRecord = {
  id: string;
  projectId: string;
  matchId: string;
  agentId: string;
  handIndex: number;
  handNumber: number;
  position: "button" | "big_blind";
  action: "fold" | "check" | "call" | "raise";
  seatSwapped: boolean;
  actionCommitment: string;
  handCommitment: string;
  transcriptRoot: string;
  publicHandReceipt: unknown;
  proof: unknown;
  idempotencyKey?: string;
  requestDigest?: string;
  createdAt: Date;
};

export type ArenaSeasonStatus = "open" | "locked" | "completed" | "cancelled";
export type ArenaSeasonEntryMode = "invite_only" | "open";

export interface ArenaSeasonRecord {
  id: string;
  projectId: string;
  name: string;
  rulesetVersion: string;
  startsAt: Date;
  locksAt: Date;
  endsAt: Date;
  status: ArenaSeasonStatus;
  entryMode?: ArenaSeasonEntryMode;
  maxEntries?: number;
  templateId?: TournamentRules["templateId"];
  templateVersion?: number;
  rulesSnapshot?: TournamentRules;
  rulesCommitment?: string;
  createdBy: string;
  createdAt: Date;
  lockedAt?: Date;
  createIdempotencyKey?: string;
  createRequestDigest?: string;
  lockIdempotencyKey?: string;
  lockRequestDigest?: string;
}

export interface ArenaSeasonEntryRecord {
  id: string;
  seasonId: string;
  projectId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  ownerFingerprint?: string;
  encryptedPayoutWallet?: EncryptedField;
  version: number;
  joinedAt: Date;
  idempotencyKey?: string;
  requestDigest?: string;
}

export type ArenaEntryVersionStatus = "active" | "retired";

export interface ArenaEntryVersionRecord {
  id: string;
  entryId: string;
  seasonId: string;
  projectId: string;
  version: number;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  status: ArenaEntryVersionStatus;
  submittedAt: Date;
  retiredAt?: Date;
  idempotencyKey?: string;
  requestDigest?: string;
}

export type ArenaScheduledMatchStatus = "scheduled" | "running" | "completed" | "failed";

export interface ArenaScheduledMatchRecord {
  id: string;
  seasonId: string;
  projectId: string;
  sequence: number;
  hands: number;
  leftAgentId: string;
  rightAgentId: string;
  status: ArenaScheduledMatchStatus;
  matchId?: string;
  attempts: number;
  executionIdempotencyKey?: string;
  executionRequestDigest?: string;
  leaseExpiresAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastError?: string;
  createdAt: Date;
}

export type ArenaPrizePoolStatus = "funding_pending" | "funded" | "settlement_pending" | "settled" | "unknown";

export interface ArenaPrizePoolRecord {
  id: string;
  projectId: string;
  seasonId: string;
  tokenAddress: string;
  tokenSymbol: string;
  poolAddress: string;
  amountMinor: string;
  sponsorFingerprint: string;
  status: ArenaPrizePoolStatus;
  fundingTransactionHash?: string;
  fundingReceiptDigest?: string;
  winnerAgentId?: string;
  recipientFingerprint?: string;
  encryptedRecipient?: EncryptedField;
  settlementTransactionHash?: string;
  settlementReceiptDigest?: string;
  createIdempotencyKey?: string;
  createRequestDigest?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ArenaPrizeTransactionOperation = "funding" | "settlement";

export interface ArenaPrizeTransactionRecord {
  transactionHash: string;
  poolId: string;
  projectId: string;
  seasonId: string;
  operation: ArenaPrizeTransactionOperation;
  receiptDigest: string;
  authorizationDigest?: string;
  encryptedAuthorization?: EncryptedField;
  createdAt: Date;
}

export interface ProjectRepository extends ProjectKeyRepository {
  saveMember(record: ProjectMemberRecord): Promise<void>;
  getMemberRoles(projectId: string, walletFingerprint: string): Promise<ProjectRole[]>;
  saveAgreement(record: AgreementVersionRecord): Promise<void>;
  getAgreement(projectId: string, version: number): Promise<AgreementVersionRecord | undefined>;
  listAgreements(projectId: string): Promise<AgreementVersionRecord[]>;
  saveCheckpoint(record: CheckpointRecord): Promise<void>;
  getCheckpoint(id: string): Promise<CheckpointRecord | undefined>;
  listCheckpoints(projectId: string): Promise<CheckpointRecord[]>;
  saveAuditEvent(record: AuditEventRecord): Promise<void>;
  saveVerificationRun(record: VerificationRunRecord): Promise<void>;
  listVerificationRuns(checkpointId: string): Promise<VerificationRunRecord[]>;
  saveDecision(record: DecisionRecord): Promise<void>;
  getDecision(id: string): Promise<DecisionRecord | undefined>;
  getDecisionByCheckpoint(checkpointId: string): Promise<DecisionRecord | undefined>;
  getDecisionByNonce(nonce: string): Promise<DecisionRecord | undefined>;
  saveRelease(record: ReleaseRecord): Promise<void>;
  getRelease(id: string): Promise<ReleaseRecord | undefined>;
  listReleases(projectId: string): Promise<ReleaseRecord[]>;
  getReleaseBySource(kind: ReleaseKind, sourceId: string): Promise<ReleaseRecord | undefined>;
  getReleaseByIdempotencyKey(key: string): Promise<ReleaseRecord | undefined>;
  reserveReleaseBundle(input: {
    release: ReleaseRecord;
    operation: ChainOperationRecord;
    audit: AuditEventRecord;
  }): Promise<void>;
  updateRelease(record: ReleaseRecord): Promise<void>;
  saveChainOperation(record: ChainOperationRecord): Promise<void>;
  getChainOperation(releaseId: string): Promise<ChainOperationRecord | undefined>;
  updateChainOperation(record: ChainOperationRecord): Promise<void>;
  saveRevenueEvent(record: RevenueEventRecord): Promise<void>;
  getRevenueEvent(id: string): Promise<RevenueEventRecord | undefined>;
  saveSelectiveReceipt(record: SelectiveReceiptRecord): Promise<void>;
  getSelectiveReceipt(id: string): Promise<SelectiveReceiptRecord | undefined>;
  saveArenaStrategyArtifact(record: ArenaStrategyArtifactRecord): Promise<void>;
  getArenaStrategyArtifact(projectId: string, agentId: string): Promise<ArenaStrategyArtifactRecord | undefined>;
  listArenaStrategyArtifacts(projectId: string): Promise<ArenaStrategyArtifactRecord[]>;
  saveParticipantAgentPackage(record: ParticipantAgentPackageRecord): Promise<void>;
  getParticipantAgentPackage(ownerFingerprint: string, agentId: string): Promise<ParticipantAgentPackageRecord | undefined>;
  listParticipantAgentPackages(ownerFingerprint: string): Promise<ParticipantAgentPackageRecord[]>;
  saveArenaMatchReceipt(record: ArenaMatchReceiptRecord): Promise<void>;
  getArenaMatchReceipt(projectId: string, matchId: string): Promise<ArenaMatchReceiptRecord | undefined>;
  getArenaMatchReceiptByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<ArenaMatchReceiptRecord | undefined>;
  listArenaMatchReceipts(projectId: string): Promise<ArenaMatchReceiptRecord[]>;
  saveArenaMatchReveal(record: ArenaMatchRevealRecord): Promise<void>;
  getArenaMatchReveal(projectId: string, matchId: string): Promise<ArenaMatchRevealRecord | undefined>;
  getArenaMatchRevealByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<ArenaMatchRevealRecord | undefined>;
  listArenaMatchReveals(projectId: string): Promise<ArenaMatchRevealRecord[]>;
  saveArenaSeason(record: ArenaSeasonRecord): Promise<void>;
  getArenaSeason(projectId: string, seasonId: string): Promise<ArenaSeasonRecord | undefined>;
  getArenaSeasonByCreateIdempotencyKey(projectId: string, idempotencyKey: string): Promise<ArenaSeasonRecord | undefined>;
  updateArenaSeason(record: ArenaSeasonRecord): Promise<void>;
  listArenaSeasons(projectId: string): Promise<ArenaSeasonRecord[]>;
  listAllArenaSeasons(): Promise<ArenaSeasonRecord[]>;
  saveArenaSeasonEntry(record: ArenaSeasonEntryRecord): Promise<void>;
  getArenaSeasonEntry(projectId: string, seasonId: string, agentId: string): Promise<ArenaSeasonEntryRecord | undefined>;
  getArenaSeasonEntryByOwnerFingerprint(projectId: string, seasonId: string, ownerFingerprint: string): Promise<ArenaSeasonEntryRecord | undefined>;
  getArenaSeasonEntryByIdempotencyKey(projectId: string, seasonId: string, idempotencyKey: string): Promise<ArenaSeasonEntryRecord | undefined>;
  listArenaSeasonEntries(projectId: string, seasonId: string): Promise<ArenaSeasonEntryRecord[]>;
  listArenaSeasonEntriesByOwnerFingerprint(ownerFingerprint: string): Promise<ArenaSeasonEntryRecord[]>;
  listArenaEntryVersions(projectId: string, seasonId: string, entryId: string): Promise<ArenaEntryVersionRecord[]>;
  saveArenaEnrollment(input: {
    artifact: ArenaStrategyArtifactRecord;
    entry: ArenaSeasonEntryRecord;
    admission: "public" | "invite" | "system";
    audit: AuditEventRecord;
    now: Date;
  }): Promise<void>;
  replaceArenaEnrollment(input: {
    artifact: ArenaStrategyArtifactRecord;
    entry: ArenaSeasonEntryRecord;
    previousVersion: number;
    version: ArenaEntryVersionRecord;
    audit: AuditEventRecord;
    now: Date;
  }): Promise<void>;
  saveArenaScheduledMatch(record: ArenaScheduledMatchRecord): Promise<void>;
  getArenaScheduledMatch(projectId: string, seasonId: string, scheduledMatchId: string): Promise<ArenaScheduledMatchRecord | undefined>;
  listArenaScheduledMatches(projectId: string, seasonId: string): Promise<ArenaScheduledMatchRecord[]>;
  claimArenaScheduledMatch(input: {
    projectId: string;
    seasonId: string;
    scheduledMatchId: string;
    now: Date;
    leaseMs: number;
    executionIdempotencyKey: string;
    executionRequestDigest: string;
  }): Promise<ArenaScheduledMatchRecord | "IN_PROGRESS" | undefined>;
  updateArenaScheduledMatch(record: ArenaScheduledMatchRecord): Promise<void>;
  saveArenaSeasonSchedule(input: {
    season: ArenaSeasonRecord;
    matches: ArenaScheduledMatchRecord[];
    audit: AuditEventRecord;
  }): Promise<void>;
  saveArenaPrizePool(record: ArenaPrizePoolRecord): Promise<void>;
  getArenaPrizePool(projectId: string, seasonId: string): Promise<ArenaPrizePoolRecord | undefined>;
  getArenaPrizePoolByCreateIdempotencyKey(projectId: string, idempotencyKey: string): Promise<ArenaPrizePoolRecord | undefined>;
  listArenaPrizePools(projectId: string): Promise<ArenaPrizePoolRecord[]>;
  updateArenaPrizePool(record: ArenaPrizePoolRecord): Promise<void>;
  prepareArenaPrizeSettlement(input: {
    pool: ArenaPrizePoolRecord;
    audit: AuditEventRecord;
    expectedStatus: ArenaPrizePoolStatus;
  }): Promise<void>;
  getArenaPrizeTransaction(transactionHash: string): Promise<ArenaPrizeTransactionRecord | undefined>;
  confirmArenaPrizePoolTransaction(input: {
    pool: ArenaPrizePoolRecord;
    transaction: ArenaPrizeTransactionRecord;
    audit: AuditEventRecord;
    expectedStatus: ArenaPrizePoolStatus;
  }): Promise<void>;
}

function toArenaStrategyArtifactRecord(row: typeof arenaStrategyArtifacts.$inferSelect): ArenaStrategyArtifactRecord {
  if (row.status !== "sealed") throw new Error("ARENA_ARTIFACT_STATUS_INVALID");
  return {
    id: row.id,
    projectId: row.projectId,
    agentId: row.agentId,
    displayName: row.displayName,
    artifactCommitment: row.artifactCommitment,
    encryptedPolicy: row.encryptedPolicy as EncryptedField,
    ownerFingerprint: row.ownerFingerprint ?? undefined,
    encryptedOwnerWallet: row.encryptedOwnerWallet as EncryptedField | undefined,
    status: "sealed",
    createdAt: row.createdAt,
  };
}

function toParticipantAgentPackageRecord(row: typeof participantAgentPackages.$inferSelect): ParticipantAgentPackageRecord {
  return {
    id: row.id,
    ownerFingerprint: row.ownerFingerprint,
    agentId: row.agentId,
    displayName: row.displayName,
    protocolVersion: row.protocolVersion,
    engineVersion: row.engineVersion,
    ruleCount: row.ruleCount,
    artifactCommitment: row.artifactCommitment,
    encryptedPackage: row.encryptedPackage as EncryptedField,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toArenaMatchReceiptRecord(row: typeof arenaMatchReceipts.$inferSelect): ArenaMatchReceiptRecord {
  if (row.status !== "completed") throw new Error("ARENA_MATCH_STATUS_INVALID");
  return {
    id: row.id,
    projectId: row.projectId,
    leftAgentId: row.leftAgentId,
    rightAgentId: row.rightAgentId,
    leftDisplayName: row.leftDisplayName,
    rightDisplayName: row.rightDisplayName,
    publicReceipt: row.publicReceipt,
    publicHandReceipts: Array.isArray(row.publicHandReceipts) ? row.publicHandReceipts : [],
    signedReceipt: row.signedReceipt ?? undefined,
    encryptedSeed: row.encryptedSeed as EncryptedField,
    handCount: row.handCount ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    requestDigest: row.requestDigest ?? undefined,
    status: "completed",
    createdAt: row.createdAt,
  };
}

function revealPosition(value: string): ArenaMatchRevealRecord["position"] {
  if (value === "button" || value === "big_blind") return value;
  throw new Error("ARENA_REVEAL_POSITION_INVALID");
}

function revealAction(value: string): ArenaMatchRevealRecord["action"] {
  if (value === "fold" || value === "check" || value === "call" || value === "raise") return value;
  throw new Error("ARENA_REVEAL_ACTION_INVALID");
}

function toArenaMatchRevealRecord(row: typeof arenaMatchReveals.$inferSelect): ArenaMatchRevealRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    matchId: row.matchId,
    agentId: row.agentId,
    handIndex: row.handIndex,
    handNumber: row.handNumber,
    position: revealPosition(row.position),
    action: revealAction(row.action),
    seatSwapped: row.seatSwapped,
    actionCommitment: row.actionCommitment,
    handCommitment: row.handCommitment,
    transcriptRoot: row.transcriptRoot,
    publicHandReceipt: row.publicHandReceipt,
    proof: row.proof,
    idempotencyKey: row.idempotencyKey ?? undefined,
    requestDigest: row.requestDigest ?? undefined,
    createdAt: row.createdAt,
  };
}

function arenaSeasonStatus(value: string): ArenaSeasonStatus {
  if (value === "open" || value === "locked" || value === "completed" || value === "cancelled") return value;
  throw new Error("ARENA_SEASON_STATUS_INVALID");
}

function arenaSeasonEntryMode(value: string): ArenaSeasonEntryMode {
  if (value === "invite_only" || value === "open") return value;
  throw new Error("ARENA_SEASON_ENTRY_MODE_INVALID");
}

function toArenaSeasonRecord(row: typeof arenaSeasons.$inferSelect): ArenaSeasonRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    rulesetVersion: row.rulesetVersion,
    startsAt: row.startsAt,
    locksAt: row.locksAt,
    endsAt: row.endsAt,
    status: arenaSeasonStatus(row.status),
    entryMode: arenaSeasonEntryMode(row.entryMode),
    maxEntries: row.maxEntries,
    templateId: row.templateId as TournamentRules["templateId"] | undefined,
    templateVersion: row.templateVersion ?? undefined,
    rulesSnapshot: row.rulesSnapshot ? parseTournamentRules(row.rulesSnapshot) : undefined,
    rulesCommitment: row.rulesCommitment ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lockedAt: row.lockedAt ?? undefined,
    createIdempotencyKey: row.createIdempotencyKey ?? undefined,
    createRequestDigest: row.createRequestDigest ?? undefined,
    lockIdempotencyKey: row.lockIdempotencyKey ?? undefined,
    lockRequestDigest: row.lockRequestDigest ?? undefined,
  };
}

function toArenaSeasonEntryRecord(row: typeof arenaSeasonEntries.$inferSelect): ArenaSeasonEntryRecord {
  return {
    id: row.id,
    seasonId: row.seasonId,
    projectId: row.projectId,
    agentId: row.agentId,
    displayName: row.displayName,
    artifactCommitment: row.artifactCommitment,
    ownerFingerprint: row.ownerFingerprint ?? undefined,
    encryptedPayoutWallet: row.encryptedPayoutWallet as EncryptedField | undefined,
    version: row.version,
    joinedAt: row.joinedAt,
    idempotencyKey: row.idempotencyKey ?? undefined,
    requestDigest: row.requestDigest ?? undefined,
  };
}

function arenaEntryVersionStatus(value: string): ArenaEntryVersionStatus {
  if (value === "active" || value === "retired") return value;
  throw new Error("ARENA_ENTRY_VERSION_STATUS_INVALID");
}

function toArenaEntryVersionRecord(row: typeof arenaEntryVersions.$inferSelect): ArenaEntryVersionRecord {
  return {
    id: row.id,
    entryId: row.entryId,
    seasonId: row.seasonId,
    projectId: row.projectId,
    version: row.version,
    agentId: row.agentId,
    displayName: row.displayName,
    artifactCommitment: row.artifactCommitment,
    status: arenaEntryVersionStatus(row.status),
    submittedAt: row.submittedAt,
    retiredAt: row.retiredAt ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    requestDigest: row.requestDigest ?? undefined,
  };
}

function arenaScheduledMatchStatus(value: string): ArenaScheduledMatchStatus {
  if (value === "scheduled" || value === "running" || value === "completed" || value === "failed") return value;
  throw new Error("ARENA_SCHEDULED_MATCH_STATUS_INVALID");
}

function toArenaScheduledMatchRecord(row: typeof arenaScheduledMatches.$inferSelect): ArenaScheduledMatchRecord {
  return {
    id: row.id,
    seasonId: row.seasonId,
    projectId: row.projectId,
    sequence: row.sequence,
    hands: row.hands,
    leftAgentId: row.leftAgentId,
    rightAgentId: row.rightAgentId,
    status: arenaScheduledMatchStatus(row.status),
    matchId: row.matchId ?? undefined,
    attempts: row.attempts,
    executionIdempotencyKey: row.executionIdempotencyKey ?? undefined,
    executionRequestDigest: row.executionRequestDigest ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt,
  };
}

function arenaPrizePoolStatus(value: string): ArenaPrizePoolStatus {
  if (value === "funding_pending" || value === "funded" || value === "settlement_pending" || value === "settled" || value === "unknown") return value;
  throw new Error("ARENA_PRIZE_POOL_STATUS_INVALID");
}

function arenaPrizeTransactionOperation(value: string): ArenaPrizeTransactionOperation {
  if (value === "funding" || value === "settlement") return value;
  throw new Error("ARENA_PRIZE_TRANSACTION_OPERATION_INVALID");
}

function toArenaPrizeTransactionRecord(
  row: typeof arenaPrizeTransactions.$inferSelect,
): ArenaPrizeTransactionRecord {
  return {
    transactionHash: row.transactionHash,
    poolId: row.poolId,
    projectId: row.projectId,
    seasonId: row.seasonId,
    operation: arenaPrizeTransactionOperation(row.operation),
    receiptDigest: row.receiptDigest,
    authorizationDigest: row.authorizationDigest ?? undefined,
    encryptedAuthorization: row.encryptedAuthorization as EncryptedField | undefined,
    createdAt: row.createdAt,
  };
}

function databaseErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const visited = new Set<object>();
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    for (const key of ["message", "detail", "constraint", "code"]) {
      if (typeof record[key] === "string") parts.push(record[key]);
    }
    current = record.cause;
  }
  return parts.join(" ").toLowerCase();
}

function toArenaPrizePoolRecord(row: typeof arenaPrizePools.$inferSelect): ArenaPrizePoolRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    seasonId: row.seasonId,
    tokenAddress: row.tokenAddress,
    tokenSymbol: row.tokenSymbol,
    poolAddress: row.poolAddress,
    amountMinor: row.amountMinor,
    sponsorFingerprint: row.sponsorFingerprint,
    status: arenaPrizePoolStatus(row.status),
    fundingTransactionHash: row.fundingTransactionHash ?? undefined,
    fundingReceiptDigest: row.fundingReceiptDigest ?? undefined,
    winnerAgentId: row.winnerAgentId ?? undefined,
    recipientFingerprint: row.recipientFingerprint ?? undefined,
    encryptedRecipient: row.encryptedRecipient as EncryptedField | undefined,
    settlementTransactionHash: row.settlementTransactionHash ?? undefined,
    settlementReceiptDigest: row.settlementReceiptDigest ?? undefined,
    createIdempotencyKey: row.createIdempotencyKey ?? undefined,
    createRequestDigest: row.createRequestDigest ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function projectRole(value: string): ProjectRole {
  if (value === "company" || value === "contributor" || value === "reviewer" || value === "auditor") {
    return value;
  }
  throw new Error("PROJECT_ROLE_INVALID");
}

function toNonceRecord(row: typeof authNonces.$inferSelect): AuthNonceRecord {
  return {
    nonce: row.nonce,
    walletFingerprint: row.walletFingerprint,
    challenge: row.challenge as AuthChallenge,
    digest: row.digest,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? undefined,
  };
}

function toAgreementRecord(row: typeof agreementVersions.$inferSelect): AgreementVersionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    encryptedTerms: row.encryptedTerms as EncryptedField,
    termsDigest: row.termsDigest,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function toCheckpointRecord(row: typeof checkpoints.$inferSelect): CheckpointRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    agreementVersionId: row.agreementVersionId,
    sequence: row.sequence,
    encryptedPayload: row.encryptedPayload as EncryptedCheckpointPayload,
    payloadDigest: row.payloadDigest,
    status: row.status as CheckpointRecord["status"],
    createdBy: row.createdBy,
    assignedReviewerFingerprint: row.assignedReviewerFingerprint ?? undefined,
    createdAt: row.createdAt,
  };
}

function verificationRunStatus(value: string): VerificationRunStatus {
  if (value === "completed" || value === "unavailable" || value === "rejected") return value;
  throw new Error("VERIFICATION_RUN_STATUS_INVALID");
}

function toVerificationRunRecord(row: typeof verificationRuns.$inferSelect): VerificationRunRecord {
  return {
    id: row.id,
    checkpointId: row.checkpointId,
    verifierFingerprint: row.verifierFingerprint,
    status: verificationRunStatus(row.status),
    result: row.result ?? undefined,
    createdAt: row.createdAt,
  };
}

function decisionKind(value: string): DecisionKind {
  if (value === "accept" || value === "reject") return value;
  throw new Error("DECISION_KIND_INVALID");
}

function releaseKind(value: string): ReleaseKind {
  if (value === "milestone" || value === "royalty") return value;
  throw new Error("RELEASE_KIND_INVALID");
}

function releaseStatus(value: string): ReleaseStatus {
  if (value === "prepared" || value === "wallet_prompted" || value === "submitted" || value === "unknown" || value === "confirmed" || value === "reverted") {
    return value;
  }
  throw new Error("RELEASE_STATUS_INVALID");
}

function toDecisionRecord(row: typeof decisions.$inferSelect): DecisionRecord {
  if (row.schemaVersion !== 1) throw new Error("DECISION_SCHEMA_UNSUPPORTED");
  const signature = row.signature;
  if (!Array.isArray(signature) || !signature.every((item): item is string => typeof item === "string")) {
    throw new Error("DECISION_SIGNATURE_INVALID");
  }
  return {
    id: row.id,
    checkpointId: row.checkpointId,
    schemaVersion: 1,
    projectId: row.projectId,
    agreementVersion: row.agreementVersion,
    agreementDigest: row.agreementDigest,
    checkpointDigest: row.checkpointDigest,
    verificationDigest: row.verificationDigest,
    decision: decisionKind(row.decision),
    releaseAmountMinor: row.releaseAmountMinor ?? undefined,
    nonce: row.nonce,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    signature,
    decidedBy: row.decidedBy,
    createdAt: row.createdAt,
  };
}

function toReleaseRecord(row: typeof releases.$inferSelect): ReleaseRecord {
  return {
    id: row.id,
    kind: releaseKind(row.kind),
    sourceId: row.sourceId,
    projectId: row.projectId,
    decisionId: row.decisionId,
    amountMinor: row.amountMinor,
    idempotencyKey: row.idempotencyKey,
    status: releaseStatus(row.status),
    createdAt: row.createdAt,
  };
}

function chainOperationStatus(value: string): ChainOperationStatus {
  return releaseStatus(value);
}

function toChainOperationRecord(row: typeof chainOperations.$inferSelect): ChainOperationRecord {
  return {
    id: row.id,
    releaseId: row.releaseId,
    operationType: row.operationType as ChainOperationRecord["operationType"],
    status: chainOperationStatus(row.status),
    transactionHash: row.transactionHash ?? undefined,
    receiptDigest: row.receiptDigest ?? undefined,
    reason: row.reason ?? undefined,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

function toRevenueEventRecord(row: typeof revenueEvents.$inferSelect): RevenueEventRecord {
  const encryptedAmount = JSON.parse(row.amount) as EncryptedField;
  return {
    id: row.id,
    projectId: row.projectId,
    eventType: row.eventType as RevenueEventRecord["eventType"],
    encryptedAmount,
    currency: row.currency as RevenueEventRecord["currency"],
    createdAt: row.createdAt,
  };
}

function receiptType(value: string): SelectiveReceiptRecord["receiptType"] {
  if (value === "company" || value === "contributor" || value === "auditor") return value;
  throw new Error("RECEIPT_TYPE_INVALID");
}

function toSelectiveReceiptRecord(row: typeof selectiveReceipts.$inferSelect): SelectiveReceiptRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    checkpointId: row.checkpointId ?? undefined,
    receiptType: receiptType(row.receiptType),
    encryptedPayload: row.encryptedPayload as EncryptedField,
    proof: row.proof,
    revoked: row.revoked,
    createdAt: row.createdAt,
  };
}

export function createPostgresRepositories(db: VeilapDatabase): {
  nonces: AuthNonceRepository;
  sessions: SessionRepository;
  projects: ProjectRepository;
} {
  return {
    nonces: {
      async saveNonce(record) {
        await db.insert(authNonces).values({
          nonce: record.nonce,
          walletFingerprint: record.walletFingerprint,
          challenge: record.challenge,
          digest: record.digest,
          expiresAt: record.expiresAt,
          consumedAt: record.consumedAt,
        });
      },
      async getNonce(nonce) {
        const rows = await db.select().from(authNonces).where(eq(authNonces.nonce, nonce)).limit(1);
        return rows[0] ? toNonceRecord(rows[0]) : undefined;
      },
      async consumeNonce(nonce, now) {
        const rows = await db
          .update(authNonces)
          .set({ consumedAt: now })
          .where(
            and(
              eq(authNonces.nonce, nonce),
              isNull(authNonces.consumedAt),
              gt(authNonces.expiresAt, now),
            ),
          )
          .returning();
        if (rows[0]) return toNonceRecord(rows[0]);
        const existing = await this.getNonce(nonce);
        return existing?.consumedAt ? "REPLAYED" : undefined;
      },
    },
    sessions: {
      async saveSession(record) {
        await db.insert(authSessions).values(record);
      },
      async getSession(id) {
        const rows = await db.select().from(authSessions).where(eq(authSessions.id, id)).limit(1);
        const record = rows[0];
        if (!record) return undefined;
        return {
          id: record.id,
          walletFingerprint: record.walletFingerprint,
          issuedAt: record.issuedAt,
          expiresAt: record.expiresAt,
          revokedAt: record.revokedAt ?? undefined,
        };
      },
      async revokeSession(id, now) {
        await db
          .update(authSessions)
          .set({ revokedAt: now })
          .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
      },
    },
    projects: {
      async saveProject(record) {
        await db.insert(projects).values(record);
      },
      async getProject(id) {
        const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
        return rows[0];
      },
      async saveMember(record) {
        await db.insert(projectMembers).values(record);
      },
      async getMemberRoles(projectId, walletFingerprint) {
        const rows = await db
          .select({ role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.walletFingerprint, walletFingerprint)));
        return rows.map((row) => projectRole(row.role));
      },
      async saveAgreement(record) {
        await db.insert(agreementVersions).values(record);
      },
      async getAgreement(projectId, version) {
        const rows = await db
          .select()
          .from(agreementVersions)
          .where(and(eq(agreementVersions.projectId, projectId), eq(agreementVersions.version, version)))
          .limit(1);
        return rows[0] ? toAgreementRecord(rows[0]) : undefined;
      },
      async listAgreements(projectId) {
        const rows = await db
          .select()
          .from(agreementVersions)
          .where(eq(agreementVersions.projectId, projectId))
          .orderBy(asc(agreementVersions.version));
        return rows.map(toAgreementRecord);
      },
      async saveCheckpoint(record) {
        await db.insert(checkpoints).values({
          ...record,
          assignedReviewerFingerprint: record.assignedReviewerFingerprint ?? null,
        });
      },
      async getCheckpoint(id) {
        const rows = await db.select().from(checkpoints).where(eq(checkpoints.id, id)).limit(1);
        return rows[0] ? toCheckpointRecord(rows[0]) : undefined;
      },
      async listCheckpoints(projectId) {
        const rows = await db
          .select()
          .from(checkpoints)
          .where(eq(checkpoints.projectId, projectId))
          .orderBy(asc(checkpoints.sequence));
        return rows.map(toCheckpointRecord);
      },
      async saveAuditEvent(record) {
        await db.insert(auditEvents).values(record);
      },
      async saveVerificationRun(record) {
        await db.insert(verificationRuns).values({
          ...record,
          result: record.result ?? null,
        });
      },
      async listVerificationRuns(checkpointId) {
        const rows = await db
          .select()
          .from(verificationRuns)
          .where(eq(verificationRuns.checkpointId, checkpointId))
          .orderBy(asc(verificationRuns.createdAt));
        return rows.map(toVerificationRunRecord);
      },
      async saveDecision(record) {
        await db.insert(decisions).values(record);
      },
      async getDecision(id) {
        const rows = await db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
        return rows[0] ? toDecisionRecord(rows[0]) : undefined;
      },
      async getDecisionByCheckpoint(checkpointId) {
        const rows = await db.select().from(decisions).where(eq(decisions.checkpointId, checkpointId)).limit(1);
        return rows[0] ? toDecisionRecord(rows[0]) : undefined;
      },
      async getDecisionByNonce(nonce) {
        const rows = await db.select().from(decisions).where(eq(decisions.nonce, nonce)).limit(1);
        return rows[0] ? toDecisionRecord(rows[0]) : undefined;
      },
      async saveRelease(record) {
        await db.insert(releases).values(record);
      },
      async getRelease(id) {
        const rows = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
        return rows[0] ? toReleaseRecord(rows[0]) : undefined;
      },
      async listReleases(projectId) {
        const rows = await db.select().from(releases).where(eq(releases.projectId, projectId)).orderBy(asc(releases.createdAt));
        return rows.map(toReleaseRecord);
      },
      async getReleaseBySource(kind, sourceId) {
        const rows = await db
          .select()
          .from(releases)
          .where(and(eq(releases.kind, kind), eq(releases.sourceId, sourceId)))
          .limit(1);
        return rows[0] ? toReleaseRecord(rows[0]) : undefined;
      },
      async getReleaseByIdempotencyKey(key) {
        const rows = await db.select().from(releases).where(eq(releases.idempotencyKey, key)).limit(1);
        return rows[0] ? toReleaseRecord(rows[0]) : undefined;
      },
      async reserveReleaseBundle(input) {
        await db.transaction(async (tx) => {
          const existing = await tx
            .select({ id: releases.id })
            .from(releases)
            .where(and(eq(releases.kind, input.release.kind), eq(releases.sourceId, input.release.sourceId)))
            .limit(1);
          if (existing[0]) throw new Error("RELEASE_SOURCE_ALREADY_EXISTS");
          await tx.insert(releases).values(input.release);
          await tx.insert(chainOperations).values({
            ...input.operation,
            transactionHash: input.operation.transactionHash ?? null,
            receiptDigest: input.operation.receiptDigest ?? null,
            reason: input.operation.reason ?? null,
          });
          await tx.insert(auditEvents).values(input.audit);
        });
      },
      async updateRelease(record) {
        await db
          .update(releases)
          .set({ status: record.status })
          .where(eq(releases.id, record.id));
      },
      async saveChainOperation(record) {
        await db.insert(chainOperations).values({
          ...record,
          transactionHash: record.transactionHash ?? null,
          receiptDigest: record.receiptDigest ?? null,
          reason: record.reason ?? null,
        });
      },
      async getChainOperation(releaseId) {
        const rows = await db.select().from(chainOperations).where(eq(chainOperations.releaseId, releaseId)).limit(1);
        return rows[0] ? toChainOperationRecord(rows[0]) : undefined;
      },
      async updateChainOperation(record) {
        await db
          .update(chainOperations)
          .set({
            status: record.status,
            transactionHash: record.transactionHash ?? null,
            receiptDigest: record.receiptDigest ?? null,
            reason: record.reason ?? null,
            updatedAt: record.updatedAt,
          })
          .where(eq(chainOperations.id, record.id));
      },
      async saveRevenueEvent(record) {
        await db.insert(revenueEvents).values({
          id: record.id,
          projectId: record.projectId,
          eventType: record.eventType,
          amount: JSON.stringify(record.encryptedAmount),
          currency: record.currency,
          createdAt: record.createdAt,
        });
      },
      async getRevenueEvent(id) {
        const rows = await db.select().from(revenueEvents).where(eq(revenueEvents.id, id)).limit(1);
        return rows[0] ? toRevenueEventRecord(rows[0]) : undefined;
      },
      async saveSelectiveReceipt(record) {
        await db.insert(selectiveReceipts).values({
          id: record.id,
          projectId: record.projectId,
          checkpointId: record.checkpointId ?? null,
          receiptType: record.receiptType,
          encryptedPayload: record.encryptedPayload,
          proof: record.proof,
          revoked: record.revoked,
          createdAt: record.createdAt,
        });
      },
      async getSelectiveReceipt(id) {
        const rows = await db.select().from(selectiveReceipts).where(eq(selectiveReceipts.id, id)).limit(1);
        return rows[0] ? toSelectiveReceiptRecord(rows[0]) : undefined;
      },
      async saveArenaStrategyArtifact(record) {
        await db.insert(arenaStrategyArtifacts).values({
          ...record,
          encryptedPolicy: record.encryptedPolicy,
        });
      },
      async getArenaStrategyArtifact(projectId, agentId) {
        const rows = await db
          .select()
          .from(arenaStrategyArtifacts)
          .where(and(eq(arenaStrategyArtifacts.projectId, projectId), eq(arenaStrategyArtifacts.agentId, agentId)))
          .limit(1);
        return rows[0] ? toArenaStrategyArtifactRecord(rows[0]) : undefined;
      },
      async listArenaStrategyArtifacts(projectId) {
        const rows = await db
          .select()
          .from(arenaStrategyArtifacts)
          .where(eq(arenaStrategyArtifacts.projectId, projectId))
          .orderBy(asc(arenaStrategyArtifacts.createdAt));
        return rows.map(toArenaStrategyArtifactRecord);
      },
      async saveParticipantAgentPackage(record) {
        await db
          .insert(participantAgentPackages)
          .values({
            ...record,
            encryptedPackage: record.encryptedPackage,
          })
          .onConflictDoUpdate({
            target: [participantAgentPackages.ownerFingerprint, participantAgentPackages.agentId],
            set: {
              displayName: record.displayName,
              protocolVersion: record.protocolVersion,
              engineVersion: record.engineVersion,
              ruleCount: record.ruleCount,
              artifactCommitment: record.artifactCommitment,
              encryptedPackage: record.encryptedPackage,
              version: record.version,
              updatedAt: record.updatedAt,
            },
          });
      },
      async getParticipantAgentPackage(ownerFingerprint, agentId) {
        const rows = await db
          .select()
          .from(participantAgentPackages)
          .where(and(
            eq(participantAgentPackages.ownerFingerprint, ownerFingerprint),
            eq(participantAgentPackages.agentId, agentId),
          ))
          .limit(1);
        return rows[0] ? toParticipantAgentPackageRecord(rows[0]) : undefined;
      },
      async listParticipantAgentPackages(ownerFingerprint) {
        const rows = await db
          .select()
          .from(participantAgentPackages)
          .where(eq(participantAgentPackages.ownerFingerprint, ownerFingerprint))
          .orderBy(desc(participantAgentPackages.updatedAt));
        return rows.map(toParticipantAgentPackageRecord);
      },
      async saveArenaMatchReceipt(record) {
        await db.insert(arenaMatchReceipts).values({
          id: record.id,
          projectId: record.projectId,
          leftAgentId: record.leftAgentId,
          rightAgentId: record.rightAgentId,
          leftDisplayName: record.leftDisplayName,
          rightDisplayName: record.rightDisplayName,
          publicReceipt: record.publicReceipt,
          publicHandReceipts: record.publicHandReceipts ?? [],
          signedReceipt: record.signedReceipt ?? null,
          encryptedSeed: record.encryptedSeed,
          handCount: record.handCount ?? null,
          idempotencyKey: record.idempotencyKey ?? null,
          requestDigest: record.requestDigest ?? null,
          status: record.status,
          createdAt: record.createdAt,
        });
      },
      async getArenaMatchReceipt(projectId, matchId) {
        const rows = await db
          .select()
          .from(arenaMatchReceipts)
          .where(and(eq(arenaMatchReceipts.projectId, projectId), eq(arenaMatchReceipts.id, matchId)))
          .limit(1);
        return rows[0] ? toArenaMatchReceiptRecord(rows[0]) : undefined;
      },
      async getArenaMatchReceiptByIdempotencyKey(projectId, idempotencyKey) {
        const rows = await db
          .select()
          .from(arenaMatchReceipts)
          .where(and(eq(arenaMatchReceipts.projectId, projectId), eq(arenaMatchReceipts.idempotencyKey, idempotencyKey)))
          .limit(1);
        return rows[0] ? toArenaMatchReceiptRecord(rows[0]) : undefined;
      },
      async listArenaMatchReceipts(projectId) {
        const rows = await db
          .select()
          .from(arenaMatchReceipts)
          .where(eq(arenaMatchReceipts.projectId, projectId))
          .orderBy(asc(arenaMatchReceipts.createdAt));
        return rows.map(toArenaMatchReceiptRecord);
      },
      async saveArenaMatchReveal(record) {
        await db.insert(arenaMatchReveals).values({
          id: record.id,
          projectId: record.projectId,
          matchId: record.matchId,
          agentId: record.agentId,
          handIndex: record.handIndex,
          handNumber: record.handNumber,
          position: record.position,
          action: record.action,
          seatSwapped: record.seatSwapped,
          actionCommitment: record.actionCommitment,
          handCommitment: record.handCommitment,
          transcriptRoot: record.transcriptRoot,
          publicHandReceipt: record.publicHandReceipt,
          proof: record.proof,
          idempotencyKey: record.idempotencyKey ?? null,
          requestDigest: record.requestDigest ?? null,
          createdAt: record.createdAt,
        });
      },
      async getArenaMatchReveal(projectId, matchId) {
        const rows = await db
          .select()
          .from(arenaMatchReveals)
          .where(and(eq(arenaMatchReveals.projectId, projectId), eq(arenaMatchReveals.matchId, matchId)))
          .limit(1);
        return rows[0] ? toArenaMatchRevealRecord(rows[0]) : undefined;
      },
      async getArenaMatchRevealByIdempotencyKey(projectId, idempotencyKey) {
        const rows = await db
          .select()
          .from(arenaMatchReveals)
          .where(and(eq(arenaMatchReveals.projectId, projectId), eq(arenaMatchReveals.idempotencyKey, idempotencyKey)))
          .limit(1);
        return rows[0] ? toArenaMatchRevealRecord(rows[0]) : undefined;
      },
      async listArenaMatchReveals(projectId) {
        const rows = await db
          .select()
          .from(arenaMatchReveals)
          .where(eq(arenaMatchReveals.projectId, projectId))
          .orderBy(asc(arenaMatchReveals.createdAt));
        return rows.map(toArenaMatchRevealRecord);
      },
      async saveArenaSeason(record) {
        await db.insert(arenaSeasons).values({
          ...record,
          entryMode: record.entryMode ?? "invite_only",
          maxEntries: record.maxEntries ?? 16,
          templateId: record.templateId ?? null,
          templateVersion: record.templateVersion ?? null,
          rulesSnapshot: record.rulesSnapshot ?? null,
          rulesCommitment: record.rulesCommitment ?? null,
          lockedAt: record.lockedAt ?? null,
          createIdempotencyKey: record.createIdempotencyKey ?? null,
          createRequestDigest: record.createRequestDigest ?? null,
          lockIdempotencyKey: record.lockIdempotencyKey ?? null,
          lockRequestDigest: record.lockRequestDigest ?? null,
        });
      },
      async getArenaSeason(projectId, seasonId) {
        const rows = await db
          .select()
          .from(arenaSeasons)
          .where(and(eq(arenaSeasons.projectId, projectId), eq(arenaSeasons.id, seasonId)))
          .limit(1);
        return rows[0] ? toArenaSeasonRecord(rows[0]) : undefined;
      },
      async getArenaSeasonByCreateIdempotencyKey(projectId, idempotencyKey) {
        const rows = await db
          .select()
          .from(arenaSeasons)
          .where(and(eq(arenaSeasons.projectId, projectId), eq(arenaSeasons.createIdempotencyKey, idempotencyKey)))
          .limit(1);
        return rows[0] ? toArenaSeasonRecord(rows[0]) : undefined;
      },
      async updateArenaSeason(record) {
        await db
          .update(arenaSeasons)
          .set({
            status: record.status,
            lockedAt: record.lockedAt ?? null,
            lockIdempotencyKey: record.lockIdempotencyKey ?? null,
            lockRequestDigest: record.lockRequestDigest ?? null,
          })
          .where(and(eq(arenaSeasons.projectId, record.projectId), eq(arenaSeasons.id, record.id)));
      },
      async listArenaSeasons(projectId) {
        const rows = await db
          .select()
          .from(arenaSeasons)
          .where(eq(arenaSeasons.projectId, projectId))
          .orderBy(asc(arenaSeasons.createdAt));
        return rows.map(toArenaSeasonRecord);
      },
      async listAllArenaSeasons() {
        const rows = await db
          .select()
          .from(arenaSeasons)
          .orderBy(desc(arenaSeasons.createdAt));
        return rows.map(toArenaSeasonRecord);
      },
      async saveArenaSeasonEntry(record) {
        await db.transaction(async (tx) => {
          await tx.insert(arenaSeasonEntries).values({
            ...record,
            ownerFingerprint: record.ownerFingerprint ?? null,
            encryptedPayoutWallet: record.encryptedPayoutWallet ?? null,
            idempotencyKey: record.idempotencyKey ?? null,
            requestDigest: record.requestDigest ?? null,
          });
          await tx.insert(arenaEntryVersions).values({
            id: `${record.id}:v${record.version}`,
            entryId: record.id,
            seasonId: record.seasonId,
            projectId: record.projectId,
            version: record.version,
            agentId: record.agentId,
            displayName: record.displayName,
            artifactCommitment: record.artifactCommitment,
            status: "active",
            submittedAt: record.joinedAt,
            retiredAt: null,
            idempotencyKey: record.idempotencyKey ?? null,
            requestDigest: record.requestDigest ?? null,
          });
        });
      },
      async getArenaSeasonEntry(projectId, seasonId, agentId) {
        const rows = await db
          .select()
          .from(arenaSeasonEntries)
          .where(and(
            eq(arenaSeasonEntries.projectId, projectId),
            eq(arenaSeasonEntries.seasonId, seasonId),
            eq(arenaSeasonEntries.agentId, agentId),
          ))
          .limit(1);
        return rows[0] ? toArenaSeasonEntryRecord(rows[0]) : undefined;
      },
      async getArenaSeasonEntryByOwnerFingerprint(projectId, seasonId, ownerFingerprint) {
        const rows = await db
          .select()
          .from(arenaSeasonEntries)
          .where(and(
            eq(arenaSeasonEntries.projectId, projectId),
            eq(arenaSeasonEntries.seasonId, seasonId),
            eq(arenaSeasonEntries.ownerFingerprint, ownerFingerprint),
          ))
          .limit(1);
        return rows[0] ? toArenaSeasonEntryRecord(rows[0]) : undefined;
      },
      async getArenaSeasonEntryByIdempotencyKey(projectId, seasonId, idempotencyKey) {
        const rows = await db
          .select()
          .from(arenaSeasonEntries)
          .where(and(
            eq(arenaSeasonEntries.projectId, projectId),
            eq(arenaSeasonEntries.seasonId, seasonId),
            eq(arenaSeasonEntries.idempotencyKey, idempotencyKey),
          ))
          .limit(1);
        return rows[0] ? toArenaSeasonEntryRecord(rows[0]) : undefined;
      },
      async listArenaSeasonEntries(projectId, seasonId) {
        const rows = await db
          .select()
          .from(arenaSeasonEntries)
          .where(and(eq(arenaSeasonEntries.projectId, projectId), eq(arenaSeasonEntries.seasonId, seasonId)))
          .orderBy(asc(arenaSeasonEntries.joinedAt));
        return rows.map(toArenaSeasonEntryRecord);
      },
      async listArenaSeasonEntriesByOwnerFingerprint(ownerFingerprint) {
        const rows = await db
          .select()
          .from(arenaSeasonEntries)
          .where(eq(arenaSeasonEntries.ownerFingerprint, ownerFingerprint))
          .orderBy(desc(arenaSeasonEntries.joinedAt));
        return rows.map(toArenaSeasonEntryRecord);
      },
      async listArenaEntryVersions(projectId, seasonId, entryId) {
        const rows = await db
          .select()
          .from(arenaEntryVersions)
          .where(and(
            eq(arenaEntryVersions.projectId, projectId),
            eq(arenaEntryVersions.seasonId, seasonId),
            eq(arenaEntryVersions.entryId, entryId),
          ))
          .orderBy(asc(arenaEntryVersions.version));
        return rows.map(toArenaEntryVersionRecord);
      },
      async saveArenaEnrollment(input) {
        try {
          await db.transaction(async (tx) => {
            const seasons = await tx
              .select()
              .from(arenaSeasons)
              .where(and(
                eq(arenaSeasons.projectId, input.entry.projectId),
                eq(arenaSeasons.id, input.entry.seasonId),
              ))
              .limit(1)
              .for("update");
            const season = seasons[0];
            if (!season) throw new Error("ARENA_SEASON_NOT_FOUND");
            if (season.status !== "open") throw new Error("ARENA_SEASON_NOT_OPEN");
            const admissionAllowed = season.entryMode === "open"
              ? input.admission === "public"
              : input.admission === "invite" || input.admission === "system";
            if (!admissionAllowed) throw new Error("ARENA_SEASON_NOT_PUBLIC");
            if (input.now < season.startsAt) throw new Error("ARENA_SEASON_NOT_STARTED");
            if (input.now >= season.locksAt) throw new Error("ARENA_SEASON_CLOSED");
            const totals = await tx
              .select({ value: count() })
              .from(arenaSeasonEntries)
              .where(and(
                eq(arenaSeasonEntries.projectId, input.entry.projectId),
                eq(arenaSeasonEntries.seasonId, input.entry.seasonId),
              ));
            if (Number(totals[0]?.value ?? 0) >= season.maxEntries) throw new Error("ARENA_SEASON_FULL");
            await tx.insert(arenaStrategyArtifacts).values({
              ...input.artifact,
              ownerFingerprint: input.artifact.ownerFingerprint ?? null,
              encryptedOwnerWallet: input.artifact.encryptedOwnerWallet ?? null,
            });
            await tx.insert(arenaSeasonEntries).values({
              ...input.entry,
              ownerFingerprint: input.entry.ownerFingerprint ?? null,
              encryptedPayoutWallet: input.entry.encryptedPayoutWallet ?? null,
              idempotencyKey: input.entry.idempotencyKey ?? null,
              requestDigest: input.entry.requestDigest ?? null,
            });
            await tx.insert(arenaEntryVersions).values({
              id: `${input.entry.id}:v${input.entry.version}`,
              entryId: input.entry.id,
              seasonId: input.entry.seasonId,
              projectId: input.entry.projectId,
              version: input.entry.version,
              agentId: input.entry.agentId,
              displayName: input.entry.displayName,
              artifactCommitment: input.entry.artifactCommitment,
              status: "active",
              submittedAt: input.now,
              retiredAt: null,
              idempotencyKey: input.entry.idempotencyKey ?? null,
              requestDigest: input.entry.requestDigest ?? null,
            });
            await tx.insert(auditEvents).values(input.audit);
          });
        } catch (error) {
          const message = databaseErrorText(error);
          if (message.includes("arena_season_entries_season_owner_idx")) throw new Error("ARENA_WALLET_ALREADY_ENTERED");
          if (message.includes("arena_season_entries_season_agent_idx")) throw new Error("ARENA_SEASON_ENTRY_AGENT_ALREADY_EXISTS");
          if (message.includes("arena_strategy_artifacts_project_agent_idx")) throw new Error("ARENA_ARTIFACT_ALREADY_EXISTS");
          if (message.includes("arena_season_entries_season_idempotency_idx")) throw new Error("ARENA_SEASON_ENTRY_IDEMPOTENCY_ALREADY_EXISTS");
          throw error;
        }
      },
      async replaceArenaEnrollment(input) {
        try {
          await db.transaction(async (tx) => {
            const seasons = await tx
              .select()
              .from(arenaSeasons)
              .where(and(
                eq(arenaSeasons.projectId, input.entry.projectId),
                eq(arenaSeasons.id, input.entry.seasonId),
              ))
              .limit(1)
              .for("update");
            const season = seasons[0];
            if (!season) throw new Error("ARENA_SEASON_NOT_FOUND");
            if (season.status !== "open") throw new Error("ARENA_SEASON_NOT_OPEN");
            if (season.entryMode !== "open") throw new Error("ARENA_SEASON_NOT_PUBLIC");
            if (input.now < season.startsAt) throw new Error("ARENA_SEASON_NOT_STARTED");
            if (input.now >= season.locksAt) throw new Error("ARENA_SEASON_CLOSED");
            const rules = season.rulesSnapshot ? parseTournamentRules(season.rulesSnapshot) : undefined;
            if (rules?.resubmissionPolicy !== "replace_until_lock") {
              throw new Error("ARENA_RESUBMISSION_FORBIDDEN");
            }

            const currentRows = await tx
              .select()
              .from(arenaSeasonEntries)
              .where(and(
                eq(arenaSeasonEntries.id, input.entry.id),
                eq(arenaSeasonEntries.projectId, input.entry.projectId),
                eq(arenaSeasonEntries.seasonId, input.entry.seasonId),
              ))
              .limit(1)
              .for("update");
            const current = currentRows[0];
            if (!current) throw new Error("ARENA_SEASON_ENTRY_NOT_FOUND");
            if (current.ownerFingerprint !== input.entry.ownerFingerprint) throw new Error("ARENA_ENTRY_OWNER_MISMATCH");
            if (current.version !== input.previousVersion) throw new Error("ARENA_ENTRY_VERSION_CONFLICT");

            await tx.insert(arenaStrategyArtifacts).values({
              ...input.artifact,
              ownerFingerprint: input.artifact.ownerFingerprint ?? null,
              encryptedOwnerWallet: input.artifact.encryptedOwnerWallet ?? null,
            });
            const retired = await tx
              .update(arenaEntryVersions)
              .set({ status: "retired", retiredAt: input.now })
              .where(and(
                eq(arenaEntryVersions.entryId, input.entry.id),
                eq(arenaEntryVersions.version, input.previousVersion),
                eq(arenaEntryVersions.status, "active"),
              ))
              .returning({ id: arenaEntryVersions.id });
            if (retired.length !== 1) throw new Error("ARENA_ENTRY_VERSION_CONFLICT");

            const updated = await tx
              .update(arenaSeasonEntries)
              .set({
                agentId: input.entry.agentId,
                displayName: input.entry.displayName,
                artifactCommitment: input.entry.artifactCommitment,
                encryptedPayoutWallet: input.entry.encryptedPayoutWallet ?? null,
                version: input.entry.version,
                idempotencyKey: input.entry.idempotencyKey ?? null,
                requestDigest: input.entry.requestDigest ?? null,
              })
              .where(and(
                eq(arenaSeasonEntries.id, input.entry.id),
                eq(arenaSeasonEntries.version, input.previousVersion),
              ))
              .returning({ id: arenaSeasonEntries.id });
            if (updated.length !== 1) throw new Error("ARENA_ENTRY_VERSION_CONFLICT");

            await tx.insert(arenaEntryVersions).values({
              ...input.version,
              retiredAt: input.version.retiredAt ?? null,
              idempotencyKey: input.version.idempotencyKey ?? null,
              requestDigest: input.version.requestDigest ?? null,
            });
            await tx.insert(auditEvents).values(input.audit);
          });
        } catch (error) {
          const message = databaseErrorText(error);
          if (message.includes("arena_strategy_artifacts_project_agent_idx")) throw new Error("ARENA_ARTIFACT_ALREADY_EXISTS");
          if (message.includes("arena_entry_versions_season_idempotency_idx")) throw new Error("ARENA_SEASON_ENTRY_IDEMPOTENCY_ALREADY_EXISTS");
          if (message.includes("arena_entry_versions_one_active_idx")) throw new Error("ARENA_ENTRY_VERSION_CONFLICT");
          if (message.includes("arena_season_entries_season_agent_idx")) throw new Error("ARENA_SEASON_ENTRY_AGENT_ALREADY_EXISTS");
          throw error;
        }
      },
      async saveArenaScheduledMatch(record) {
        await db.insert(arenaScheduledMatches).values({
          ...record,
          matchId: record.matchId ?? null,
          executionIdempotencyKey: record.executionIdempotencyKey ?? null,
          executionRequestDigest: record.executionRequestDigest ?? null,
          leaseExpiresAt: record.leaseExpiresAt ?? null,
          startedAt: record.startedAt ?? null,
          completedAt: record.completedAt ?? null,
          lastError: record.lastError ?? null,
        });
      },
      async getArenaScheduledMatch(projectId, seasonId, scheduledMatchId) {
        const rows = await db
          .select()
          .from(arenaScheduledMatches)
          .where(and(
            eq(arenaScheduledMatches.projectId, projectId),
            eq(arenaScheduledMatches.seasonId, seasonId),
            eq(arenaScheduledMatches.id, scheduledMatchId),
          ))
          .limit(1);
        return rows[0] ? toArenaScheduledMatchRecord(rows[0]) : undefined;
      },
      async listArenaScheduledMatches(projectId, seasonId) {
        const rows = await db
          .select()
          .from(arenaScheduledMatches)
          .where(and(eq(arenaScheduledMatches.projectId, projectId), eq(arenaScheduledMatches.seasonId, seasonId)))
          .orderBy(asc(arenaScheduledMatches.sequence));
        return rows.map(toArenaScheduledMatchRecord);
      },
      async claimArenaScheduledMatch(input) {
        const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs);
        const rows = await db
          .update(arenaScheduledMatches)
          .set({
            status: "running",
            attempts: sql`${arenaScheduledMatches.attempts} + 1`,
            executionIdempotencyKey: input.executionIdempotencyKey,
            executionRequestDigest: input.executionRequestDigest,
            leaseExpiresAt,
            startedAt: input.now,
            lastError: null,
          })
          .where(and(
            eq(arenaScheduledMatches.projectId, input.projectId),
            eq(arenaScheduledMatches.seasonId, input.seasonId),
            eq(arenaScheduledMatches.id, input.scheduledMatchId),
            or(
              eq(arenaScheduledMatches.status, "scheduled"),
              eq(arenaScheduledMatches.status, "failed"),
              and(eq(arenaScheduledMatches.status, "running"), lt(arenaScheduledMatches.leaseExpiresAt, input.now)),
            ),
          ))
          .returning();
        if (rows[0]) return toArenaScheduledMatchRecord(rows[0]);
        const current = await this.getArenaScheduledMatch(input.projectId, input.seasonId, input.scheduledMatchId);
        if (current?.status === "completed") return current;
        if (current?.status === "running") return "IN_PROGRESS";
        return undefined;
      },
      async updateArenaScheduledMatch(record) {
        await db
          .update(arenaScheduledMatches)
          .set({
            status: record.status,
            matchId: record.matchId ?? null,
            attempts: record.attempts,
            executionIdempotencyKey: record.executionIdempotencyKey ?? null,
            executionRequestDigest: record.executionRequestDigest ?? null,
            leaseExpiresAt: record.leaseExpiresAt ?? null,
            startedAt: record.startedAt ?? null,
            completedAt: record.completedAt ?? null,
            lastError: record.lastError ?? null,
          })
          .where(and(eq(arenaScheduledMatches.projectId, record.projectId), eq(arenaScheduledMatches.id, record.id)));
      },
      async saveArenaSeasonSchedule(input) {
        await db.transaction(async (tx) => {
          const updated = await tx
            .update(arenaSeasons)
            .set({
              status: "locked",
              lockedAt: input.season.lockedAt ?? null,
              lockIdempotencyKey: input.season.lockIdempotencyKey ?? null,
              lockRequestDigest: input.season.lockRequestDigest ?? null,
            })
            .where(and(
              eq(arenaSeasons.projectId, input.season.projectId),
              eq(arenaSeasons.id, input.season.id),
              eq(arenaSeasons.status, "open"),
            ))
            .returning({ id: arenaSeasons.id });
          if (!updated[0]) throw new Error("ARENA_SEASON_NOT_OPEN");
          if (input.matches.length > 0) {
            await tx.insert(arenaScheduledMatches).values(input.matches);
          }
          await tx.insert(auditEvents).values(input.audit);
        });
      },
      async saveArenaPrizePool(record) {
        await db.insert(arenaPrizePools).values({
          ...record,
          fundingTransactionHash: record.fundingTransactionHash ?? null,
          fundingReceiptDigest: record.fundingReceiptDigest ?? null,
          winnerAgentId: record.winnerAgentId ?? null,
          recipientFingerprint: record.recipientFingerprint ?? null,
          encryptedRecipient: record.encryptedRecipient ?? null,
          settlementTransactionHash: record.settlementTransactionHash ?? null,
          settlementReceiptDigest: record.settlementReceiptDigest ?? null,
          createIdempotencyKey: record.createIdempotencyKey ?? null,
          createRequestDigest: record.createRequestDigest ?? null,
        });
      },
      async getArenaPrizePool(projectId, seasonId) {
        const rows = await db
          .select()
          .from(arenaPrizePools)
          .where(and(eq(arenaPrizePools.projectId, projectId), eq(arenaPrizePools.seasonId, seasonId)))
          .limit(1);
        return rows[0] ? toArenaPrizePoolRecord(rows[0]) : undefined;
      },
      async getArenaPrizePoolByCreateIdempotencyKey(projectId, idempotencyKey) {
        const rows = await db
          .select()
          .from(arenaPrizePools)
          .where(and(eq(arenaPrizePools.projectId, projectId), eq(arenaPrizePools.createIdempotencyKey, idempotencyKey)))
          .limit(1);
        return rows[0] ? toArenaPrizePoolRecord(rows[0]) : undefined;
      },
      async listArenaPrizePools(projectId) {
        const rows = await db
          .select()
          .from(arenaPrizePools)
          .where(eq(arenaPrizePools.projectId, projectId))
          .orderBy(asc(arenaPrizePools.createdAt));
        return rows.map(toArenaPrizePoolRecord);
      },
      async updateArenaPrizePool(record) {
        await db
          .update(arenaPrizePools)
          .set({
            status: record.status,
            fundingTransactionHash: record.fundingTransactionHash ?? null,
            fundingReceiptDigest: record.fundingReceiptDigest ?? null,
            winnerAgentId: record.winnerAgentId ?? null,
            recipientFingerprint: record.recipientFingerprint ?? null,
            encryptedRecipient: record.encryptedRecipient ?? null,
            settlementTransactionHash: record.settlementTransactionHash ?? null,
            settlementReceiptDigest: record.settlementReceiptDigest ?? null,
            updatedAt: record.updatedAt,
          })
          .where(and(eq(arenaPrizePools.projectId, record.projectId), eq(arenaPrizePools.id, record.id)));
      },
      async prepareArenaPrizeSettlement(input) {
        await db.transaction(async (tx) => {
          const updated = await tx
            .update(arenaPrizePools)
            .set({
              status: input.pool.status,
              winnerAgentId: input.pool.winnerAgentId ?? null,
              recipientFingerprint: input.pool.recipientFingerprint ?? null,
              encryptedRecipient: input.pool.encryptedRecipient ?? null,
              updatedAt: input.pool.updatedAt,
            })
            .where(and(
              eq(arenaPrizePools.projectId, input.pool.projectId),
              eq(arenaPrizePools.id, input.pool.id),
              eq(arenaPrizePools.status, input.expectedStatus),
            ))
            .returning({ id: arenaPrizePools.id });
          if (!updated[0]) throw new Error("ARENA_PRIZE_POOL_STATE_CHANGED");
          await tx.insert(auditEvents).values(input.audit);
        });
      },
      async getArenaPrizeTransaction(transactionHash) {
        const rows = await db
          .select()
          .from(arenaPrizeTransactions)
          .where(eq(arenaPrizeTransactions.transactionHash, transactionHash))
          .limit(1);
        return rows[0] ? toArenaPrizeTransactionRecord(rows[0]) : undefined;
      },
      async confirmArenaPrizePoolTransaction(input) {
        try {
          await db.transaction(async (tx) => {
            await tx.insert(arenaPrizeTransactions).values(input.transaction);
            const updated = await tx
              .update(arenaPrizePools)
              .set({
                status: input.pool.status,
                fundingTransactionHash: input.pool.fundingTransactionHash ?? null,
                fundingReceiptDigest: input.pool.fundingReceiptDigest ?? null,
                winnerAgentId: input.pool.winnerAgentId ?? null,
                recipientFingerprint: input.pool.recipientFingerprint ?? null,
                encryptedRecipient: input.pool.encryptedRecipient ?? null,
                settlementTransactionHash: input.pool.settlementTransactionHash ?? null,
                settlementReceiptDigest: input.pool.settlementReceiptDigest ?? null,
                updatedAt: input.pool.updatedAt,
              })
              .where(and(
                eq(arenaPrizePools.projectId, input.pool.projectId),
                eq(arenaPrizePools.id, input.pool.id),
                eq(arenaPrizePools.status, input.expectedStatus),
              ))
              .returning({ id: arenaPrizePools.id });
            if (!updated[0]) throw new Error("ARENA_PRIZE_POOL_STATE_CHANGED");
            await tx.insert(auditEvents).values(input.audit);
          });
        } catch (error) {
          if (databaseErrorText(error).includes("arena_prize_transactions")) {
            throw new Error("ARENA_PRIZE_TRANSACTION_ALREADY_USED");
          }
          throw error;
        }
      },
    },
  };
}

export function createMemoryRepositories(): {
  nonces: AuthNonceRepository;
  sessions: SessionRepository;
  projects: ProjectRepository;
} {
  const nonceRows = new Map<string, AuthNonceRecord>();
  const sessionRows = new Map<string, SessionRecord & { revokedAt?: Date }>();
  const projectRows = new Map<string, ProjectKeyRecord>();
  const memberRows = new Map<string, ProjectMemberRecord>();
  const agreementRows = new Map<string, AgreementVersionRecord>();
  const checkpointRows = new Map<string, CheckpointRecord>();
  const auditRows: AuditEventRecord[] = [];
  const verificationRunRows: VerificationRunRecord[] = [];
  const decisionRows = new Map<string, DecisionRecord>();
  const releaseRows = new Map<string, ReleaseRecord>();
  const chainOperationRows = new Map<string, ChainOperationRecord>();
  const revenueEventRows = new Map<string, RevenueEventRecord>();
  const selectiveReceiptRows = new Map<string, SelectiveReceiptRecord>();
  const arenaStrategyArtifactRows = new Map<string, ArenaStrategyArtifactRecord>();
  const participantAgentPackageRows = new Map<string, ParticipantAgentPackageRecord>();
  const arenaMatchReceiptRows = new Map<string, ArenaMatchReceiptRecord>();
  const arenaMatchRevealRows = new Map<string, ArenaMatchRevealRecord>();
  const arenaSeasonRows = new Map<string, ArenaSeasonRecord>();
  const arenaSeasonEntryRows = new Map<string, ArenaSeasonEntryRecord>();
  const arenaEntryVersionRows = new Map<string, ArenaEntryVersionRecord>();
  const arenaScheduledMatchRows = new Map<string, ArenaScheduledMatchRecord>();
  const arenaPrizePoolRows = new Map<string, ArenaPrizePoolRecord>();
  const arenaPrizeTransactionRows = new Map<string, ArenaPrizeTransactionRecord>();
  return {
    nonces: {
      async saveNonce(record) {
        if (nonceRows.has(record.nonce)) throw new Error("NONCE_ALREADY_EXISTS");
        nonceRows.set(record.nonce, structuredClone(record));
      },
      async getNonce(nonce) {
        const record = nonceRows.get(nonce);
        return record ? structuredClone(record) : undefined;
      },
      async consumeNonce(nonce, now) {
        const record = nonceRows.get(nonce);
        if (!record || record.expiresAt <= now) return undefined;
        if (record.consumedAt) return "REPLAYED";
        const consumed = { ...record, consumedAt: now };
        nonceRows.set(nonce, consumed);
        return structuredClone(consumed);
      },
    },
    sessions: {
      async saveSession(record) {
        if (sessionRows.has(record.id)) throw new Error("SESSION_ALREADY_EXISTS");
        sessionRows.set(record.id, structuredClone(record));
      },
      async getSession(id) {
        const record = sessionRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async revokeSession(id, now) {
        const record = sessionRows.get(id);
        if (record && !record.revokedAt) record.revokedAt = now;
      },
    },
    projects: {
      async saveProject(record) {
        if (projectRows.has(record.id)) throw new Error("PROJECT_ALREADY_EXISTS");
        projectRows.set(record.id, structuredClone(record));
      },
      async getProject(id) {
        const record = projectRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async saveMember(record) {
        const key = `${record.projectId}:${record.walletFingerprint}:${record.role}`;
        if (memberRows.has(key)) throw new Error("PROJECT_MEMBER_ALREADY_EXISTS");
        memberRows.set(key, structuredClone(record));
      },
      async getMemberRoles(projectId, walletFingerprint) {
        return [...memberRows.values()]
          .filter((record) => record.projectId === projectId && record.walletFingerprint === walletFingerprint)
          .map((record) => record.role);
      },
      async saveAgreement(record) {
        const key = `${record.projectId}:${record.version}`;
        if (agreementRows.has(key)) throw new Error("AGREEMENT_VERSION_ALREADY_EXISTS");
        agreementRows.set(key, structuredClone(record));
      },
      async getAgreement(projectId, version) {
        const record = agreementRows.get(`${projectId}:${version}`);
        return record ? structuredClone(record) : undefined;
      },
      async listAgreements(projectId) {
        return [...agreementRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.version - right.version)
          .map((record) => structuredClone(record));
      },
      async saveCheckpoint(record) {
        if (checkpointRows.has(record.id)) throw new Error("CHECKPOINT_ALREADY_EXISTS");
        if ([...checkpointRows.values()].some((row) => row.projectId === record.projectId && row.sequence === record.sequence)) {
          throw new Error("CHECKPOINT_SEQUENCE_ALREADY_EXISTS");
        }
        checkpointRows.set(record.id, structuredClone(record));
      },
      async getCheckpoint(id) {
        const record = checkpointRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async listCheckpoints(projectId) {
        return [...checkpointRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.sequence - right.sequence)
          .map((record) => structuredClone(record));
      },
      async saveAuditEvent(record) {
        if (auditRows.some((row) => row.id === record.id)) throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
        auditRows.push(structuredClone(record));
      },
      async saveVerificationRun(record) {
        verificationRunRows.push(structuredClone(record));
      },
      async listVerificationRuns(checkpointId) {
        return verificationRunRows
          .filter((record) => record.checkpointId === checkpointId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async saveDecision(record) {
        if (decisionRows.has(record.id)) throw new Error("DECISION_ALREADY_EXISTS");
        if ([...decisionRows.values()].some((row) => row.nonce === record.nonce)) {
          throw new Error("DECISION_NONCE_ALREADY_EXISTS");
        }
        if ([...decisionRows.values()].some((row) => row.checkpointId === record.checkpointId)) {
          throw new Error("DECISION_CHECKPOINT_ALREADY_EXISTS");
        }
        decisionRows.set(record.id, structuredClone(record));
      },
      async getDecision(id) {
        const record = decisionRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async getDecisionByCheckpoint(checkpointId) {
        const record = [...decisionRows.values()].find((row) => row.checkpointId === checkpointId);
        return record ? structuredClone(record) : undefined;
      },
      async getDecisionByNonce(nonce) {
        const record = [...decisionRows.values()].find((row) => row.nonce === nonce);
        return record ? structuredClone(record) : undefined;
      },
      async saveRelease(record) {
        if (releaseRows.has(record.id)) throw new Error("RELEASE_ALREADY_EXISTS");
        if ([...releaseRows.values()].some((row) => row.kind === record.kind && row.sourceId === record.sourceId)) {
          throw new Error("RELEASE_SOURCE_ALREADY_EXISTS");
        }
        if ([...releaseRows.values()].some((row) => row.idempotencyKey === record.idempotencyKey)) {
          throw new Error("RELEASE_IDEMPOTENCY_ALREADY_EXISTS");
        }
        releaseRows.set(record.id, structuredClone(record));
      },
      async getRelease(id) {
        const record = releaseRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async listReleases(projectId) {
        return [...releaseRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async getReleaseBySource(kind, sourceId) {
        const record = [...releaseRows.values()].find((row) => row.kind === kind && row.sourceId === sourceId);
        return record ? structuredClone(record) : undefined;
      },
      async getReleaseByIdempotencyKey(key) {
        const record = [...releaseRows.values()].find((row) => row.idempotencyKey === key);
        return record ? structuredClone(record) : undefined;
      },
      async reserveReleaseBundle(input) {
        if ([...releaseRows.values()].some((row) => row.kind === input.release.kind && row.sourceId === input.release.sourceId)) {
          throw new Error("RELEASE_SOURCE_ALREADY_EXISTS");
        }
        if ([...releaseRows.values()].some((row) => row.idempotencyKey === input.release.idempotencyKey)) {
          throw new Error("RELEASE_IDEMPOTENCY_ALREADY_EXISTS");
        }
        if ([...chainOperationRows.values()].some((row) => row.releaseId === input.operation.releaseId)) {
          throw new Error("CHAIN_OPERATION_RELEASE_ALREADY_EXISTS");
        }
        if (auditRows.some((row) => row.id === input.audit.id)) {
          throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
        }
        releaseRows.set(input.release.id, structuredClone(input.release));
        chainOperationRows.set(input.operation.id, structuredClone(input.operation));
        auditRows.push(structuredClone(input.audit));
      },
      async updateRelease(record) {
        if (!releaseRows.has(record.id)) throw new Error("RELEASE_NOT_FOUND");
        releaseRows.set(record.id, structuredClone(record));
      },
      async saveChainOperation(record) {
        if (chainOperationRows.has(record.id)) throw new Error("CHAIN_OPERATION_ALREADY_EXISTS");
        if ([...chainOperationRows.values()].some((row) => row.releaseId === record.releaseId)) {
          throw new Error("CHAIN_OPERATION_RELEASE_ALREADY_EXISTS");
        }
        chainOperationRows.set(record.id, structuredClone(record));
      },
      async getChainOperation(releaseId) {
        const record = [...chainOperationRows.values()].find((row) => row.releaseId === releaseId);
        return record ? structuredClone(record) : undefined;
      },
      async updateChainOperation(record) {
        if (!chainOperationRows.has(record.id)) throw new Error("CHAIN_OPERATION_NOT_FOUND");
        chainOperationRows.set(record.id, structuredClone(record));
      },
      async saveRevenueEvent(record) {
        if (revenueEventRows.has(record.id)) throw new Error("REVENUE_EVENT_ALREADY_EXISTS");
        revenueEventRows.set(record.id, structuredClone(record));
      },
      async getRevenueEvent(id) {
        const record = revenueEventRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async saveSelectiveReceipt(record) {
        if (selectiveReceiptRows.has(record.id)) throw new Error("SELECTIVE_RECEIPT_ALREADY_EXISTS");
        selectiveReceiptRows.set(record.id, structuredClone(record));
      },
      async getSelectiveReceipt(id) {
        const record = selectiveReceiptRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async saveArenaStrategyArtifact(record) {
        const agentKey = `${record.projectId}:${record.agentId}`;
        if (arenaStrategyArtifactRows.has(record.id)) throw new Error("ARENA_ARTIFACT_ALREADY_EXISTS");
        if ([...arenaStrategyArtifactRows.values()].some((row) => `${row.projectId}:${row.agentId}` === agentKey)) {
          throw new Error("ARENA_ARTIFACT_ALREADY_EXISTS");
        }
        if ([...arenaStrategyArtifactRows.values()].some((row) => row.projectId === record.projectId && row.artifactCommitment === record.artifactCommitment)) {
          throw new Error("ARENA_ARTIFACT_COMMITMENT_ALREADY_EXISTS");
        }
        arenaStrategyArtifactRows.set(record.id, structuredClone(record));
      },
      async getArenaStrategyArtifact(projectId, agentId) {
        const record = [...arenaStrategyArtifactRows.values()].find((row) => row.projectId === projectId && row.agentId === agentId);
        return record ? structuredClone(record) : undefined;
      },
      async listArenaStrategyArtifacts(projectId) {
        return [...arenaStrategyArtifactRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async saveParticipantAgentPackage(record) {
        const existing = [...participantAgentPackageRows.values()].find((item) => (
          item.ownerFingerprint === record.ownerFingerprint && item.agentId === record.agentId
        ));
        if (existing && existing.id !== record.id) throw new Error("PARTICIPANT_AGENT_PACKAGE_CONFLICT");
        participantAgentPackageRows.set(record.id, structuredClone(record));
      },
      async getParticipantAgentPackage(ownerFingerprint, agentId) {
        const record = [...participantAgentPackageRows.values()].find((item) => (
          item.ownerFingerprint === ownerFingerprint && item.agentId === agentId
        ));
        return record ? structuredClone(record) : undefined;
      },
      async listParticipantAgentPackages(ownerFingerprint) {
        return [...participantAgentPackageRows.values()]
          .filter((record) => record.ownerFingerprint === ownerFingerprint)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .map((record) => structuredClone(record));
      },
      async saveArenaMatchReceipt(record) {
        if (arenaMatchReceiptRows.has(record.id)) throw new Error("ARENA_MATCH_ALREADY_EXISTS");
        if (record.idempotencyKey && [...arenaMatchReceiptRows.values()].some((row) => row.projectId === record.projectId && row.idempotencyKey === record.idempotencyKey)) {
          throw new Error("ARENA_MATCH_IDEMPOTENCY_ALREADY_EXISTS");
        }
        arenaMatchReceiptRows.set(record.id, structuredClone(record));
      },
      async getArenaMatchReceipt(projectId, matchId) {
        const record = arenaMatchReceiptRows.get(matchId);
        return record && record.projectId === projectId ? structuredClone(record) : undefined;
      },
      async getArenaMatchReceiptByIdempotencyKey(projectId, idempotencyKey) {
        const record = [...arenaMatchReceiptRows.values()].find((row) => row.projectId === projectId && row.idempotencyKey === idempotencyKey);
        return record ? structuredClone(record) : undefined;
      },
      async listArenaMatchReceipts(projectId) {
        return [...arenaMatchReceiptRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async saveArenaMatchReveal(record) {
        if (arenaMatchRevealRows.has(record.id)) throw new Error("ARENA_MATCH_REVEAL_ALREADY_EXISTS");
        if ([...arenaMatchRevealRows.values()].some((row) => row.projectId === record.projectId && row.matchId === record.matchId)) {
          throw new Error("ARENA_MATCH_REVEAL_ALREADY_EXISTS");
        }
        if (record.idempotencyKey && [...arenaMatchRevealRows.values()].some((row) => row.projectId === record.projectId && row.idempotencyKey === record.idempotencyKey)) {
          throw new Error("ARENA_REVEAL_IDEMPOTENCY_ALREADY_EXISTS");
        }
        arenaMatchRevealRows.set(record.id, structuredClone(record));
      },
      async getArenaMatchReveal(projectId, matchId) {
        const record = [...arenaMatchRevealRows.values()].find((row) => row.projectId === projectId && row.matchId === matchId);
        return record ? structuredClone(record) : undefined;
      },
      async getArenaMatchRevealByIdempotencyKey(projectId, idempotencyKey) {
        const record = [...arenaMatchRevealRows.values()].find((row) => row.projectId === projectId && row.idempotencyKey === idempotencyKey);
        return record ? structuredClone(record) : undefined;
      },
      async listArenaMatchReveals(projectId) {
        return [...arenaMatchRevealRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async saveArenaSeason(record) {
        if (arenaSeasonRows.has(record.id)) throw new Error("ARENA_SEASON_ALREADY_EXISTS");
        if (record.createIdempotencyKey && [...arenaSeasonRows.values()].some((row) => row.projectId === record.projectId && row.createIdempotencyKey === record.createIdempotencyKey)) {
          throw new Error("ARENA_SEASON_CREATE_IDEMPOTENCY_ALREADY_EXISTS");
        }
        arenaSeasonRows.set(record.id, structuredClone(record));
      },
      async getArenaSeason(projectId, seasonId) {
        const record = arenaSeasonRows.get(seasonId);
        return record && record.projectId === projectId ? structuredClone(record) : undefined;
      },
      async getArenaSeasonByCreateIdempotencyKey(projectId, idempotencyKey) {
        const record = [...arenaSeasonRows.values()].find((row) => row.projectId === projectId && row.createIdempotencyKey === idempotencyKey);
        return record ? structuredClone(record) : undefined;
      },
      async updateArenaSeason(record) {
        if (!arenaSeasonRows.has(record.id)) throw new Error("ARENA_SEASON_NOT_FOUND");
        arenaSeasonRows.set(record.id, structuredClone(record));
      },
      async listArenaSeasons(projectId) {
        return [...arenaSeasonRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async listAllArenaSeasons() {
        return [...arenaSeasonRows.values()]
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async saveArenaSeasonEntry(record) {
        if (arenaSeasonEntryRows.has(record.id)) throw new Error("ARENA_SEASON_ENTRY_ALREADY_EXISTS");
        if ([...arenaSeasonEntryRows.values()].some((row) => row.seasonId === record.seasonId && row.agentId === record.agentId)) {
          throw new Error("ARENA_SEASON_ENTRY_AGENT_ALREADY_EXISTS");
        }
        if (record.idempotencyKey && [...arenaSeasonEntryRows.values()].some((row) => row.seasonId === record.seasonId && row.idempotencyKey === record.idempotencyKey)) {
          throw new Error("ARENA_SEASON_ENTRY_IDEMPOTENCY_ALREADY_EXISTS");
        }
        if (record.ownerFingerprint && [...arenaSeasonEntryRows.values()].some((row) => row.seasonId === record.seasonId && row.ownerFingerprint === record.ownerFingerprint)) {
          throw new Error("ARENA_WALLET_ALREADY_ENTERED");
        }
        arenaSeasonEntryRows.set(record.id, structuredClone(record));
        arenaEntryVersionRows.set(`${record.id}:v${record.version}`, {
          id: `${record.id}:v${record.version}`,
          entryId: record.id,
          seasonId: record.seasonId,
          projectId: record.projectId,
          version: record.version,
          agentId: record.agentId,
          displayName: record.displayName,
          artifactCommitment: record.artifactCommitment,
          status: "active",
          submittedAt: record.joinedAt,
          idempotencyKey: record.idempotencyKey,
          requestDigest: record.requestDigest,
        });
      },
      async getArenaSeasonEntry(projectId, seasonId, agentId) {
        const record = [...arenaSeasonEntryRows.values()].find((row) => row.projectId === projectId && row.seasonId === seasonId && row.agentId === agentId);
        return record ? structuredClone(record) : undefined;
      },
      async getArenaSeasonEntryByOwnerFingerprint(projectId, seasonId, ownerFingerprint) {
        const record = [...arenaSeasonEntryRows.values()].find((row) => row.projectId === projectId && row.seasonId === seasonId && row.ownerFingerprint === ownerFingerprint);
        return record ? structuredClone(record) : undefined;
      },
      async getArenaSeasonEntryByIdempotencyKey(projectId, seasonId, idempotencyKey) {
        const record = [...arenaSeasonEntryRows.values()].find((row) => row.projectId === projectId && row.seasonId === seasonId && row.idempotencyKey === idempotencyKey);
        return record ? structuredClone(record) : undefined;
      },
      async listArenaSeasonEntries(projectId, seasonId) {
        return [...arenaSeasonEntryRows.values()]
          .filter((record) => record.projectId === projectId && record.seasonId === seasonId)
          .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime())
          .map((record) => structuredClone(record));
      },
      async listArenaSeasonEntriesByOwnerFingerprint(ownerFingerprint) {
        return [...arenaSeasonEntryRows.values()]
          .filter((record) => record.ownerFingerprint === ownerFingerprint)
          .sort((left, right) => right.joinedAt.getTime() - left.joinedAt.getTime())
          .map((record) => structuredClone(record));
      },
      async listArenaEntryVersions(projectId, seasonId, entryId) {
        return [...arenaEntryVersionRows.values()]
          .filter((record) => record.projectId === projectId && record.seasonId === seasonId && record.entryId === entryId)
          .sort((left, right) => left.version - right.version)
          .map((record) => structuredClone(record));
      },
      async saveArenaEnrollment(input) {
        const season = arenaSeasonRows.get(input.entry.seasonId);
        if (!season || season.projectId !== input.entry.projectId) throw new Error("ARENA_SEASON_NOT_FOUND");
        if (season.status !== "open") throw new Error("ARENA_SEASON_NOT_OPEN");
        const admissionAllowed = (season.entryMode ?? "invite_only") === "open"
          ? input.admission === "public"
          : input.admission === "invite" || input.admission === "system";
        if (!admissionAllowed) throw new Error("ARENA_SEASON_NOT_PUBLIC");
        if (input.now < season.startsAt) throw new Error("ARENA_SEASON_NOT_STARTED");
        if (input.now >= season.locksAt) throw new Error("ARENA_SEASON_CLOSED");
        const entries = [...arenaSeasonEntryRows.values()].filter((row) => row.projectId === input.entry.projectId && row.seasonId === input.entry.seasonId);
        if (entries.length >= (season.maxEntries ?? 16)) throw new Error("ARENA_SEASON_FULL");
        if (arenaStrategyArtifactRows.has(input.artifact.id) || [...arenaStrategyArtifactRows.values()].some((row) => row.projectId === input.artifact.projectId && row.agentId === input.artifact.agentId)) {
          throw new Error("ARENA_ARTIFACT_ALREADY_EXISTS");
        }
        if (entries.some((row) => row.agentId === input.entry.agentId)) throw new Error("ARENA_SEASON_ENTRY_AGENT_ALREADY_EXISTS");
        if (input.entry.ownerFingerprint && entries.some((row) => row.ownerFingerprint === input.entry.ownerFingerprint)) throw new Error("ARENA_WALLET_ALREADY_ENTERED");
        if (input.entry.idempotencyKey && entries.some((row) => row.idempotencyKey === input.entry.idempotencyKey)) throw new Error("ARENA_SEASON_ENTRY_IDEMPOTENCY_ALREADY_EXISTS");
        if (auditRows.some((row) => row.id === input.audit.id)) throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
        arenaStrategyArtifactRows.set(input.artifact.id, structuredClone(input.artifact));
        arenaSeasonEntryRows.set(input.entry.id, structuredClone(input.entry));
        const version: ArenaEntryVersionRecord = {
          id: `${input.entry.id}:v${input.entry.version}`,
          entryId: input.entry.id,
          seasonId: input.entry.seasonId,
          projectId: input.entry.projectId,
          version: input.entry.version,
          agentId: input.entry.agentId,
          displayName: input.entry.displayName,
          artifactCommitment: input.entry.artifactCommitment,
          status: "active",
          submittedAt: input.now,
          idempotencyKey: input.entry.idempotencyKey,
          requestDigest: input.entry.requestDigest,
        };
        arenaEntryVersionRows.set(version.id, structuredClone(version));
        auditRows.push(structuredClone(input.audit));
      },
      async replaceArenaEnrollment(input) {
        const season = arenaSeasonRows.get(input.entry.seasonId);
        if (!season || season.projectId !== input.entry.projectId) throw new Error("ARENA_SEASON_NOT_FOUND");
        if (season.status !== "open") throw new Error("ARENA_SEASON_NOT_OPEN");
        if ((season.entryMode ?? "invite_only") !== "open") throw new Error("ARENA_SEASON_NOT_PUBLIC");
        if (input.now < season.startsAt) throw new Error("ARENA_SEASON_NOT_STARTED");
        if (input.now >= season.locksAt) throw new Error("ARENA_SEASON_CLOSED");
        if (season.rulesSnapshot?.resubmissionPolicy !== "replace_until_lock") {
          throw new Error("ARENA_RESUBMISSION_FORBIDDEN");
        }
        const current = arenaSeasonEntryRows.get(input.entry.id);
        if (!current || current.projectId !== input.entry.projectId || current.seasonId !== input.entry.seasonId) {
          throw new Error("ARENA_SEASON_ENTRY_NOT_FOUND");
        }
        if (current.ownerFingerprint !== input.entry.ownerFingerprint) throw new Error("ARENA_ENTRY_OWNER_MISMATCH");
        if (current.version !== input.previousVersion) throw new Error("ARENA_ENTRY_VERSION_CONFLICT");
        if (arenaStrategyArtifactRows.has(input.artifact.id) || [...arenaStrategyArtifactRows.values()].some((row) => row.projectId === input.artifact.projectId && row.agentId === input.artifact.agentId)) {
          throw new Error("ARENA_ARTIFACT_ALREADY_EXISTS");
        }
        if ([...arenaSeasonEntryRows.values()].some((row) => row.id !== input.entry.id && row.seasonId === input.entry.seasonId && row.agentId === input.entry.agentId)) {
          throw new Error("ARENA_SEASON_ENTRY_AGENT_ALREADY_EXISTS");
        }
        if ([...arenaEntryVersionRows.values()].some((row) => row.seasonId === input.entry.seasonId && row.idempotencyKey === input.entry.idempotencyKey)) {
          throw new Error("ARENA_SEASON_ENTRY_IDEMPOTENCY_ALREADY_EXISTS");
        }
        const currentVersion = arenaEntryVersionRows.get(`${input.entry.id}:v${input.previousVersion}`);
        if (!currentVersion || currentVersion.status !== "active") throw new Error("ARENA_ENTRY_VERSION_CONFLICT");
        if (auditRows.some((row) => row.id === input.audit.id)) throw new Error("AUDIT_EVENT_ALREADY_EXISTS");

        arenaStrategyArtifactRows.set(input.artifact.id, structuredClone(input.artifact));
        arenaEntryVersionRows.set(currentVersion.id, {
          ...structuredClone(currentVersion),
          status: "retired",
          retiredAt: input.now,
        });
        arenaSeasonEntryRows.set(input.entry.id, structuredClone(input.entry));
        arenaEntryVersionRows.set(input.version.id, structuredClone(input.version));
        auditRows.push(structuredClone(input.audit));
      },
      async saveArenaScheduledMatch(record) {
        if (arenaScheduledMatchRows.has(record.id)) throw new Error("ARENA_SCHEDULED_MATCH_ALREADY_EXISTS");
        if ([...arenaScheduledMatchRows.values()].some((row) => row.seasonId === record.seasonId && row.sequence === record.sequence)) {
          throw new Error("ARENA_SCHEDULED_MATCH_SEQUENCE_ALREADY_EXISTS");
        }
        arenaScheduledMatchRows.set(record.id, structuredClone(record));
      },
      async getArenaScheduledMatch(projectId, seasonId, scheduledMatchId) {
        const record = arenaScheduledMatchRows.get(scheduledMatchId);
        return record && record.projectId === projectId && record.seasonId === seasonId ? structuredClone(record) : undefined;
      },
      async listArenaScheduledMatches(projectId, seasonId) {
        return [...arenaScheduledMatchRows.values()]
          .filter((record) => record.projectId === projectId && record.seasonId === seasonId)
          .sort((left, right) => left.sequence - right.sequence)
          .map((record) => structuredClone(record));
      },
      async claimArenaScheduledMatch(input) {
        const current = arenaScheduledMatchRows.get(input.scheduledMatchId);
        if (!current || current.projectId !== input.projectId || current.seasonId !== input.seasonId) return undefined;
        const reclaimable = current.status === "scheduled"
          || current.status === "failed"
          || (current.status === "running" && !!current.leaseExpiresAt && current.leaseExpiresAt < input.now);
        if (!reclaimable) return current.status === "completed" ? structuredClone(current) : "IN_PROGRESS";
        const claimed: ArenaScheduledMatchRecord = {
          ...current,
          status: "running",
          attempts: current.attempts + 1,
          executionIdempotencyKey: input.executionIdempotencyKey,
          executionRequestDigest: input.executionRequestDigest,
          leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs),
          startedAt: input.now,
          lastError: undefined,
        };
        arenaScheduledMatchRows.set(current.id, structuredClone(claimed));
        return structuredClone(claimed);
      },
      async updateArenaScheduledMatch(record) {
        if (!arenaScheduledMatchRows.has(record.id)) throw new Error("ARENA_SCHEDULED_MATCH_NOT_FOUND");
        arenaScheduledMatchRows.set(record.id, structuredClone(record));
      },
      async saveArenaSeasonSchedule(input) {
        const current = arenaSeasonRows.get(input.season.id);
        if (!current || current.projectId !== input.season.projectId) throw new Error("ARENA_SEASON_NOT_FOUND");
        if (current.status !== "open") throw new Error("ARENA_SEASON_NOT_OPEN");
        if (auditRows.some((row) => row.id === input.audit.id)) throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
        for (const match of input.matches) {
          if ([...arenaScheduledMatchRows.values()].some((row) => row.seasonId === match.seasonId && row.sequence === match.sequence)) {
            throw new Error("ARENA_SCHEDULED_MATCH_SEQUENCE_ALREADY_EXISTS");
          }
        }
        arenaSeasonRows.set(input.season.id, structuredClone(input.season));
        for (const match of input.matches) arenaScheduledMatchRows.set(match.id, structuredClone(match));
        auditRows.push(structuredClone(input.audit));
      },
      async saveArenaPrizePool(record) {
        if (arenaPrizePoolRows.has(record.id)) throw new Error("ARENA_PRIZE_POOL_ALREADY_EXISTS");
        if ([...arenaPrizePoolRows.values()].some((row) => row.projectId === record.projectId && row.seasonId === record.seasonId)) {
          throw new Error("ARENA_PRIZE_POOL_ALREADY_EXISTS");
        }
        if (record.createIdempotencyKey && [...arenaPrizePoolRows.values()].some((row) => row.projectId === record.projectId && row.createIdempotencyKey === record.createIdempotencyKey)) {
          throw new Error("ARENA_PRIZE_POOL_IDEMPOTENCY_ALREADY_EXISTS");
        }
        arenaPrizePoolRows.set(record.id, structuredClone(record));
      },
      async getArenaPrizePool(projectId, seasonId) {
        const record = [...arenaPrizePoolRows.values()].find((row) => row.projectId === projectId && row.seasonId === seasonId);
        return record ? structuredClone(record) : undefined;
      },
      async getArenaPrizePoolByCreateIdempotencyKey(projectId, idempotencyKey) {
        const record = [...arenaPrizePoolRows.values()].find((row) => row.projectId === projectId && row.createIdempotencyKey === idempotencyKey);
        return record ? structuredClone(record) : undefined;
      },
      async listArenaPrizePools(projectId) {
        return [...arenaPrizePoolRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((record) => structuredClone(record));
      },
      async updateArenaPrizePool(record) {
        if (!arenaPrizePoolRows.has(record.id)) throw new Error("ARENA_PRIZE_POOL_NOT_FOUND");
        arenaPrizePoolRows.set(record.id, structuredClone(record));
      },
      async prepareArenaPrizeSettlement(input) {
        const current = arenaPrizePoolRows.get(input.pool.id);
        if (!current || current.projectId !== input.pool.projectId) throw new Error("ARENA_PRIZE_POOL_NOT_FOUND");
        if (current.status !== input.expectedStatus) throw new Error("ARENA_PRIZE_POOL_STATE_CHANGED");
        if (auditRows.some((record) => record.id === input.audit.id)) throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
        arenaPrizePoolRows.set(input.pool.id, structuredClone(input.pool));
        auditRows.push(structuredClone(input.audit));
      },
      async getArenaPrizeTransaction(transactionHash) {
        const record = arenaPrizeTransactionRows.get(transactionHash);
        return record ? structuredClone(record) : undefined;
      },
      async confirmArenaPrizePoolTransaction(input) {
        const current = arenaPrizePoolRows.get(input.pool.id);
        if (!current || current.projectId !== input.pool.projectId) throw new Error("ARENA_PRIZE_POOL_NOT_FOUND");
        if (current.status !== input.expectedStatus) throw new Error("ARENA_PRIZE_POOL_STATE_CHANGED");
        if (arenaPrizeTransactionRows.has(input.transaction.transactionHash)) {
          throw new Error("ARENA_PRIZE_TRANSACTION_ALREADY_USED");
        }
        if ([...arenaPrizeTransactionRows.values()].some((record) => (
          record.poolId === input.transaction.poolId
          && record.operation === input.transaction.operation
        ))) {
          throw new Error("ARENA_PRIZE_TRANSACTION_ALREADY_USED");
        }
        if (auditRows.some((record) => record.id === input.audit.id)) throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
        arenaPrizeTransactionRows.set(input.transaction.transactionHash, structuredClone(input.transaction));
        arenaPrizePoolRows.set(input.pool.id, structuredClone(input.pool));
        auditRows.push(structuredClone(input.audit));
      },
    },
  };
}

export async function pingDatabase(db: VeilapDatabase): Promise<void> {
  await db.execute(sql`select 1`);
}

export type SensitiveRecord = EncryptedField;
