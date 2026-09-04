CREATE TABLE IF NOT EXISTS "participant_agent_drafts" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_fingerprint" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('pending', 'ready', 'saved', 'revoked')),
  "target_agent_id" text,
  "base_version" integer,
  "base_commitment" text,
  "agent" jsonb,
  "encrypted_package" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CHECK (("status" = 'ready') = ("encrypted_package" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "participant_agent_drafts_owner_idx" ON "participant_agent_drafts" ("owner_fingerprint", "created_at");
