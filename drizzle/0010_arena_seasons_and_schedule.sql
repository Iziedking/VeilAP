CREATE TABLE IF NOT EXISTS "arena_seasons" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "name" text NOT NULL,
  "ruleset_version" text NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "locks_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  "locked_at" timestamptz,
  "create_idempotency_key" text,
  "create_request_digest" text,
  "lock_idempotency_key" text,
  "lock_request_digest" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "arena_seasons_project_create_idempotency_idx"
  ON "arena_seasons" ("project_id", "create_idempotency_key");

CREATE TABLE IF NOT EXISTS "arena_season_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "season_id" text NOT NULL,
  "project_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "display_name" text NOT NULL,
  "artifact_commitment" text NOT NULL,
  "joined_at" timestamptz NOT NULL,
  "idempotency_key" text,
  "request_digest" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "arena_season_entries_season_agent_idx"
  ON "arena_season_entries" ("season_id", "agent_id");

CREATE UNIQUE INDEX IF NOT EXISTS "arena_season_entries_season_idempotency_idx"
  ON "arena_season_entries" ("season_id", "idempotency_key");

CREATE TABLE IF NOT EXISTS "arena_scheduled_matches" (
  "id" text PRIMARY KEY NOT NULL,
  "season_id" text NOT NULL,
  "project_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "hands" integer NOT NULL,
  "left_agent_id" text NOT NULL,
  "right_agent_id" text NOT NULL,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "match_id" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "execution_idempotency_key" text,
  "execution_request_digest" text,
  "lease_expires_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "arena_scheduled_matches_season_sequence_idx"
  ON "arena_scheduled_matches" ("season_id", "sequence");
