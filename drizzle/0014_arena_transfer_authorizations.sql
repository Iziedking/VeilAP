ALTER TABLE "arena_prize_transactions"
  ADD COLUMN IF NOT EXISTS "authorization_digest" text;

ALTER TABLE "arena_prize_transactions"
  ADD COLUMN IF NOT EXISTS "encrypted_authorization" jsonb;
