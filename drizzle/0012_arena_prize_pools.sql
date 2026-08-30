CREATE TABLE IF NOT EXISTS "arena_prize_pools" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "season_id" text NOT NULL,
  "token_address" text NOT NULL,
  "token_symbol" text NOT NULL,
  "pool_address" text NOT NULL,
  "amount_minor" text NOT NULL,
  "sponsor_fingerprint" text NOT NULL,
  "status" text DEFAULT 'funding_pending' NOT NULL,
  "funding_transaction_hash" text,
  "funding_receipt_digest" text,
  "winner_agent_id" text,
  "recipient_fingerprint" text,
  "encrypted_recipient" jsonb,
  "settlement_transaction_hash" text,
  "settlement_receipt_digest" text,
  "create_idempotency_key" text,
  "create_request_digest" text,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "arena_prize_pools_project_season_idx"
  ON "arena_prize_pools" ("project_id", "season_id");

CREATE UNIQUE INDEX IF NOT EXISTS "arena_prize_pools_project_create_idempotency_idx"
  ON "arena_prize_pools" ("project_id", "create_idempotency_key");

CREATE TABLE IF NOT EXISTS "arena_prize_transactions" (
  "transaction_hash" text PRIMARY KEY NOT NULL,
  "pool_id" text NOT NULL,
  "project_id" text NOT NULL,
  "season_id" text NOT NULL,
  "operation" text NOT NULL,
  "receipt_digest" text NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "arena_prize_transactions_pool_operation_idx"
  ON "arena_prize_transactions" ("pool_id", "operation");
