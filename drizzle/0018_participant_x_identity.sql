CREATE TABLE "participant_x_identities" (
  "x_user_id" text PRIMARY KEY NOT NULL,
  "wallet_fingerprint" text NOT NULL,
  "username" text NOT NULL,
  "connected_at" timestamp with time zone NOT NULL,
  "last_verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "participant_x_identities_wallet_idx" ON "participant_x_identities" USING btree ("wallet_fingerprint");
