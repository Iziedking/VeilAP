ALTER TABLE "arena_scheduled_matches" ADD COLUMN IF NOT EXISTS "encrypted_seed" jsonb;
ALTER TABLE "arena_scheduled_matches" ADD COLUMN IF NOT EXISTS "retry_at" timestamptz;
