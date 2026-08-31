ALTER TABLE "arena_seasons"
  ADD COLUMN IF NOT EXISTS "template_id" text;

ALTER TABLE "arena_seasons"
  ADD COLUMN IF NOT EXISTS "template_version" integer;

ALTER TABLE "arena_seasons"
  ADD COLUMN IF NOT EXISTS "rules_snapshot" jsonb;

ALTER TABLE "arena_seasons"
  ADD COLUMN IF NOT EXISTS "rules_commitment" text;

DO $$ BEGIN
  ALTER TABLE "arena_seasons"
    ADD CONSTRAINT "arena_seasons_template_version_check"
    CHECK ("template_version" IS NULL OR "template_version" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
