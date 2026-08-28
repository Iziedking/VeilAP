import { decryptField, encryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import type { ProjectRepository, ReleaseRecord, SelectiveReceiptRecord } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { commitment } from "@/domain/canonical";
import {
  auditorReceiptPayloadSchema,
  companyReceiptPayloadSchema,
  contributorReceiptPayloadSchema,
  signedReceiptSchema,
  type ReceiptAudience,
  type ReceiptPayload,
  type SignedReceipt,
} from "./schemas";
import type { ReceiptSigner } from "./signing";

export type ReceiptServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "RELEASE_NOT_FOUND"
  | "DECISION_NOT_FOUND"
  | "WALLET_FORBIDDEN"
  | "ROLE_FORBIDDEN"
  | "RECEIPT_NOT_FOUND"
  | "RECEIPT_REVOKED"
  | "ENCRYPTION_FAILED"
  | "SIGNING_UNAVAILABLE"
  | "PERSISTENCE_FAILED";

export type ReceiptServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ReceiptServiceErrorCode };

export interface IssuedReceipt {
  receiptId: string;
  receipt: SignedReceipt;
}

export interface ReceiptServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  signer: ReceiptSigner;
  walletHashPepper: string;
  now?: () => Date;
  receiptTtlMs?: number;
}

function receiptId(audience: ReceiptAudience, releaseId: string): string {
  return `receipt:${audience}:${releaseId}`;
}

function roleForAudience(audience: ReceiptAudience): "company" | "contributor" | "auditor" {
  if (audience === "company") return "company";
  if (audience === "contributor") return "contributor";
  return "auditor";
}

function confirmationState(release: ReleaseRecord, status: ReleaseRecord["status"]): ReleaseRecord["status"] {
  return status || release.status;
}

