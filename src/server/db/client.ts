import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export type VeilapDatabase = NodePgDatabase<typeof schema>;

let database: VeilapDatabase | undefined;
let pool: Pool | undefined;

export function getDatabase(connectionString = process.env.DATABASE_URL): VeilapDatabase {
  if (!connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!database) {
    pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    database = drizzle(pool, { schema });
  }
  return database;
}

export function resetDatabaseForTests(): void {
  void pool?.end();
  pool = undefined;
  database = undefined;
}
