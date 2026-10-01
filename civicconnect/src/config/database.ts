import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

// Quick connection test
// Quick connection test
dbPool.connect((err, client) => {
  if (err) {
    console.error('❌ Error connecting to Supabase PostgreSQL database:', err.stack);
  } else if (client) {
    console.log('✅ Connected successfully to Supabase PostgreSQL database!');
    client.release(); // This uses the client variable, removing the TS warning!
  }
});