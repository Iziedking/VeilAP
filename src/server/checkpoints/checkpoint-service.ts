import { randomUUID } from "node:crypto";
import { z } from "zod";

import { commitment, digestArtifact } from "@/domain/canonical";
import { decryptField, encryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import type {
  CheckpointRecord,
  ProjectRepository,
} from "@/server/db/repositories";
import { authorizeCheckpoint, authorizeProject } from "@/server/authorization/authorize";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";

export const createCheckpointInputSchema = z.object({
  agreementVersion: z.number().int().positive(),
  artifactBase64: z.string().max(1_500_000),
  mediaType: z.literal("application/zip"),
  note: z.string().max(2_000),
  sourceUrl: z.string().url().optional(),
  reviewerWalletAddress: z.string().min(3).max(80).optional(),
}).strict();

export type CreateCheckpointInput = z.infer<typeof createCheckpointInputSchema>;

export type CheckpointServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "AGREEMENT_NOT_FOUND"
  | "REVIEWER_NOT_INVITED"
  | "ARTIFACT_EMPTY"
  | "ARTIFACT_TOO_LARGE"
  | "ARTIFACT_ENCODING_INVALID"
  | "URL_EVIDENCE_REFUSED"
  | "ARTIFACT_TAMPERED"
  | "CHECKPOINT_NOT_FOUND"
  | "CHECKPOINT_NOT_ASSIGNED"
  | "EVIDENCE_FORBIDDEN"
  | "ENCRYPTION_FAILED"
  | "PERSISTENCE_FAILED";

export type CheckpointServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: CheckpointServiceErrorCode };

export interface CheckpointServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  walletHashPepper: string;
  now?: () => Date;
  idFactory?: () => string;
}

export interface CheckpointView {
  id: string;
  projectId: string;
  agreementVersion: number;
  sequence: number;
  payloadDigest: string;
  status: CheckpointRecord["status"];
  createdAt: string;
  mediaType?: "application/zip";
  note?: string;
  byteLength?: number;
  artifactBase64?: string;
}

export const MAX_ARTIFACT_BYTES = 1_048_576;

export function decodeArtifactBase64(value: string): Uint8Array | undefined {
  if (value.length === 0 || value.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return undefined;
  }
  const decoded = Buffer.from(value, "base64");
  const normalizedInput = value.replace(/=+$/, "");
  const normalizedDecoded = decoded.toString("base64").replace(/=+$/, "");
  if (normalizedInput !== normalizedDecoded) return undefined;
  return new Uint8Array(decoded);
}

function mapAuthorizationError(code: string): CheckpointServiceErrorCode {
  if (code === "PROJECT_ACCESS_REQUIRED") return "PROJECT_ACCESS_REQUIRED";
  if (code === "CHECKPOINT_NOT_ASSIGNED") return "CHECKPOINT_NOT_ASSIGNED";
  if (code === "EVIDENCE_FORBIDDEN") return "EVIDENCE_FORBIDDEN";
  return "ROLE_FORBIDDEN";
}

