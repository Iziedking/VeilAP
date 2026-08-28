import { randomUUID } from "node:crypto";

import { decryptField, encryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import type {
  ChainOperationRecord,
  ProjectRepository,
  ReleaseKind,
  ReleaseRecord,
  ReleaseStatus,
  RevenueEventRecord,
} from "@/server/db/repositories";
import { agreementTermsSchema } from "@/server/projects/project-service";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { commitment } from "@/domain/canonical";
import { computeRoyalty } from "@/domain/money";

export type ReleaseServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "DECISION_NOT_FOUND"
  | "DECISION_NOT_ACCEPTED"
  | "DECISION_EXPIRED"
  | "WALLET_FORBIDDEN"
  | "AGREEMENT_NOT_FOUND"
  | "RELEASE_AMOUNT_MISMATCH"
  | "RELEASE_ALREADY_EXISTS"
  | "UNRESOLVED_RELEASE"
  | "RELEASE_NOT_FOUND"
  | "RELEASE_NOT_READY"
  | "RECONCILIATION_PENDING"
  | "ILLEGAL_RELEASE_TRANSITION"
  | "REVENUE_EVENT_NOT_FOUND"
  | "REVENUE_AMOUNT_INVALID"
  | "ENCRYPTION_FAILED"
  | "PERSISTENCE_FAILED";

export type ReleaseServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ReleaseServiceErrorCode };

export interface ReleaseView {
  id: string;
  projectId: string;
  kind: ReleaseKind;
  sourceId: string;
  decisionId: string;
  amountMinor: string;
  status: ReleaseStatus;
  transactionHash?: string;
  receiptDigest?: string;
  reason?: string;
  createdAt: string;
}

export interface ReleaseServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  walletHashPepper: string;
  now?: () => Date;
  idFactory?: () => string;
}

function amountMinor(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function txHash(value: string): boolean {
  return /^0x[0-9a-f]+$/i.test(value) && value.length <= 80;
}

function errorCode(error: unknown): ReleaseServiceErrorCode {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return "RELEASE_ALREADY_EXISTS";
  }
  if (!(error instanceof Error)) return "PERSISTENCE_FAILED";
  if (error.message === "RELEASE_SOURCE_ALREADY_EXISTS") return "RELEASE_ALREADY_EXISTS";
  if (error.message === "RELEASE_IDEMPOTENCY_ALREADY_EXISTS") return "RELEASE_ALREADY_EXISTS";
  if (error.message === "RELEASE_NOT_FOUND") return "RELEASE_NOT_FOUND";
  if (error.message === "REVENUE_EVENT_NOT_FOUND") return "REVENUE_EVENT_NOT_FOUND";
  if (error.message === "REVENUE_AMOUNT_INVALID") return "REVENUE_AMOUNT_INVALID";
  if (error.message.startsWith("ENVELOPE_") || error.message.startsWith("KMS_")) return "ENCRYPTION_FAILED";
  return "PERSISTENCE_FAILED";
}

