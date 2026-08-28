ALTER TABLE "decisions" ADD COLUMN "schema_version" integer NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "project_id" text NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "agreement_version" integer NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "agreement_digest" text NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "checkpoint_digest" text NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "verification_digest" text NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "release_amount_minor" text;
ALTER TABLE "decisions" ADD COLUMN "nonce" text NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "issued_at" timestamp with time zone NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "expires_at" timestamp with time zone NOT NULL;
ALTER TABLE "decisions" ADD COLUMN "signature" jsonb NOT NULL;
ALTER TABLE "releases" ADD COLUMN "project_id" text NOT NULL;
ALTER TABLE "releases" ADD COLUMN "decision_id" text NOT NULL;
ALTER TABLE "releases" ADD COLUMN "amount_minor" text NOT NULL;
ALTER TABLE "chain_operations" ADD COLUMN "receipt_digest" text;
ALTER TABLE "chain_operations" ADD COLUMN "reason" text;
ALTER TABLE "chain_operations" ADD COLUMN "updated_at" timestamp with time zone NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "decisions_nonce_idx" ON "decisions" USING btree ("nonce");
