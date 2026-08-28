import { randomUUID } from "node:crypto";

import { validateAndParseAddress, type TypedData } from "starknet";
import { z } from "zod";

import { commitment } from "@/domain/canonical";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import type { DecisionRecord, ProjectRepository } from "@/server/db/repositories";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const signedDecisionSchema = z.object({
  schemaVersion: z.literal(1),
  chainId: z.literal("SN_MAIN"),
  projectId: z.string().trim().min(1).max(120),
  agreementVersion: z.number().int().positive(),
  agreementDigest: digestSchema,
  checkpointId: z.string().trim().min(1).max(120),
  checkpointDigest: digestSchema,
  verificationDigest: digestSchema,
  decision: z.enum(["accept", "reject"]),
  releaseAmountMinor: z.string().regex(/^[1-9][0-9]*$/).optional(),
  nonce: z.string().regex(/^0x[0-9a-f]+$/i).max(80),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  signature: z.array(z.string().min(1).max(200)).min(1).max(16),
}).strict().superRefine((value, context) => {
  if (value.decision === "accept" && !value.releaseAmountMinor) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["releaseAmountMinor"], message: "RELEASE_AMOUNT_REQUIRED" });
  }
  if (value.decision === "reject" && value.releaseAmountMinor) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["releaseAmountMinor"], message: "RELEASE_AMOUNT_FORBIDDEN" });
  }
});

export type SignedDecisionInput = z.infer<typeof signedDecisionSchema>;

export interface DecisionTypedData extends TypedData {
  primaryType: "VeilAPDecision";
  message: {
    schemaVersion: number;
    chainId: string;
    projectId: string;
    agreementVersion: number;
    agreementDigest: string;
    checkpointId: string;
    checkpointDigest: string;
    verificationDigest: string;
    decision: string;
    releaseAmountMinor: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
  };
}

export type DecisionServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "CHECKPOINT_NOT_FOUND"
  | "AGREEMENT_NOT_FOUND"
  | "VERIFICATION_NOT_FOUND"
  | "AGREEMENT_STALE"
  | "CHECKPOINT_STALE"
  | "VERIFICATION_STALE"
  | "WALLET_FORBIDDEN"
  | "DECISION_EXPIRED"
  | "DECISION_NONCE_REPLAYED"
  | "SIGNATURE_INVALID"
  | "SIGNATURE_UNAVAILABLE"
  | "PERSISTENCE_FAILED";

export type DecisionServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DecisionServiceErrorCode };

export interface DecisionView {
  id: string;
  projectId: string;
  checkpointId: string;
  decision: DecisionRecord["decision"];
  releaseAmountMinor?: string;
  payloadDigest: string;
  createdAt: string;
}

export interface DecisionServiceDependencies {
  repositories: ProjectRepository;
  walletHashPepper: string;
  verifySignature: (typedData: DecisionTypedData, signature: string[], walletAddress: string) => Promise<boolean>;
  chainId?: "SN_MAIN";
  now?: () => Date;
  idFactory?: () => string;
}

function typedData(input: SignedDecisionInput): DecisionTypedData {
  return {
    domain: { name: "VeilAP Decision", chainId: input.chainId, version: "1" },
    types: {
      StarkNetDomain: [
        { name: "name", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "version", type: "felt" },
      ],
      VeilAPDecision: [
        { name: "schemaVersion", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "projectId", type: "string" },
        { name: "agreementVersion", type: "felt" },
        { name: "agreementDigest", type: "string" },
        { name: "checkpointId", type: "string" },
        { name: "checkpointDigest", type: "string" },
        { name: "verificationDigest", type: "string" },
        { name: "decision", type: "string" },
        { name: "releaseAmountMinor", type: "string" },
        { name: "nonce", type: "felt" },
        { name: "issuedAt", type: "string" },
        { name: "expiresAt", type: "string" },
      ],
    },
    primaryType: "VeilAPDecision",
    message: {
      schemaVersion: input.schemaVersion,
      chainId: input.chainId,
      projectId: input.projectId,
      agreementVersion: input.agreementVersion,
      agreementDigest: input.agreementDigest,
      checkpointId: input.checkpointId,
      checkpointDigest: input.checkpointDigest,
      verificationDigest: input.verificationDigest,
      decision: input.decision,
      releaseAmountMinor: input.releaseAmountMinor ?? "0",
      nonce: input.nonce,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    },
  };
}

