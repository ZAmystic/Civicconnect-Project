
declare const process: any;

import { dbPool } from './config/database'; 

async function testConnection() {
  try {
    const client = await dbPool.connect();
    console.log('✅ Connected successfully to Supabase PostgreSQL!');
    
    // Run a lightweight test query 
    const result = await client.query('SELECT NOW(), current_database(), current_user;');
    console.log('Server Time:', result.rows[0].now);
    console.log('Database Name:', result.rows[0].current_database);
    console.log('Connected User:', result.rows[0].current_user);
    
    // Verify table existence 
    const tableResult = await client.query(` 
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'; 
    `);
    
    console.log('📋 Existing Tables:', tableResult.rows.map((row: { table_name: string }) => row.table_name));
    
    client.release();
    process.exit(0);
  } catch (error) {
    console.error('Database Connection Failed:', error);
    process.exit(1);
  }
}

testConnection();