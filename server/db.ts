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

const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech') || 
                       process.env.DATABASE_URL.includes('neon.database');

let db: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePg>;
let pool: NeonPool | pg.Pool;

if (isNeonDatabase) {
  neonConfig.webSocketConstructor = ws;
  pool = new NeonPool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool as NeonPool, schema });
} else {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg({ client: pool, schema });
}

export { pool, db };
