CREATE TABLE IF NOT EXISTS "arena_match_receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "left_agent_id" text NOT NULL,
  "right_agent_id" text NOT NULL,
  "left_display_name" text NOT NULL,
  "right_display_name" text NOT NULL,
  "public_receipt" jsonb NOT NULL,
  "encrypted_seed" jsonb NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "arena_match_receipts_project_match_idx"
  ON "arena_match_receipts" USING btree ("project_id", "id");
