import { randomUUID } from "node:crypto";
import { z } from "zod";

import { commitment, digestArtifact } from "@/domain/canonical";
import { authorizeCheckpoint } from "@/server/authorization/authorize";
import { decryptField } from "@/server/crypto/envelope";
import type {
  AgreementVersionRecord,
  CheckpointRecord,
  ProjectRepository,
  VerificationRunStatus,
} from "@/server/db/repositories";
import { MAX_ARTIFACT_BYTES, decodeArtifactBase64 } from "@/server/checkpoints/checkpoint-service";
import { agreementTermsSchema } from "@/server/projects/project-service";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { verifyDeterministically } from "./deterministic-verifier";
import { modelAdvisoryOutputSchema, createNoopModelAdapter } from "./model-adapter";
import {
  advisoryAssessmentSchema,
  type AdvisoryAssessment,
  type ModelAdapter,
  type VerificationVerdict,
  verificationVerdictSchema,
} from "./types";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const verifyCheckpointInputSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  agreementVersion: z.number().int().positive(),
  agreementDigest: digestSchema,
  artifactDigest: digestSchema,
  runAdvisory: z.boolean().default(false),
}).strict();

export type VerifyCheckpointInput = z.input<typeof verifyCheckpointInputSchema>;

export type VerificationServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "CHECKPOINT_NOT_FOUND"
  | "AGREEMENT_NOT_FOUND"
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "CHECKPOINT_NOT_ASSIGNED"
  | "EVIDENCE_FORBIDDEN"
  | "ENCRYPTION_FAILED"
  | "PERSISTENCE_FAILED";

export type VerificationServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: VerificationServiceErrorCode };

export interface VerificationView {
  runId: string;
  checkpointId: string;
  deterministicCode: ReturnType<typeof verifyDeterministically>["code"];
  verdict: VerificationVerdict;
}

export interface VerificationServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: {
    unwrap(wrappedKey: string, projectId: string): Promise<Uint8Array>;
  };
  walletHashPepper: string;
  modelAdapter?: ModelAdapter;
  now?: () => Date;
  idFactory?: () => string;
}

const checkpointMetadataSchema = z.object({
  agreementVersion: z.number().int().positive(),
  mediaType: z.literal("application/zip"),
  note: z.string().max(2_000),
  byteLength: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
}).strict();

function mapAuthorizationError(code: string): VerificationServiceErrorCode {
  if (code === "PROJECT_ACCESS_REQUIRED") return "PROJECT_ACCESS_REQUIRED";
  if (code === "CHECKPOINT_NOT_ASSIGNED") return "CHECKPOINT_NOT_ASSIGNED";
  if (code === "EVIDENCE_FORBIDDEN") return "EVIDENCE_FORBIDDEN";
  return "ROLE_FORBIDDEN";
}

function unavailableAdvisory(reason: string): AdvisoryAssessment {
  return {
    status: "unavailable",
    summary: `Advisory assessment unavailable: ${reason}.`,
    criteria: [],
  };
}

function notRunAdvisory(): AdvisoryAssessment {
  return {
    status: "not_run",
    summary: "No advisory assessment was requested.",
    criteria: [],
  };
}

