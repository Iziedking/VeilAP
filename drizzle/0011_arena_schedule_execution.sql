ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "match_id" text;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "execution_idempotency_key" text;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "execution_request_digest" text;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamptz;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "started_at" timestamptz;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "last_error" text;
