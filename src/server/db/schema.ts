import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const arenaStrategyArtifacts = pgTable(
  "arena_strategy_artifacts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    agentId: text("agent_id").notNull(),
    displayName: text("display_name").notNull(),
    artifactCommitment: text("artifact_commitment").notNull(),
    encryptedPolicy: jsonb("encrypted_policy").notNull(),
    ownerFingerprint: text("owner_fingerprint"),
    encryptedOwnerWallet: jsonb("encrypted_owner_wallet"),
    status: text("status").notNull().default("sealed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    projectAgent: uniqueIndex("arena_strategy_artifacts_project_agent_idx").on(table.projectId, table.agentId),
    projectCommitment: uniqueIndex("arena_strategy_artifacts_project_commitment_idx").on(table.projectId, table.artifactCommitment),
  }),
);

export const arenaMatchReceipts = pgTable(
  "arena_match_receipts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    leftAgentId: text("left_agent_id").notNull(),
    rightAgentId: text("right_agent_id").notNull(),
    leftDisplayName: text("left_display_name").notNull(),
    rightDisplayName: text("right_display_name").notNull(),
    publicReceipt: jsonb("public_receipt").notNull(),
    signedReceipt: jsonb("signed_receipt"),
    encryptedSeed: jsonb("encrypted_seed").notNull(),
    handCount: integer("hand_count"),
    idempotencyKey: text("idempotency_key"),
    requestDigest: text("request_digest"),
    status: text("status").notNull().default("completed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    projectMatch: uniqueIndex("arena_match_receipts_project_match_idx").on(table.projectId, table.id),
    projectIdempotency: uniqueIndex("arena_match_receipts_project_idempotency_idx").on(table.projectId, table.idempotencyKey),
  }),
);

export const arenaMatchReveals = pgTable(
  "arena_match_reveals",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    matchId: text("match_id").notNull(),
    agentId: text("agent_id").notNull(),
    handIndex: integer("hand_index").notNull(),
    handNumber: integer("hand_number").notNull(),
    position: text("position").notNull(),
    action: text("action").notNull(),
    seatSwapped: boolean("seat_swapped").notNull(),
    actionCommitment: text("action_commitment").notNull(),
    handCommitment: text("hand_commitment").notNull(),
    transcriptRoot: text("transcript_root").notNull(),
    publicHandReceipt: jsonb("public_hand_receipt").notNull(),
    proof: jsonb("proof").notNull(),
    idempotencyKey: text("idempotency_key"),
    requestDigest: text("request_digest"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    projectMatch: uniqueIndex("arena_match_reveals_project_match_idx").on(table.projectId, table.matchId),
    projectIdempotency: uniqueIndex("arena_match_reveals_project_idempotency_idx").on(table.projectId, table.idempotencyKey),
  }),
);

export const arenaSeasons = pgTable(
  "arena_seasons",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    rulesetVersion: text("ruleset_version").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    locksAt: timestamp("locks_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"),
    entryMode: text("entry_mode").notNull().default("invite_only"),
    maxEntries: integer("max_entries").notNull().default(16),
    templateId: text("template_id"),
    templateVersion: integer("template_version"),
    rulesSnapshot: jsonb("rules_snapshot"),
    rulesCommitment: text("rules_commitment"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createIdempotencyKey: text("create_idempotency_key"),
    createRequestDigest: text("create_request_digest"),
    lockIdempotencyKey: text("lock_idempotency_key"),
    lockRequestDigest: text("lock_request_digest"),
  },
  (table) => ({
    projectCreateIdempotency: uniqueIndex("arena_seasons_project_create_idempotency_idx").on(
      table.projectId,
      table.createIdempotencyKey,
    ),
    entryModeCheck: check("arena_seasons_entry_mode_check", sql`${table.entryMode} in ('invite_only', 'open')`),
    maxEntriesCheck: check("arena_seasons_max_entries_check", sql`${table.maxEntries} between 2 and 32`),
    templateVersionCheck: check(
      "arena_seasons_template_version_check",
      sql`${table.templateVersion} is null or ${table.templateVersion} > 0`,
    ),
  }),
);