export class VerificationService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: VerificationServiceDependencies["keyProvider"];
  private readonly walletHashPepper: string;
  private readonly modelAdapter: ModelAdapter;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: VerificationServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.modelAdapter = dependencies.modelAdapter ?? createNoopModelAdapter();
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async verifyCheckpoint(input: {
    checkpointId: string;
    actorWalletAddress: string;
    request: VerifyCheckpointInput;
  }): Promise<VerificationServiceResult<VerificationView>> {
    const parsed = verifyCheckpointInputSchema.safeParse(input.request);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

    try {
      const checkpoint = await this.repositories.getCheckpoint(input.checkpointId);
      if (!checkpoint) return { ok: false, code: "CHECKPOINT_NOT_FOUND" };
      const project = await this.repositories.getProject(checkpoint.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };

      const walletFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeCheckpoint(this.repositories, {
        checkpoint,
        walletFingerprint,
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationError(authorized.code) };
      if (!authorized.canReadEvidence) return { ok: false, code: "EVIDENCE_FORBIDDEN" };

      const agreement = await this.findAgreement(checkpoint);
      if (!agreement) return { ok: false, code: "AGREEMENT_NOT_FOUND" };

      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, checkpoint.projectId);
      const artifactBase64 = decryptField(
        checkpoint.encryptedPayload.artifact,
        { projectId: checkpoint.projectId, recordType: "checkpoint", recordId: checkpoint.id, fieldName: "artifact" },
        dataKey,
      );
      const metadataParsed = checkpointMetadataSchema.safeParse(JSON.parse(decryptField(
        checkpoint.encryptedPayload.metadata,
        { projectId: checkpoint.projectId, recordType: "checkpoint", recordId: checkpoint.id, fieldName: "metadata" },
        dataKey,
      )));
      const bytes = decodeArtifactBase64(artifactBase64);
      if (!metadataParsed.success || !bytes || metadataParsed.data.byteLength !== bytes.byteLength) {
        return this.persistRejected(checkpoint.projectId, input.checkpointId, walletFingerprint, "ARTIFACT_ENCODING_INVALID", {
          schemaVersion: 1,
          checkpointId: input.checkpointId,
          agreementDigest: agreement.termsDigest,
          artifactDigest: checkpoint.payloadDigest,
          deterministic: { digestMatches: false, agreementMatches: false, scopeAccepted: false },
          advisory: notRunAdvisory(),
        });
      }

      const deterministic = verifyDeterministically({
        checkpointId: checkpoint.id,
        expectedProjectId: parsed.data.projectId,
        actualProjectId: checkpoint.projectId,
        expectedAgreementVersion: parsed.data.agreementVersion,
        actualAgreementVersion: agreement.version,
        expectedAgreementDigest: parsed.data.agreementDigest,
        actualAgreementDigest: agreement.termsDigest,
        expectedArtifactDigest: parsed.data.artifactDigest,
        storedArtifactDigest: checkpoint.payloadDigest,
        computedArtifactDigest: digestArtifact(bytes),
        mediaType: metadataParsed.data.mediaType,
        byteLength: metadataParsed.data.byteLength,
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
      });

      let advisory = notRunAdvisory();
      let adapterMetadata: Record<string, string> | undefined;
      if (deterministic.scopeAccepted && parsed.data.runAdvisory) {
        const modelInput = {
          checkpointId: checkpoint.id,
          agreementDigest: agreement.termsDigest,
          artifactDigest: checkpoint.payloadDigest,
          criteria: this.agreementCriteria(agreement, dataKey),
        } as const;
        const modelInputDigest = commitment(modelInput);
        try {
          const modelResult = await this.modelAdapter.assess(modelInput);
          if (modelResult.kind === "unavailable") {
            advisory = unavailableAdvisory(modelResult.reason);
            adapterMetadata = { inputDigest: modelInputDigest, reason: modelResult.reason };
          } else {
            const output = modelAdvisoryOutputSchema.safeParse(modelResult.output);
            if (!output.success) {
              advisory = unavailableAdvisory("ADVISORY_OUTPUT_INVALID");
              adapterMetadata = { inputDigest: modelInputDigest, reason: "ADVISORY_OUTPUT_INVALID" };
            } else {
              advisory = advisoryAssessmentSchema.parse({ ...output.data, status: "available" });
              adapterMetadata = {
                inputDigest: modelInputDigest,
                outputDigest: commitment(output.data),
                provider: modelResult.provider,
                model: modelResult.model,
                ...(modelResult.costMinor ? { costMinor: modelResult.costMinor } : {}),
              };
            }
          }
        } catch {
          advisory = unavailableAdvisory("ADVISORY_PROVIDER_FAILED");
          adapterMetadata = { inputDigest: modelInputDigest, reason: "ADVISORY_PROVIDER_FAILED" };
        }
      }

      const verdict = verificationVerdictSchema.parse({
        schemaVersion: 1,
        checkpointId: checkpoint.id,
        agreementDigest: agreement.termsDigest,
        artifactDigest: digestArtifact(bytes),
        deterministic: {
          digestMatches: deterministic.digestMatches,
          agreementMatches: deterministic.agreementMatches,
          scopeAccepted: deterministic.scopeAccepted,
        },
        advisory,
      });
      const status: VerificationRunStatus = deterministic.scopeAccepted ? "completed" : "rejected";
      return this.persistRun(checkpoint.projectId, input.checkpointId, walletFingerprint, status, deterministic.code, verdict, adapterMetadata);
    } catch {
      return { ok: false, code: "ENCRYPTION_FAILED" };
    }
  }

  private async findAgreement(checkpoint: CheckpointRecord) {
    const agreements = await this.repositories.listAgreements(checkpoint.projectId);
    return agreements.find((candidate) => candidate.id === checkpoint.agreementVersionId);
  }

  private agreementCriteria(
    agreement: AgreementVersionRecord,
    dataKey: Uint8Array,
  ): { id: string; description: string }[] {
    const terms = agreementTermsSchema.parse(JSON.parse(decryptField(
      agreement.encryptedTerms,
      { projectId: agreement.projectId, recordType: "agreement", recordId: agreement.id, fieldName: "terms" },
      dataKey,
    )));
    return terms.acceptanceCriteria.map((criterion) => ({ id: criterion.id, description: criterion.description }));
  }

  private async persistRejected(
    projectId: string,
    checkpointId: string,
    verifierFingerprint: string,
    code: ReturnType<typeof verifyDeterministically>["code"],
    verdict: VerificationVerdict,
  ): Promise<VerificationServiceResult<VerificationView>> {
    return this.persistRun(projectId, checkpointId, verifierFingerprint, "rejected", code, verdict);
  }

  private async persistRun(
    projectId: string,
    checkpointId: string,
    verifierFingerprint: string,
    status: VerificationRunStatus,
    deterministicCode: ReturnType<typeof verifyDeterministically>["code"],
    verdict: VerificationVerdict,
    adapterMetadata?: Record<string, string>,
  ): Promise<VerificationServiceResult<VerificationView>> {
    const runId = this.idFactory();
    const createdAt = this.now();
    await this.repositories.saveVerificationRun({
      id: runId,
      checkpointId,
      verifierFingerprint,
      status,
      result: {
        verdict,
        ...(adapterMetadata ? { advisoryAdapter: adapterMetadata } : {}),
      },
      createdAt,
    });
    await this.repositories.saveAuditEvent({
      id: this.idFactory(),
      projectId,
      actorFingerprint: verifierFingerprint,
      eventType: "verification_completed",
      payloadDigest: commitment({ checkpointId, runId, verdict }),
      createdAt: this.now(),
    });
    return {
      ok: true,
      value: { runId, checkpointId, deterministicCode, verdict },
    };
  }
}
