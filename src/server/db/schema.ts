import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  walletFingerprint: text("wallet_fingerprint").notNull(),
  challenge: jsonb("challenge").notNull(),
  digest: text("digest").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
});

export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  walletFingerprint: text("wallet_fingerprint").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerFingerprint: text("owner_fingerprint").notNull(),
  wrappedDataKey: text("wrapped_data_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: text("project_id").notNull(),
    walletFingerprint: text("wallet_fingerprint").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    identity: primaryKey({ columns: [table.projectId, table.walletFingerprint, table.role] }),
    projectMember: uniqueIndex("project_members_project_wallet_role_idx").on(
      table.projectId,
      table.walletFingerprint,
      table.role,
    ),
  }),
);

export const agreementVersions = pgTable(
  "agreement_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    version: integer("version").notNull(),
    encryptedTerms: jsonb("encrypted_terms").notNull(),
    termsDigest: text("terms_digest").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    projectVersion: uniqueIndex("agreement_versions_project_version_idx").on(
      table.projectId,
      table.version,
    ),
  }),
);

export const checkpoints = pgTable(
  "checkpoints",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    agreementVersionId: text("agreement_version_id").notNull(),
    sequence: integer("sequence").notNull(),
    encryptedPayload: jsonb("encrypted_payload").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    status: text("status").notNull(),
    createdBy: text("created_by").notNull(),
    assignedReviewerFingerprint: text("assigned_reviewer_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    projectSequence: uniqueIndex("checkpoints_project_sequence_idx").on(
      table.projectId,
      table.sequence,
    ),
  }),
);

export const verificationRuns = pgTable("verification_runs", {
  id: text("id").primaryKey(),
  checkpointId: text("checkpoint_id").notNull(),
  verifierFingerprint: text("verifier_fingerprint").notNull(),
  status: text("status").notNull(),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    checkpointId: text("checkpoint_id").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    projectId: text("project_id").notNull(),
    agreementVersion: integer("agreement_version").notNull(),
    agreementDigest: text("agreement_digest").notNull(),
    checkpointDigest: text("checkpoint_digest").notNull(),
    verificationDigest: text("verification_digest").notNull(),
    decision: text("decision").notNull(),
    releaseAmountMinor: text("release_amount_minor"),
    nonce: text("nonce").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    signature: jsonb("signature").notNull(),
    decidedBy: text("decided_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    checkpoint: uniqueIndex("decisions_checkpoint_idx").on(table.checkpointId),
    nonce: uniqueIndex("decisions_nonce_idx").on(table.nonce),
  }),
);

export const revenueEvents = pgTable("revenue_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  eventType: text("event_type").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const releases = pgTable(
  "releases",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    sourceId: text("source_id").notNull(),
    projectId: text("project_id").notNull(),
    decisionId: text("decision_id").notNull(),
    amountMinor: text("amount_minor").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    source: uniqueIndex("releases_kind_source_idx").on(table.kind, table.sourceId),
    idempotency: uniqueIndex("releases_idempotency_idx").on(table.idempotencyKey),
  }),
);

export const chainOperations = pgTable(
  "chain_operations",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id").notNull(),
    operationType: text("operation_type").notNull(),
    status: text("status").notNull(),
    transactionHash: text("transaction_hash"),
    receiptDigest: text("receipt_digest"),
    reason: text("reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    release: uniqueIndex("chain_operations_release_idx").on(table.releaseId),
    transaction: uniqueIndex("chain_operations_transaction_idx").on(table.transactionHash),
  }),
);

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  actorFingerprint: text("actor_fingerprint").notNull(),
  eventType: text("event_type").notNull(),
  payloadDigest: text("payload_digest").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const selectiveReceipts = pgTable("selective_receipts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  checkpointId: text("checkpoint_id"),
  receiptType: text("receipt_type").notNull(),
  encryptedPayload: jsonb("encrypted_payload").notNull(),
  proof: jsonb("proof").notNull(),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
