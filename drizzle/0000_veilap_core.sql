CREATE TABLE "agreement_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"encrypted_terms" jsonb NOT NULL,
	"terms_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"actor_fingerprint" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_digest" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"wallet_fingerprint" text NOT NULL,
	"challenge" jsonb NOT NULL,
	"digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_fingerprint" text NOT NULL,
	"wallet_address" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chain_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"release_id" text NOT NULL,
	"operation_type" text NOT NULL,
	"status" text NOT NULL,
	"transaction_hash" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"agreement_version_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"encrypted_payload" jsonb NOT NULL,
	"payload_digest" text NOT NULL,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"checkpoint_id" text NOT NULL,
	"decision" text NOT NULL,
	"rationale" jsonb,
	"decided_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"wallet_fingerprint" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_members_project_id_wallet_fingerprint_role_pk" PRIMARY KEY("project_id","wallet_fingerprint","role")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_fingerprint" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_events" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"event_type" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selective_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"checkpoint_id" text,
	"receipt_type" text NOT NULL,
	"encrypted_payload" jsonb NOT NULL,
	"proof" jsonb NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"checkpoint_id" text NOT NULL,
	"verifier_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_versions_project_version_idx" ON "agreement_versions" USING btree ("project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_operations_release_idx" ON "chain_operations" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_operations_transaction_idx" ON "chain_operations" USING btree ("transaction_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_project_sequence_idx" ON "checkpoints" USING btree ("project_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "decisions_checkpoint_idx" ON "decisions" USING btree ("checkpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_wallet_role_idx" ON "project_members" USING btree ("project_id","wallet_fingerprint","role");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_kind_source_idx" ON "releases" USING btree ("kind","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_idempotency_idx" ON "releases" USING btree ("idempotency_key");