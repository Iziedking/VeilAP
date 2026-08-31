ALTER TABLE "arena_match_receipts"
ADD COLUMN "public_hand_receipts" jsonb DEFAULT '[]'::jsonb NOT NULL;
