ALTER TABLE "arena_match_receipts"
  ADD COLUMN IF NOT EXISTS "signed_receipt" jsonb;
