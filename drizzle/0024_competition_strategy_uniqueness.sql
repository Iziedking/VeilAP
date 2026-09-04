ALTER TABLE "arena_season_entries" ADD COLUMN "strategy_fingerprint" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "arena_season_entries_season_strategy_idx" ON "arena_season_entries" ("season_id", "strategy_fingerprint");
--> statement-breakpoint
CREATE FUNCTION veil_require_strategy_fingerprint() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
  SELECT rules_snapshot INTO snapshot FROM arena_seasons WHERE id = NEW.season_id AND project_id = NEW.project_id FOR UPDATE;
  IF snapshot->>'duplicateStrategyPolicy' = 'reject_exact' AND
     (NEW.strategy_fingerprint IS NULL OR NEW.strategy_fingerprint !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'ARENA_STRATEGY_FINGERPRINT_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER arena_entry_strategy_required BEFORE INSERT OR UPDATE ON arena_season_entries
FOR EACH ROW EXECUTE FUNCTION veil_require_strategy_fingerprint();
