// src/config/db.ts
// Shared PostgreSQL connection pool (ADR-02). All modules query through
// this pool using parameterised queries only - never string-concatenated
// SQL (A3 Q2 Chain 4, Input/Data Handling). Member 2 owns the schema,
// migrations and transaction/concurrency design built on top of this pool.

import { Pool } from "pg";
import { env } from "./env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.databasePoolMax,
});

pool.on("error", (err) => {
  // A pool-level error means a background/idle client failed - log and let
  // the process supervisor / container orchestrator restart if needed,
  // rather than crashing silently (readiness probe implications, s3.3.2).
  // eslint-disable-next-line no-console
  console.error("Unexpected PostgreSQL pool error", err);
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
