import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  completed: boolean("completed").notNull().default(false),
  priority: text("priority").notNull().default("medium"),
  time: text("time"),
  category: text("category"),
  telegramUserId: text("telegram_user_id"),
  reminderTime: timestamp("reminder_time"),
  reminderSent: boolean("reminder_sent").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  telegramUserId: text("telegram_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("wallet"),
  color: text("color").notNull().default("hsl(150, 40%, 30%)"),
  telegramUserId: text("telegram_user_id"),
});

export const budgetLimits = pgTable("budget_limits", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  limitAmount: integer("limit_amount").notNull(),
  period: text("period").notNull().default("monthly"),
  telegramUserId: text("telegram_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  targetCount: integer("target_count").notNull(),
  currentCount: integer("current_count").notNull().default(0),
  type: text("type").notNull().default("tasks"),
  period: text("period").notNull().default("weekly"),
  telegramUserId: text("telegram_user_id").notNull(),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  dailyReportEnabled: boolean("daily_report_enabled").default(true),
  dailyReportTime: text("daily_report_time").default("20:00"),
  weeklyReportEnabled: boolean("weekly_report_enabled").default(true),
  weeklyReportDay: text("weekly_report_day").default("sunday"),
  timezone: text("timezone").default("Asia/Tashkent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const prayerSettings = pgTable("prayer_settings", {
  id: serial("id").primaryKey(),
  telegramUserId: text("telegram_user_id").notNull().unique(),
  regionCode: text("region_code").default("namangan"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  useCustomLocation: boolean("use_custom_location").default(false),
  fajrEnabled: boolean("fajr_enabled").default(true),
  dhuhrEnabled: boolean("dhuhr_enabled").default(true),
  asrEnabled: boolean("asr_enabled").default(true),
  maghribEnabled: boolean("maghrib_enabled").default(true),
  ishaEnabled: boolean("isha_enabled").default(true),
  advanceMinutes: integer("advance_minutes").default(10),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const prayerTimes = pgTable("prayer_times", {
  id: serial("id").primaryKey(),
  regionCode: text("region_code").notNull(),
  date: text("date").notNull(),
  fajr: text("fajr").notNull(),
  sunrise: text("sunrise").notNull(),
  dhuhr: text("dhuhr").notNull(),
  asr: text("asr").notNull(),
  sunset: text("sunset").notNull(),
  maghrib: text("maghrib").notNull(),
  isha: text("isha").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
});

export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({
  id: true,
});

export const insertBudgetLimitSchema = createInsertSchema(budgetLimits).omit({
  id: true,
  createdAt: true,
});

export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true,
  createdAt: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  createdAt: true,
});

export const insertPrayerSettingsSchema = createInsertSchema(prayerSettings).omit({
  id: true,
  createdAt: true,
});

export const insertPrayerTimesSchema = createInsertSchema(prayerTimes).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;

export type InsertBudgetLimit = z.infer<typeof insertBudgetLimitSchema>;
export type BudgetLimit = typeof budgetLimits.$inferSelect;

export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goals.$inferSelect;

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

export type InsertPrayerSettings = z.infer<typeof insertPrayerSettingsSchema>;
export type PrayerSettings = typeof prayerSettings.$inferSelect;

export type InsertPrayerTimes = z.infer<typeof insertPrayerTimesSchema>;
export type PrayerTimes = typeof prayerTimes.$inferSelect;