function view(record: DecisionRecord): DecisionView {
  return {
    id: record.id,
    projectId: record.projectId,
    checkpointId: record.checkpointId,
    decision: record.decision,
    releaseAmountMinor: record.releaseAmountMinor,
    payloadDigest: commitment(decisionDigestPayload(record)),
    createdAt: record.createdAt.toISOString(),
  };
}

function decisionDigestPayload(record: DecisionRecord): Record<string, unknown> {
  return {
    schemaVersion: record.schemaVersion,
    projectId: record.projectId,
    checkpointId: record.checkpointId,
    agreementVersion: record.agreementVersion,
    agreementDigest: record.agreementDigest,
    checkpointDigest: record.checkpointDigest,
    verificationDigest: record.verificationDigest,
    decision: record.decision,
    releaseAmountMinor: record.releaseAmountMinor ?? null,
    nonce: record.nonce,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    signature: record.signature,
    decidedBy: record.decidedBy,
  };
}

export class DecisionService {
  private readonly repositories: ProjectRepository;
  private readonly walletHashPepper: string;
  private readonly verifySignature: DecisionServiceDependencies["verifySignature"];
  private readonly chainId: "SN_MAIN";
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: DecisionServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.verifySignature = dependencies.verifySignature;
    this.chainId = dependencies.chainId ?? "SN_MAIN";
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async createDecision(input: {
    actorWalletAddress: string;
    request: SignedDecisionInput;
  }): Promise<DecisionServiceResult<DecisionView>> {
    const parsed = signedDecisionSchema.safeParse(input.request);
    if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
    const request = parsed.data;
    const now = this.now();
    if (request.chainId !== this.chainId || Date.parse(request.expiresAt) <= now.getTime() || Date.parse(request.issuedAt) > now.getTime()) {
      return { ok: false, code: "DECISION_EXPIRED" };
    }

    try {
      const project = await this.repositories.getProject(request.projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      if (actorFingerprint !== project.ownerFingerprint) return { ok: false, code: "WALLET_FORBIDDEN" };
      if (await this.repositories.getDecisionByNonce(request.nonce)) return { ok: false, code: "DECISION_NONCE_REPLAYED" };

      const checkpoint = await this.repositories.getCheckpoint(request.checkpointId);
      if (!checkpoint) return { ok: false, code: "CHECKPOINT_NOT_FOUND" };
      if (checkpoint.projectId !== request.projectId || checkpoint.payloadDigest !== request.checkpointDigest) {
        return { ok: false, code: "CHECKPOINT_STALE" };
      }

      const agreement = await this.repositories.getAgreement(request.projectId, request.agreementVersion);
      if (!agreement) return { ok: false, code: "AGREEMENT_NOT_FOUND" };
      if (checkpoint.agreementVersionId !== agreement.id || agreement.termsDigest !== request.agreementDigest) {
        return { ok: false, code: "AGREEMENT_STALE" };
      }

      const reports = await this.repositories.listVerificationRuns(request.checkpointId);
      const matchingReport = reports.find((report) => report.status === "completed" && report.result && commitment(report.result) === request.verificationDigest);
      if (!matchingReport) return { ok: false, code: "VERIFICATION_STALE" };

      let valid: boolean;
      try {
        valid = await this.verifySignature(typedData(request), request.signature, validateAndParseAddress(input.actorWalletAddress));
      } catch {
        return { ok: false, code: "SIGNATURE_UNAVAILABLE" };
      }
      if (!valid) return { ok: false, code: "SIGNATURE_INVALID" };

      const record: DecisionRecord = {
        id: this.idFactory(),
        checkpointId: request.checkpointId,
        schemaVersion: 1,
        projectId: request.projectId,
        agreementVersion: agreement.version,
        agreementDigest: agreement.termsDigest,
        checkpointDigest: checkpoint.payloadDigest,
        verificationDigest: request.verificationDigest,
        decision: request.decision,
        releaseAmountMinor: request.releaseAmountMinor,
        nonce: request.nonce,
        issuedAt: new Date(request.issuedAt),
        expiresAt: new Date(request.expiresAt),
        signature: request.signature,
        decidedBy: actorFingerprint,
        createdAt: now,
      };
      await this.repositories.saveDecision(record);
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId: request.projectId,
        actorFingerprint,
        eventType: "company_decision_recorded",
        payloadDigest: commitment(decisionDigestPayload(record)),
        createdAt: now,
      });
      return { ok: true, value: view(record) };
    } catch (error) {
      if (error instanceof Error && error.message === "DECISION_NONCE_ALREADY_EXISTS") {
        return { ok: false, code: "DECISION_NONCE_REPLAYED" };
      }
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }
}
