ALTER TABLE "arena_match_receipts"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "arena_match_receipts"
  ADD COLUMN IF NOT EXISTS "request_digest" text;

ALTER TABLE "arena_match_reveals"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

ALTER TABLE "arena_match_reveals"
  ADD COLUMN IF NOT EXISTS "request_digest" text;

CREATE UNIQUE INDEX IF NOT EXISTS "arena_match_receipts_project_idempotency_idx"
  ON "arena_match_receipts" ("project_id", "idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "arena_match_reveals_project_idempotency_idx"
  ON "arena_match_reveals" ("project_id", "idempotency_key");
