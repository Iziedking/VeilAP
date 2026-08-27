import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type VeilapDatabase = NeonHttpDatabase<typeof schema>;

let database: VeilapDatabase | undefined;

export function getDatabase(connectionString = process.env.DATABASE_URL): VeilapDatabase {
  if (!connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!database) {
    // @neondatabase/serverless@1.1.0 neon HTTP driver; drizzle-orm@0.45.2 schema binding, read 2026-08-27.
    database = drizzle(neon(connectionString), { schema });
  }
  return database;
}

export function resetDatabaseForTests(): void {
  database = undefined;
}