export class ReceiptService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly signer: ReceiptSigner;
  private readonly walletHashPepper: string;
  private readonly now: () => Date;
  private readonly receiptTtlMs: number;

  constructor(dependencies: ReceiptServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.signer = dependencies.signer;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.now = dependencies.now ?? (() => new Date());
    this.receiptTtlMs = dependencies.receiptTtlMs ?? 7 * 24 * 60 * 60 * 1000;
    if (!Number.isInteger(this.receiptTtlMs) || this.receiptTtlMs < 60_000 || this.receiptTtlMs > 30 * 24 * 60 * 60 * 1000) {
      throw new Error("RECEIPT_TTL_INVALID");
    }
  }

  async issue(input: {
    projectId: string;
    releaseId: string;
    audience: ReceiptAudience;
    actorWalletAddress: string;
  }): Promise<ReceiptServiceResult<IssuedReceipt>> {
    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const release = await this.repositories.getRelease(input.releaseId);
      if (!release || release.projectId !== input.projectId) return { ok: false, code: "RELEASE_NOT_FOUND" };
      if (!(await this.authorized(project.ownerFingerprint, input.projectId, input.actorWalletAddress, input.audience))) {
        return { ok: false, code: input.audience === "company" ? "WALLET_FORBIDDEN" : "ROLE_FORBIDDEN" };
      }

      const id = receiptId(input.audience, release.id);
      const existing = await this.repositories.getSelectiveReceipt(id);
      if (existing) return this.readStoredReceipt(existing, project.wrappedDataKey, input.projectId);

      const decision = await this.repositories.getDecision(release.decisionId);
      if (!decision || decision.projectId !== input.projectId) return { ok: false, code: "DECISION_NOT_FOUND" };
      const operation = await this.repositories.getChainOperation(release.id);
      const issuedAt = this.now();
      const expiresAt = new Date(issuedAt.getTime() + this.receiptTtlMs);
      const payload = buildPayload(input.audience, {
        projectId: input.projectId,
        release,
        decision,
        transactionHash: operation?.transactionHash,
        confirmationState: confirmationState(release, operation?.status ?? release.status),
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
      const signed = this.signer.signPayload(payload);
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      const record: SelectiveReceiptRecord = {
        id,
        projectId: input.projectId,
        checkpointId: decision.checkpointId,
        receiptType: input.audience,
        encryptedPayload: encryptField(
          JSON.stringify(signed),
          { projectId: input.projectId, recordType: "selective_receipt", recordId: id, fieldName: "payload" },
          dataKey,
        ),
        proof: {
          algorithm: signed.algorithm,
          publicKeyId: signed.publicKeyId,
          payloadDigest: signed.payloadDigest,
          signature: signed.signature,
        },
        revoked: false,
        createdAt: issuedAt,
      };
      await this.repositories.saveSelectiveReceipt(record);
      await this.repositories.saveAuditEvent({
        id: `audit:${id}`,
        projectId: input.projectId,
        actorFingerprint: fingerprintWallet(input.actorWalletAddress, this.walletHashPepper),
        eventType: `${input.audience}_receipt_issued`,
        payloadDigest: signed.payloadDigest,
        createdAt: issuedAt,
      });
      return { ok: true, value: { receiptId: id, receipt: signed } };
    } catch (error) {
      if (error instanceof Error && error.message === "SELECTIVE_RECEIPT_ALREADY_EXISTS") {
        const existing = await this.repositories.getSelectiveReceipt(receiptId(input.audience, input.releaseId));
        if (existing) {
          const project = await this.repositories.getProject(input.projectId);
          if (project) return this.readStoredReceipt(existing, project.wrappedDataKey, input.projectId);
        }
      }
      if (error instanceof Error && error.message.startsWith("RECEIPT_")) return { ok: false, code: "SIGNING_UNAVAILABLE" };
      if (error instanceof Error && (error.message.startsWith("ENVELOPE_") || error.message.startsWith("KMS_"))) {
        return { ok: false, code: "ENCRYPTION_FAILED" };
      }
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  private async authorized(
    ownerFingerprint: string,
    projectId: string,
    walletAddress: string,
    audience: ReceiptAudience,
  ): Promise<boolean> {
    const actorFingerprint = fingerprintWallet(walletAddress, this.walletHashPepper);
    if (audience === "company") return actorFingerprint === ownerFingerprint;
    const roles = await this.repositories.getMemberRoles(projectId, actorFingerprint);
    return roles.includes(roleForAudience(audience));
  }

  private async readStoredReceipt(
    record: SelectiveReceiptRecord,
    wrappedDataKey: string,
    projectId: string,
  ): Promise<ReceiptServiceResult<IssuedReceipt>> {
    if (record.revoked) return { ok: false, code: "RECEIPT_REVOKED" };
    const dataKey = await this.keyProvider.unwrap(wrappedDataKey, projectId);
    const serialized = decryptField(
      record.encryptedPayload,
      { projectId, recordType: "selective_receipt", recordId: record.id, fieldName: "payload" },
      dataKey,
    );
    const receipt = signedReceiptSchema.parse(JSON.parse(serialized));
    return { ok: true, value: { receiptId: record.id, receipt } };
  }
}

function buildPayload(
  audience: ReceiptAudience,
  input: {
    projectId: string;
    release: ReleaseRecord;
    decision: {
      agreementDigest: string;
      checkpointDigest: string;
      decision: "accept" | "reject";
    };
    transactionHash?: string;
    confirmationState: ReleaseRecord["status"];
    issuedAt: string;
    expiresAt: string;
  },
): ReceiptPayload {
  if (audience === "company") {
    return companyReceiptPayloadSchema.parse({
      schemaVersion: 1,
      audience,
      projectId: input.projectId,
      agreementDigest: input.decision.agreementDigest,
      checkpointDigest: input.decision.checkpointDigest,
      decision: input.decision.decision,
      releaseKind: input.release.kind,
      amountMinor: input.release.amountMinor,
      transactionHash: input.transactionHash,
      confirmationState: input.confirmationState,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });
  }
  if (audience === "contributor") {
    return contributorReceiptPayloadSchema.parse({
      schemaVersion: 1,
      audience,
      projectAlias: `project-${commitment(input.projectId).slice(0, 12)}`,
      checkpointDigest: input.decision.checkpointDigest,
      decision: input.decision.decision,
      releaseAmountMinor: input.release.amountMinor,
      transactionHash: input.transactionHash,
      confirmationState: input.confirmationState,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    });
  }
  return auditorReceiptPayloadSchema.parse({
    schemaVersion: 1,
    audience,
    opaqueProjectId: `project-${commitment(input.projectId).slice(0, 20)}`,
    agreementDigest: input.decision.agreementDigest,
    checkpointDigest: input.decision.checkpointDigest,
    decision: input.decision.decision,
    calculationDigest: commitment({
      kind: input.release.kind,
      amountMinor: input.release.amountMinor,
      sourceId: input.release.sourceId,
      decisionId: input.release.decisionId,
    }),
    transactionHash: input.transactionHash,
    confirmationState: input.confirmationState,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}