export class ReleaseService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly walletHashPepper: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: ReleaseServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async recordSyntheticRevenue(input: {
    projectId: string;
    actorWalletAddress: string;
    revenueEventId?: string;
    amountMinor: string;
  }): Promise<ReleaseServiceResult<{ id: string; amountMinor: string }>> {
    if (!amountMinor(input.amountMinor)) return { ok: false, code: "REVENUE_AMOUNT_INVALID" };
    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actor = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      if (actor !== project.ownerFingerprint) return { ok: false, code: "WALLET_FORBIDDEN" };
      const id = input.revenueEventId ?? this.idFactory();
      const existing = await this.repositories.getRevenueEvent(id);
      if (existing) {
        const existingAmount = await this.decryptRevenue(project.wrappedDataKey, existing);
        if (existingAmount !== input.amountMinor) return { ok: false, code: "RELEASE_ALREADY_EXISTS" };
        return { ok: true, value: { id, amountMinor: existingAmount } };
      }
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      const record: RevenueEventRecord = {
        id,
        projectId: input.projectId,
        eventType: "synthetic_revenue",
        encryptedAmount: encryptField(
          JSON.stringify({ amountMinor: input.amountMinor }),
          { projectId: input.projectId, recordType: "revenue_event", recordId: id, fieldName: "amount" },
          dataKey,
        ),
        currency: "USDC",
        createdAt: this.now(),
      };
      await this.repositories.saveRevenueEvent(record);
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId: input.projectId,
        actorFingerprint: actor,
        eventType: "synthetic_revenue_recorded",
        payloadDigest: commitment({ projectId: input.projectId, revenueEventId: id }),
        createdAt: this.now(),
      });
      return { ok: true, value: { id, amountMinor: input.amountMinor } };
    } catch {
      return { ok: false, code: "ENCRYPTION_FAILED" };
    }
  }

  async prepareMilestoneRelease(input: {
    projectId: string;
    decisionId: string;
    actorWalletAddress: string;
    idempotencyKey?: string;
  }): Promise<ReleaseServiceResult<ReleaseView>> {
    return this.prepareRelease({ ...input, kind: "milestone", sourceId: undefined });
  }

  async prepareRoyaltyRelease(input: {
    projectId: string;
    decisionId: string;
    revenueEventId: string;
    actorWalletAddress: string;
    idempotencyKey?: string;
  }): Promise<ReleaseServiceResult<ReleaseView>> {
    return this.prepareRelease({ ...input, kind: "royalty", sourceId: input.revenueEventId });
  }

  async getRelease(input: { releaseId: string; actorWalletAddress: string }): Promise<ReleaseServiceResult<ReleaseView>> {
    try {
      const release = await this.repositories.getRelease(input.releaseId);
      if (!release) return { ok: false, code: "RELEASE_NOT_FOUND" };
      if (!(await this.isCompany(release.projectId, input.actorWalletAddress))) return { ok: false, code: "WALLET_FORBIDDEN" };
      return { ok: true, value: await this.view(release) };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  async markWalletPrompted(input: { releaseId: string; actorWalletAddress: string }): Promise<ReleaseServiceResult<ReleaseView>> {
    return this.transition(input, "wallet_prompted");
  }

  async markSubmitted(input: { releaseId: string; actorWalletAddress: string; transactionHash: string }): Promise<ReleaseServiceResult<ReleaseView>> {
    if (!txHash(input.transactionHash)) return { ok: false, code: "INVALID_INPUT" };
    try {
      const release = await this.authorizedRelease(input.releaseId, input.actorWalletAddress);
      if (!release) return { ok: false, code: "RELEASE_NOT_FOUND" };
      if (release.status !== "wallet_prompted") return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
      const operation = await this.repositories.getChainOperation(release.id);
      if (!operation) return { ok: false, code: "PERSISTENCE_FAILED" };
      const next = { ...release, status: "submitted" as const };
      const nextOperation = { ...operation, status: "submitted" as const, transactionHash: input.transactionHash, updatedAt: this.now() };
      await this.repositories.updateRelease(next);
      await this.repositories.updateChainOperation(nextOperation);
      return { ok: true, value: await this.view(next) };
    } catch (error) {
      return { ok: false, code: errorCode(error) };
    }
  }

  async markWalletRejected(input: { releaseId: string; actorWalletAddress: string }): Promise<ReleaseServiceResult<ReleaseView>> {
    try {
      const release = await this.authorizedRelease(input.releaseId, input.actorWalletAddress);
      if (!release) return { ok: false, code: "RELEASE_NOT_FOUND" };
      if (release.status !== "wallet_prompted") return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
      const operation = await this.repositories.getChainOperation(release.id);
      if (!operation) return { ok: false, code: "PERSISTENCE_FAILED" };
      const next = { ...release, status: "prepared" as const };
      await this.repositories.updateRelease(next);
      await this.repositories.updateChainOperation({
        ...operation,
        status: "prepared",
        reason: "USER_REJECTED",
        updatedAt: this.now(),
      });
      return { ok: true, value: await this.view(next) };
    } catch (error) {
      return { ok: false, code: errorCode(error) };
    }
  }

  private async prepareRelease(input: {
    projectId: string;
    decisionId: string;
    actorWalletAddress: string;
    idempotencyKey?: string;
    kind: ReleaseKind;
    sourceId: string | undefined;
    revenueEventId?: string;
  }): Promise<ReleaseServiceResult<ReleaseView>> {
    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actor = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      if (actor !== project.ownerFingerprint) return { ok: false, code: "WALLET_FORBIDDEN" };
      const decision = await this.repositories.getDecision(input.decisionId);
      if (!decision || decision.projectId !== input.projectId) return { ok: false, code: "DECISION_NOT_FOUND" };
      if (decision.decision !== "accept") return { ok: false, code: "DECISION_NOT_ACCEPTED" };
      if (decision.expiresAt <= this.now()) return { ok: false, code: "DECISION_EXPIRED" };
      const sourceId = input.kind === "milestone" ? decision.checkpointId : input.revenueEventId;
      if (!sourceId) return { ok: false, code: "INVALID_INPUT" };
      const idempotencyKey = input.idempotencyKey ?? `release:${input.kind}:${sourceId}`;
      const existingByKey = await this.repositories.getReleaseByIdempotencyKey(idempotencyKey);
      if (existingByKey) return { ok: true, value: await this.view(existingByKey) };
      const existingBySource = await this.repositories.getReleaseBySource(input.kind, sourceId);
      if (existingBySource) return { ok: false, code: "RELEASE_ALREADY_EXISTS" };
      const unresolved = (await this.repositories.listReleases(input.projectId)).some((release) =>
        release.status === "submitted" || release.status === "unknown");
      if (unresolved) return { ok: false, code: "UNRESOLVED_RELEASE" };

      const agreement = await this.repositories.getAgreement(input.projectId, decision.agreementVersion);
      if (!agreement || agreement.termsDigest !== decision.agreementDigest) return { ok: false, code: "AGREEMENT_NOT_FOUND" };
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      const terms = agreementTermsSchema.parse(JSON.parse(decryptField(
        agreement.encryptedTerms,
        { projectId: input.projectId, recordType: "agreement", recordId: agreement.id, fieldName: "terms" },
        dataKey,
      )));
      const computedAmount = input.kind === "milestone"
        ? terms.milestoneMinor
        : await this.computeRoyaltyAmount(input.projectId, input.revenueEventId!, terms.royaltyBps, dataKey);
      if (decision.releaseAmountMinor !== computedAmount) return { ok: false, code: "RELEASE_AMOUNT_MISMATCH" };

      const release: ReleaseRecord = {
        id: this.idFactory(),
        kind: input.kind,
        sourceId,
        projectId: input.projectId,
        decisionId: decision.id,
        amountMinor: computedAmount,
        idempotencyKey,
        status: "prepared",
        createdAt: this.now(),
      };
      const operation: ChainOperationRecord = {
        id: this.idFactory(),
        releaseId: release.id,
        operationType: "private_transfer",
        status: "prepared",
        updatedAt: release.createdAt,
        createdAt: release.createdAt,
      };
      await this.repositories.reserveReleaseBundle({
        release,
        operation,
        audit: {
          id: this.idFactory(),
          projectId: input.projectId,
          actorFingerprint: actor,
          eventType: "release_reserved",
          payloadDigest: commitment({ releaseId: release.id, decisionId: decision.id, amountMinor: computedAmount }),
          createdAt: this.now(),
        },
      });
      return { ok: true, value: await this.view(release) };
    } catch (error) {
      return { ok: false, code: errorCode(error) };
    }
  }

  private async computeRoyaltyAmount(
    projectId: string,
    revenueEventId: string,
    royaltyBps: number,
    dataKey: Uint8Array,
  ): Promise<string> {
    const event = await this.repositories.getRevenueEvent(revenueEventId);
    if (!event || event.projectId !== projectId) throw new Error("REVENUE_EVENT_NOT_FOUND");
    const encrypted = decryptField(
      event.encryptedAmount,
      { projectId, recordType: "revenue_event", recordId: event.id, fieldName: "amount" },
      dataKey,
    );
    const parsed = JSON.parse(encrypted) as { amountMinor?: string };
    if (!parsed.amountMinor || !amountMinor(parsed.amountMinor)) throw new Error("REVENUE_AMOUNT_INVALID");
    return computeRoyalty(BigInt(parsed.amountMinor), royaltyBps).toString(10);
  }

  private async decryptRevenue(wrappedDataKey: string, event: RevenueEventRecord): Promise<string> {
    const dataKey = await this.keyProvider.unwrap(wrappedDataKey, event.projectId);
    const parsed = JSON.parse(decryptField(
      event.encryptedAmount,
      { projectId: event.projectId, recordType: "revenue_event", recordId: event.id, fieldName: "amount" },
      dataKey,
    )) as { amountMinor?: string };
    if (!parsed.amountMinor || !amountMinor(parsed.amountMinor)) throw new Error("REVENUE_AMOUNT_INVALID");
    return parsed.amountMinor;
  }

  private async transition(
    input: { releaseId: string; actorWalletAddress: string },
    status: "wallet_prompted",
  ): Promise<ReleaseServiceResult<ReleaseView>> {
    try {
      const release = await this.authorizedRelease(input.releaseId, input.actorWalletAddress);
      if (!release) return { ok: false, code: "RELEASE_NOT_FOUND" };
      if (release.status !== "prepared") return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
      const operation = await this.repositories.getChainOperation(release.id);
      if (!operation) return { ok: false, code: "PERSISTENCE_FAILED" };
      const next = { ...release, status };
      await this.repositories.updateRelease(next);
      await this.repositories.updateChainOperation({ ...operation, status, updatedAt: this.now() });
      return { ok: true, value: await this.view(next) };
    } catch (error) {
      return { ok: false, code: errorCode(error) };
    }
  }

  private async authorizedRelease(releaseId: string, walletAddress: string): Promise<ReleaseRecord | undefined> {
    const release = await this.repositories.getRelease(releaseId);
    if (!release || !(await this.isCompany(release.projectId, walletAddress))) return undefined;
    return release;
  }

  private async isCompany(projectId: string, walletAddress: string): Promise<boolean> {
    const project = await this.repositories.getProject(projectId);
    return Boolean(project && project.ownerFingerprint === fingerprintWallet(walletAddress, this.walletHashPepper));
  }

  private async view(release: ReleaseRecord): Promise<ReleaseView> {
    const operation = await this.repositories.getChainOperation(release.id);
    return {
      id: release.id,
      projectId: release.projectId,
      kind: release.kind,
      sourceId: release.sourceId,
      decisionId: release.decisionId,
      amountMinor: release.amountMinor,
      status: release.status,
      transactionHash: operation?.transactionHash,
      receiptDigest: operation?.receiptDigest,
      reason: operation?.reason,
      createdAt: release.createdAt.toISOString(),
    };
  }
}
