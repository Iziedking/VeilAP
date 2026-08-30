import { z } from "zod";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/i);
const amountSchema = z.string().regex(/^[1-9][0-9]*$/);
const transactionHashSchema = z.string().regex(/^0x[0-9a-f]+$/i).max(80);
const timestampSchema = z.string().datetime({ offset: true });

export const receiptConfirmationStateSchema = z.enum([
  "prepared",
  "wallet_prompted",
  "submitted",
  "unknown",
  "confirmed",
  "reverted",
]);

export const companyReceiptPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  audience: z.literal("company"),
  projectId: z.string().min(1).max(160),
  agreementDigest: digestSchema,
  checkpointDigest: digestSchema,
  decision: z.enum(["accept", "reject"]),
  releaseKind: z.enum(["milestone", "royalty"]).optional(),
  amountMinor: amountSchema.optional(),
  recipient: z.string().min(1).max(160).optional(),
  transactionHash: transactionHashSchema.optional(),
  confirmationState: receiptConfirmationStateSchema,
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
}).strict();

export const contributorReceiptPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  audience: z.literal("contributor"),
  projectAlias: z.string().regex(/^project-[0-9a-f]{12}$/),
  checkpointDigest: digestSchema,
  decision: z.enum(["accept", "reject"]),
  releaseAmountMinor: amountSchema.optional(),
  transactionHash: transactionHashSchema.optional(),
  confirmationState: receiptConfirmationStateSchema,
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
}).strict();

export const auditorReceiptPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  audience: z.literal("auditor"),
  opaqueProjectId: z.string().regex(/^project-[0-9a-f]{20}$/),
  agreementDigest: digestSchema,
  checkpointDigest: digestSchema,
  decision: z.enum(["accept", "reject"]),
  calculationDigest: digestSchema,
  transactionHash: transactionHashSchema.optional(),
  confirmationState: receiptConfirmationStateSchema,
  issuedAt: timestampSchema,
  expiresAt: timestampSchema,
}).strict();

export const arenaMatchReceiptPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  audience: z.literal("arena"),
  matchId: z.string().min(1).max(160),
  engineVersion: z.string().min(1).max(160),
  artifactCommitments: z.record(z.string().min(1).max(80), digestSchema).refine(
    (value) => Object.keys(value).length === 2,
    "ARENA_RECEIPT_PLAYERS_INVALID",
  ),
  score: z.record(z.string().min(1).max(80), z.number().int().nonnegative()).refine(
    (value) => Object.keys(value).length === 2,
    "ARENA_RECEIPT_SCORE_INVALID",
  ),
  winner: z.union([z.literal("tie"), z.string().min(1).max(80)]),
  seedCommitment: digestSchema,
  transcriptRoot: digestSchema,
  handCount: z.number().int().min(1).max(100),
  issuedAt: timestampSchema,
}).strict();

export type CompanyReceiptPayload = z.infer<typeof companyReceiptPayloadSchema>;
export type ContributorReceiptPayload = z.infer<typeof contributorReceiptPayloadSchema>;
export type AuditorReceiptPayload = z.infer<typeof auditorReceiptPayloadSchema>;
export type ArenaMatchReceiptPayload = z.infer<typeof arenaMatchReceiptPayloadSchema>;
export type ReceiptPayload = CompanyReceiptPayload | ContributorReceiptPayload | AuditorReceiptPayload;
export type ReceiptAudience = ReceiptPayload["audience"];

export const issueReceiptRequestSchema = z.object({
  audience: z.enum(["company", "contributor", "auditor"]),
  releaseId: z.string().min(1).max(160),
}).strict();

export const signedReceiptProofSchema = z.object({
  algorithm: z.literal("ed25519"),
  publicKeyId: z.string().regex(/^receipt-key-[0-9a-f]{16}$/),
  payloadDigest: digestSchema,
  signature: z.string().min(1),
}).strict();

export const signedReceiptSchema = z.object({
  payload: z.union([
    companyReceiptPayloadSchema,
    contributorReceiptPayloadSchema,
    auditorReceiptPayloadSchema,
  ]),
  signature: z.string().min(1),
  algorithm: z.literal("ed25519"),
  publicKeyId: z.string().regex(/^receipt-key-[0-9a-f]{16}$/),
  payloadDigest: digestSchema,
}).strict();

export const signedArenaMatchReceiptSchema = z.object({
  payload: arenaMatchReceiptPayloadSchema,
  signature: z.string().min(1),
  algorithm: z.literal("ed25519"),
  publicKeyId: z.string().regex(/^receipt-key-[0-9a-f]{16}$/),
  payloadDigest: digestSchema,
}).strict();

export type SignedReceipt = z.infer<typeof signedReceiptSchema>;
export type SignedArenaMatchReceipt = z.infer<typeof signedArenaMatchReceiptSchema>;
