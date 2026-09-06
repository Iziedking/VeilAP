ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "round_number" integer;

ALTER TABLE "arena_scheduled_matches"
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamptz;

CREATE INDEX IF NOT EXISTS "arena_scheduled_matches_due_idx"
  ON "arena_scheduled_matches" ("status", "scheduled_for", "season_id");
