import { sql } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";

export async function checkArenaDatabaseReadiness(
  databaseUrl: string | undefined,
): Promise<{ database: boolean; arenaSchema: boolean }> {
  if (!databaseUrl) return { database: false, arenaSchema: false };
  try {
    const database = getDatabase(databaseUrl);
    await database.execute(sql`select 1`);
    const result = await database.execute(sql`
      select
        (select count(*)::int from information_schema.tables
          where table_schema = 'public'
            and table_name in ('projects', 'arena_strategy_artifacts', 'arena_match_receipts', 'arena_match_reveals', 'arena_seasons', 'arena_season_entries', 'arena_entry_versions', 'arena_scheduled_matches', 'arena_prize_pools', 'arena_prize_transactions', 'participant_x_identities', 'participant_agent_packages')) as table_count,
        (select count(*)::int from information_schema.columns
          where table_schema = 'public'
            and (table_name, column_name) in (
              ('arena_seasons', 'entry_mode'),
              ('arena_seasons', 'max_entries'),
              ('arena_seasons', 'template_id'),
              ('arena_seasons', 'template_version'),
              ('arena_seasons', 'rules_snapshot'),
              ('arena_seasons', 'rules_commitment'),
              ('arena_strategy_artifacts', 'owner_fingerprint'),
              ('arena_strategy_artifacts', 'encrypted_owner_wallet'),
              ('arena_season_entries', 'owner_fingerprint'),
              ('arena_season_entries', 'encrypted_payout_wallet'),
              ('arena_season_entries', 'idempotency_key'),
              ('arena_season_entries', 'request_digest'),
              ('arena_season_entries', 'version'),
              ('arena_entry_versions', 'entry_id'),
              ('arena_entry_versions', 'version'),
              ('arena_entry_versions', 'status'),
              ('arena_entry_versions', 'artifact_commitment'),
              ('arena_match_receipts', 'public_hand_receipts'),
              ('arena_prize_transactions', 'authorization_digest'),
              ('arena_prize_transactions', 'encrypted_authorization'),
              ('participant_x_identities', 'x_user_id'),
              ('participant_x_identities', 'wallet_fingerprint'),
              ('participant_x_identities', 'username'),
              ('participant_x_identities', 'profile_image_url'),
              ('participant_x_identities', 'connected_at'),
              ('participant_x_identities', 'last_verified_at'),
              ('arena_scheduled_matches', 'encrypted_seed'),
              ('arena_scheduled_matches', 'retry_at'),
              ('arena_match_reveals', 'nonce')
            )) as column_count
    `);
    const rows = "rows" in result && Array.isArray(result.rows) ? result.rows : [];
    const row = rows[0] as { table_count?: number; column_count?: number } | undefined;
    return {
      database: true,
      arenaSchema: Number(row?.table_count ?? 0) === 12 && Number(row?.column_count ?? 0) === 29,
    };
  } catch {
    return { database: false, arenaSchema: false };
  }
}
