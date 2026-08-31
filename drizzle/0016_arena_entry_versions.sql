ALTER TABLE "arena_season_entries"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "arena_entry_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "entry_id" text NOT NULL,
  "season_id" text NOT NULL,
  "project_id" text NOT NULL,
  "version" integer NOT NULL,
  "agent_id" text NOT NULL,
  "display_name" text NOT NULL,
  "artifact_commitment" text NOT NULL,
  "status" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "retired_at" timestamp with time zone,
  "idempotency_key" text,
  "request_digest" text,
  CONSTRAINT "arena_entry_versions_status_check" CHECK ("status" in ('active', 'retired')),
  CONSTRAINT "arena_entry_versions_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "arena_entry_versions_entry_version_idx"
  ON "arena_entry_versions" USING btree ("entry_id", "version");

CREATE UNIQUE INDEX IF NOT EXISTS "arena_entry_versions_season_idempotency_idx"
  ON "arena_entry_versions" USING btree ("season_id", "idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "arena_entry_versions_one_active_idx"
  ON "arena_entry_versions" USING btree ("entry_id") WHERE "status" = 'active';

INSERT INTO "arena_entry_versions" (
  "id",
  "entry_id",
  "season_id",
  "project_id",
  "version",
  "agent_id",
  "display_name",
  "artifact_commitment",
  "status",
  "submitted_at",
  "idempotency_key",
  "request_digest"
)
SELECT
  "id" || ':v1',
  "id",
  "season_id",
  "project_id",
  1,
  "agent_id",
  "display_name",
  "artifact_commitment",
  'active',
  "joined_at",
  "idempotency_key",
  "request_digest"
FROM "arena_season_entries"
ON CONFLICT DO NOTHING;
