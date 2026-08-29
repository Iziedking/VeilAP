CREATE TABLE IF NOT EXISTS "arena_strategy_artifacts" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "display_name" text NOT NULL,
  "artifact_commitment" text NOT NULL,
  "encrypted_policy" jsonb NOT NULL,
  "status" text DEFAULT 'sealed' NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "arena_strategy_artifacts_project_agent_idx"
  ON "arena_strategy_artifacts" USING btree ("project_id", "agent_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "arena_strategy_artifacts_project_commitment_idx"
  ON "arena_strategy_artifacts" USING btree ("project_id", "artifact_commitment");
