CREATE TABLE IF NOT EXISTS "arena_match_reveals" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "match_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "hand_index" integer NOT NULL,
  "hand_number" integer NOT NULL,
  "position" text NOT NULL,
  "action" text NOT NULL,
  "seat_swapped" boolean NOT NULL,
  "action_commitment" text NOT NULL,
  "hand_commitment" text NOT NULL,
  "transcript_root" text NOT NULL,
  "public_hand_receipt" jsonb NOT NULL,
  "proof" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "arena_match_reveals_project_match_idx"
  ON "arena_match_reveals" USING btree ("project_id", "match_id");
