ALTER TABLE "arena_strategy_artifacts"
  ADD COLUMN IF NOT EXISTS "owner_fingerprint" text;

ALTER TABLE "arena_strategy_artifacts"
  ADD COLUMN IF NOT EXISTS "encrypted_owner_wallet" jsonb;

ALTER TABLE "arena_seasons"
  ADD COLUMN IF NOT EXISTS "entry_mode" text DEFAULT 'invite_only' NOT NULL;

ALTER TABLE "arena_seasons"
  ADD COLUMN IF NOT EXISTS "max_entries" integer DEFAULT 16 NOT NULL;

ALTER TABLE "arena_seasons"
  ADD CONSTRAINT "arena_seasons_entry_mode_check"
  CHECK ("entry_mode" IN ('invite_only', 'open'));

ALTER TABLE "arena_seasons"
  ADD CONSTRAINT "arena_seasons_max_entries_check"
  CHECK ("max_entries" BETWEEN 2 AND 32);

ALTER TABLE "arena_season_entries"
  ADD COLUMN IF NOT EXISTS "owner_fingerprint" text;

ALTER TABLE "arena_season_entries"
  ADD COLUMN IF NOT EXISTS "encrypted_payout_wallet" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "arena_season_entries_season_owner_idx"
  ON "arena_season_entries" ("season_id", "owner_fingerprint");
