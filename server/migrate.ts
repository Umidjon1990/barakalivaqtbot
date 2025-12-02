import { db } from "./db";
import { sql } from "drizzle-orm";

export async function runMigrations() {
  console.log("Running database migrations...");
  
  try {
    // Create tasks table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        completed BOOLEAN DEFAULT false,
        priority TEXT DEFAULT 'medium',
        time TEXT,
        category TEXT,
        telegram_user_id TEXT,
        reminder_time TIMESTAMP,
        reminder_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create expenses table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        amount INTEGER NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        telegram_user_id TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create expense_categories table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        telegram_user_id TEXT
      )
    `);

    // Create budget_limits table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS budget_limits (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        limit_amount INTEGER NOT NULL,
        period TEXT NOT NULL,
        telegram_user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create goals table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        target_count INTEGER NOT NULL,
        current_count INTEGER DEFAULT 0,
        type TEXT NOT NULL,
        period TEXT NOT NULL,
        telegram_user_id TEXT NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create user_settings table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        telegram_user_id TEXT UNIQUE NOT NULL,
        daily_report_enabled BOOLEAN DEFAULT true,
        daily_report_time TEXT DEFAULT '20:00',
        weekly_report_enabled BOOLEAN DEFAULT true,
        weekly_report_day TEXT DEFAULT 'sunday',
        timezone TEXT DEFAULT 'Asia/Tashkent',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create users table (for web auth if needed)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )
    `);

    console.log("Database migrations completed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
}
