// scripts/db-check.cjs
// CI smoke check: confirms we can reach OUR database (not just any database)
// and that the Supabase project accepts our public key.
// (.cjs because package.json has "type": "module")

const { Pool } = require("pg");

async function checkDatabase() {
  const useSsl = String(process.env.DB_SSL).trim().toLowerCase() === "true";
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL.trim(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    const { rows } = await pool.query(
      "SELECT current_database() AS db, current_user AS usr"
    );
    const { db, usr } = rows[0];
    console.log(`Connected to database "${db}" as "${usr}"`);

    // Make sure we hit the intended database, not a random one.
    if (db !== process.env.DB_NAME.trim()) {
      throw new Error(
        `Connected to "${db}" but expected "${process.env.DB_NAME.trim()}"`
      );
    }
    if (usr.split(".")[0] !== process.env.DB_USER.trim().split(".")[0]) {
      throw new Error(`Unexpected DB user "${usr}"`);
    }
    console.log("Database identity check passed");
  } finally {
    await pool.end();
  }
}

async function checkSupabase() {
  const baseUrl = process.env.SUPABASE_URL.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_ANON_KEY.trim();

  // Auth health endpoint: public, needs only the "apikey" header.
  // (Do NOT send the key as a Bearer token: new sb_publishable_ keys aren't JWTs.)
  const res = await fetch(`${baseUrl}/auth/v1/health`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    let hint = "";
    if (res.status === 401 || res.status === 403) {
      hint =
        " (the key was rejected: check the SUPABASE_ANON_KEY secret belongs to the" +
        " same project as SUPABASE_URL and has no extra spaces or quotes)";
    }
    throw new Error(`Supabase auth health returned HTTP ${res.status}${hint}`);
  }
  console.log(`Supabase auth service reachable (HTTP ${res.status})`);
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