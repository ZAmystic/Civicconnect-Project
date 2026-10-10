// scripts/db-check.js
// CI smoke check: confirms we can reach OUR database (not just any database)
// and that the Supabase project URL responds.

const { Pool } = require("pg");

async function checkDatabase() {
  const useSsl = String(process.env.DB_SSL).toLowerCase() === "true";
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    const { rows } = await pool.query(
      "SELECT current_database() AS db, current_user AS usr, version() AS ver"
    );
    const { db, usr } = rows[0];
    console.log(`Connected to database "${db}" as "${usr}"`);

    // Make sure we hit the intended database, not a random one.
    if (db !== process.env.DB_NAME) {
      throw new Error(
        `Connected to "${db}" but expected "${process.env.DB_NAME}"`
      );
    }
    if (usr.split(".")[0] !== process.env.DB_USER.split(".")[0]) {
      throw new Error(`Unexpected DB user "${usr}"`);
    }
    console.log("Database identity check passed");
  } finally {
    await pool.end();
  }
}

async function checkSupabase() {
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Supabase REST endpoint returned HTTP ${res.status}`);
  }
  console.log(`Supabase REST endpoint reachable (HTTP ${res.status})`);
}

(async () => {
  try {
    await checkDatabase();
    await checkSupabase();
    console.log("All connectivity checks passed");
  } catch (err) {
    console.error(`::error::Connectivity check failed: ${err.message}`);
    process.exit(1);
  }
})();