export class CheckpointService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly walletHashPepper: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: CheckpointServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async submitCheckpoint(input: {
    projectId: string;
    actorWalletAddress: string;
    checkpoint: CreateCheckpointInput;
  }): Promise<CheckpointServiceResult<CheckpointView>> {
    const parsed = createCheckpointInputSchema.safeParse(input.checkpoint);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    if (parsed.data.sourceUrl) return { ok: false, code: "URL_EVIDENCE_REFUSED" };
    const bytes = decodeArtifactBase64(parsed.data.artifactBase64);
    if (!bytes) return { ok: false, code: "ARTIFACT_ENCODING_INVALID" };
    if (bytes.byteLength === 0) return { ok: false, code: "ARTIFACT_EMPTY" };
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) return { ok: false, code: "ARTIFACT_TOO_LARGE" };

    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const createdBy = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId: input.projectId,
        walletFingerprint: createdBy,
        action: "submit_checkpoint",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationError(authorized.code) };

      const agreement = await this.repositories.getAgreement(input.projectId, parsed.data.agreementVersion);
      if (!agreement) return { ok: false, code: "AGREEMENT_NOT_FOUND" };

      let assignedReviewerFingerprint: string | undefined;
      if (parsed.data.reviewerWalletAddress) {
        assignedReviewerFingerprint = fingerprintWallet(parsed.data.reviewerWalletAddress, this.walletHashPepper);
        const reviewerRoles = await this.repositories.getMemberRoles(input.projectId, assignedReviewerFingerprint);
        if (!reviewerRoles.includes("reviewer")) return { ok: false, code: "REVIEWER_NOT_INVITED" };
      }

      const existing = await this.repositories.listCheckpoints(input.projectId);
      const sequence = (existing.at(-1)?.sequence ?? 0) + 1;
      const id = this.idFactory();
      const createdAt = this.now();
      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, input.projectId);
      const payloadDigest = digestArtifact(bytes);
      const encryptedPayload = {
        artifact: encryptField(
          parsed.data.artifactBase64,
          { projectId: input.projectId, recordType: "checkpoint", recordId: id, fieldName: "artifact" },
          dataKey,
        ),
        metadata: encryptField(
          JSON.stringify({
            agreementVersion: parsed.data.agreementVersion,
            mediaType: parsed.data.mediaType,
            note: parsed.data.note,
            byteLength: bytes.byteLength,
          }),
          { projectId: input.projectId, recordType: "checkpoint", recordId: id, fieldName: "metadata" },
          dataKey,
        ),
      };
      const record: CheckpointRecord = {
        id,
        projectId: input.projectId,
        agreementVersionId: agreement.id,
        sequence,
        encryptedPayload,
        payloadDigest,
        status: "submitted",
        createdBy,
        assignedReviewerFingerprint,
        createdAt,
      };
      await this.repositories.saveCheckpoint(record);
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId: input.projectId,
        actorFingerprint: createdBy,
        eventType: "checkpoint_submitted",
        payloadDigest: commitment({ checkpointId: id, payloadDigest, agreementVersionId: agreement.id }),
        createdAt: this.now(),
      });
      return {
        ok: true,
        value: this.view(record, {
          agreementVersion: parsed.data.agreementVersion,
          mediaType: parsed.data.mediaType,
          note: parsed.data.note,
          byteLength: bytes.byteLength,
        }),
      };
    } catch {
      return { ok: false, code: "ENCRYPTION_FAILED" };
    }
  }

  async readCheckpoint(input: {
    checkpointId: string;
    walletAddress: string;
  }): Promise<CheckpointServiceResult<CheckpointView>> {
    try {
      const record = await this.repositories.getCheckpoint(input.checkpointId);
      if (!record) return { ok: false, code: "CHECKPOINT_NOT_FOUND" };
      const project = await this.repositories.getProject(record.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const agreementVersion = await this.agreementVersion(record);
      if (agreementVersion === 0) return { ok: false, code: "AGREEMENT_NOT_FOUND" };
      const walletFingerprint = fingerprintWallet(input.walletAddress, this.walletHashPepper);
      const authorized = await authorizeCheckpoint(this.repositories, {
        checkpoint: record,
        walletFingerprint,
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationError(authorized.code) };

      const agreement = await this.repositories.getAgreement(record.projectId, agreementVersion);
      if (!agreement) return { ok: false, code: "AGREEMENT_NOT_FOUND" };
      if (!authorized.canReadEvidence) {
        return { ok: true, value: this.view(record, { agreementVersion }) };
      }

      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, record.projectId);
      const artifactBase64 = decryptField(
        record.encryptedPayload.artifact,
        { projectId: record.projectId, recordType: "checkpoint", recordId: record.id, fieldName: "artifact" },
        dataKey,
      );
      const metadata = JSON.parse(decryptField(
        record.encryptedPayload.metadata,
        { projectId: record.projectId, recordType: "checkpoint", recordId: record.id, fieldName: "metadata" },
        dataKey,
      )) as { mediaType: "application/zip"; note: string; byteLength: number; agreementVersion: number };
      const bytes = decodeArtifactBase64(artifactBase64);
      if (!bytes || digestArtifact(bytes) !== record.payloadDigest) {
        return { ok: false, code: "ARTIFACT_TAMPERED" };
      }
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId: record.projectId,
        actorFingerprint: walletFingerprint,
        eventType: "evidence_read",
        payloadDigest: commitment({ checkpointId: record.id, payloadDigest: record.payloadDigest }),
        createdAt: this.now(),
      });
      return {
        ok: true,
        value: this.view(record, { artifactBase64, ...metadata }),
      };
    } catch {
      return { ok: false, code: "ENCRYPTION_FAILED" };
    }
  }

  async listCheckpoints(input: {
    projectId: string;
    walletAddress: string;
  }): Promise<CheckpointServiceResult<CheckpointView[]>> {
    try {
      const project = await this.repositories.getProject(input.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const walletFingerprint = fingerprintWallet(input.walletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId: input.projectId,
        walletFingerprint,
        action: "read_project",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationError(authorized.code) };
      const records = await this.repositories.listCheckpoints(input.projectId);
      const views = await Promise.all(records.map(async (record) => this.view(record, {
        agreementVersion: await this.agreementVersion(record),
      })));
      return { ok: true, value: views };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  private async agreementVersion(record: CheckpointRecord): Promise<number> {
    const agreements = await this.repositories.listAgreements(record.projectId);
    const agreement = agreements.find((candidate) => candidate.id === record.agreementVersionId);
    return agreement?.version ?? 0;
  }

  private view(record: CheckpointRecord, details?: Partial<CheckpointView>): CheckpointView {
    return {
      id: record.id,
      projectId: record.projectId,
      agreementVersion: details?.agreementVersion ?? 0,
      sequence: record.sequence,
      payloadDigest: record.payloadDigest,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      ...(details ?? {}),
    };
  }
}
