import { z } from "zod";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const identifierSchema = z.string().trim().min(1).max(120);

export const advisoryCriterionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  result: z.enum(["met", "not_met", "unclear"]),
  reason: z.string().max(500),
}).strict();

export const advisoryAssessmentSchema = z.object({
  status: z.enum(["not_run", "available", "unavailable"]),
  summary: z.string().max(1_000),
  criteria: z.array(advisoryCriterionSchema).max(20),
}).strict();

export const verificationVerdictSchema = z.object({
  schemaVersion: z.literal(1),
  checkpointId: identifierSchema,
  agreementDigest: digestSchema,
  artifactDigest: digestSchema,
  deterministic: z.object({
    digestMatches: z.boolean(),
    agreementMatches: z.boolean(),
    scopeAccepted: z.boolean(),
  }).strict(),
  advisory: advisoryAssessmentSchema,
}).strict();

export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;
export type AdvisoryAssessment = z.infer<typeof advisoryAssessmentSchema>;

export type DeterministicVerificationCode =
  | "VERIFIED"
  | "ARTIFACT_TAMPERED"
  | "AGREEMENT_STALE"
  | "AGREEMENT_DIGEST_MISMATCH"
  | "PROJECT_MISMATCH"
  | "MEDIA_TYPE_UNSUPPORTED"
  | "ARTIFACT_TOO_LARGE"
  | "ARTIFACT_ENCODING_INVALID";

export interface DeterministicVerificationInput {
  checkpointId: string;
  expectedProjectId: string;
  actualProjectId: string;
  expectedAgreementVersion: number;
  actualAgreementVersion: number;
  expectedAgreementDigest: string;
  actualAgreementDigest: string;
  expectedArtifactDigest: string;
  storedArtifactDigest: string;
  computedArtifactDigest: string;
  mediaType: string;
  byteLength: number;
  maxArtifactBytes: number;
}

export type ModelAdapterInput = {
  checkpointId: string;
  agreementDigest: string;
  artifactDigest: string;
  criteria: readonly { id: string; description: string }[];
};

export type ModelAdapterResult =
  | { kind: "available"; provider: string; model: string; output: unknown; costMinor?: string }
  | { kind: "unavailable"; reason: string };

export interface ModelAdapter {
  assess(input: ModelAdapterInput): Promise<ModelAdapterResult>;
}
