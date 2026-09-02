CREATE TABLE IF NOT EXISTS "participant_agent_packages" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_fingerprint" text NOT NULL,
  "agent_id" text NOT NULL,
  "display_name" text NOT NULL,
  "protocol_version" text NOT NULL,
  "engine_version" text NOT NULL,
  "rule_count" integer NOT NULL,
  "artifact_commitment" text NOT NULL,
  "encrypted_package" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "participant_agent_packages_owner_agent_idx" ON "participant_agent_packages" ("owner_fingerprint","agent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "participant_agent_packages_owner_commitment_idx" ON "participant_agent_packages" ("owner_fingerprint","artifact_commitment");