export const arenaSeasonEntries = pgTable(
  "arena_season_entries",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id").notNull(),
    projectId: text("project_id").notNull(),
    agentId: text("agent_id").notNull(),
    displayName: text("display_name").notNull(),
    artifactCommitment: text("artifact_commitment").notNull(),
    ownerFingerprint: text("owner_fingerprint"),
    encryptedPayoutWallet: jsonb("encrypted_payout_wallet"),
    version: integer("version").notNull().default(1),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key"),
    requestDigest: text("request_digest"),
  },
  (table) => ({
    seasonAgent: uniqueIndex("arena_season_entries_season_agent_idx").on(table.seasonId, table.agentId),
    seasonOwner: uniqueIndex("arena_season_entries_season_owner_idx").on(table.seasonId, table.ownerFingerprint),
    seasonIdempotency: uniqueIndex("arena_season_entries_season_idempotency_idx").on(
      table.seasonId,
      table.idempotencyKey,
    ),
  }),
);

export const arenaEntryVersions = pgTable(
  "arena_entry_versions",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull(),
    seasonId: text("season_id").notNull(),
    projectId: text("project_id").notNull(),
    version: integer("version").notNull(),
    agentId: text("agent_id").notNull(),
    displayName: text("display_name").notNull(),
    artifactCommitment: text("artifact_commitment").notNull(),
    status: text("status").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    requestDigest: text("request_digest"),
  },
  (table) => ({
    entryVersion: uniqueIndex("arena_entry_versions_entry_version_idx").on(table.entryId, table.version),
    seasonIdempotency: uniqueIndex("arena_entry_versions_season_idempotency_idx").on(
      table.seasonId,
      table.idempotencyKey,
    ),
    statusCheck: check("arena_entry_versions_status_check", sql`${table.status} in ('active', 'retired')`),
    versionCheck: check("arena_entry_versions_version_check", sql`${table.version} > 0`),
  }),
);

export const arenaScheduledMatches = pgTable(
  "arena_scheduled_matches",
  {
    id: text("id").primaryKey(),
    seasonId: text("season_id").notNull(),
    projectId: text("project_id").notNull(),
    sequence: integer("sequence").notNull(),
    hands: integer("hands").notNull(),
    leftAgentId: text("left_agent_id").notNull(),
    rightAgentId: text("right_agent_id").notNull(),
    status: text("status").notNull().default("scheduled"),
    matchId: text("match_id"),
    attempts: integer("attempts").notNull().default(0),
    executionIdempotencyKey: text("execution_idempotency_key"),
    executionRequestDigest: text("execution_request_digest"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    seasonSequence: uniqueIndex("arena_scheduled_matches_season_sequence_idx").on(
      table.seasonId,
      table.sequence,
    ),
  }),
);

export const arenaPrizePools = pgTable(
  "arena_prize_pools",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    seasonId: text("season_id").notNull(),
    tokenAddress: text("token_address").notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    poolAddress: text("pool_address").notNull(),
    amountMinor: text("amount_minor").notNull(),
    sponsorFingerprint: text("sponsor_fingerprint").notNull(),
    status: text("status").notNull().default("funding_pending"),
    fundingTransactionHash: text("funding_transaction_hash"),
    fundingReceiptDigest: text("funding_receipt_digest"),
    winnerAgentId: text("winner_agent_id"),
    recipientFingerprint: text("recipient_fingerprint"),
    encryptedRecipient: jsonb("encrypted_recipient"),
    settlementTransactionHash: text("settlement_transaction_hash"),
    settlementReceiptDigest: text("settlement_receipt_digest"),
    createIdempotencyKey: text("create_idempotency_key"),
    createRequestDigest: text("create_request_digest"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    projectSeason: uniqueIndex("arena_prize_pools_project_season_idx").on(table.projectId, table.seasonId),
    projectCreateIdempotency: uniqueIndex("arena_prize_pools_project_create_idempotency_idx").on(
      table.projectId,
      table.createIdempotencyKey,
    ),
  }),
);

export const arenaPrizeTransactions = pgTable(
  "arena_prize_transactions",
  {
    transactionHash: text("transaction_hash").primaryKey(),
    poolId: text("pool_id").notNull(),
    projectId: text("project_id").notNull(),
    seasonId: text("season_id").notNull(),
    operation: text("operation").notNull(),
    receiptDigest: text("receipt_digest").notNull(),
    authorizationDigest: text("authorization_digest"),
    encryptedAuthorization: jsonb("encrypted_authorization"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    poolOperation: uniqueIndex("arena_prize_transactions_pool_operation_idx").on(
      table.poolId,
      table.operation,
    ),
  }),
);

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
