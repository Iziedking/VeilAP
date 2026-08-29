ALTER TABLE "arena_match_receipts"
  ADD COLUMN IF NOT EXISTS "hand_count" integer;
