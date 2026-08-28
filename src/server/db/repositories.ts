import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import type { AuthChallenge } from "@/server/auth/challenge";
import type { EncryptedField } from "@/server/crypto/envelope";
import type { VeilapDatabase } from "./client";
import {
  agreementVersions,
  auditEvents,
  authNonces,
  authSessions,
  chainOperations,
  checkpoints,
  decisions,
  projectMembers,
  projects,
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

export interface SessionRepository {
  saveSession(record: SessionRecord): Promise<void>;
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
  eventType: "synthetic_revenue";
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
    },
  };
}

export async function pingDatabase(db: VeilapDatabase): Promise<void> {
  await db.execute(sql`select 1`);
}

export type SensitiveRecord = EncryptedField;
