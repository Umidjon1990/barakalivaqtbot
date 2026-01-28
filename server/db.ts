import { drizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import pg from 'pg';
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = process.env.DATABASE_URL;
const isNeonDatabase = databaseUrl.includes('neon.tech') || databaseUrl.includes('neon.database');
const isRailwayDatabase = databaseUrl.includes('railway') || databaseUrl.includes('rlwy.net');

let db: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePg>;
let pool: NeonPool | pg.Pool;

if (isNeonDatabase) {
  console.log("Using Neon database connection");
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: databaseUrl });
  db = drizzle({ client: pool as NeonPool, schema });
} else {
  console.log("Using standard PostgreSQL connection");
  const poolConfig: pg.PoolConfig = {
    connectionString: databaseUrl,
  };
  
  if (isRailwayDatabase || process.env.NODE_ENV === 'production') {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
  }
  
  pool = new pg.Pool(poolConfig);
  db = drizzlePg(pool, { schema });
}

// Auto-migrate: Add missing columns to payment_requests table
async function autoMigrate() {
  try {
    // Use direct query for Railway PostgreSQL
    const alterQueries = [
      `ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payme_transaction_id TEXT;`,
      `ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payme_create_time TEXT;`,
      `ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payme_perform_time TEXT;`,
      `ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payme_cancel_time TEXT;`,
      `ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payme_cancel_reason INTEGER;`,
    ];
    
    if (isRailwayDatabase || !isNeonDatabase) {
      // Standard PostgreSQL (Railway)
      const client = await (pool as pg.Pool).connect();
      for (const query of alterQueries) {
        try {
          await client.query(query);
        } catch (e) {
          // Column might already exist, ignore error
        }
      }
      client.release();
    } else {
      // Neon database
      for (const query of alterQueries) {
        try {
          await (pool as NeonPool).query(query);
        } catch (e) {
          // Column might already exist, ignore error
        }
      }
    }
    
    console.log("Auto-migration completed successfully!");
  } catch (error) {
    console.error("Auto-migration error:", error);
  }
}

// Run auto-migration on startup
autoMigrate();

export { pool, db };
