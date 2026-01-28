import { 
  type User, type InsertUser, 
  type Task, type InsertTask, 
  type Expense, type InsertExpense, 
  type ExpenseCategory, type InsertExpenseCategory,
  type BudgetLimit, type InsertBudgetLimit,
  type Goal, type InsertGoal,
  type UserSettings, type InsertUserSettings,
  type PrayerSettings, type InsertPrayerSettings,
  type PrayerTimes, type InsertPrayerTimes,
  type BotUser, type InsertBotUser,
  type Subscription, type InsertSubscription,
  type PaymentRequest, type InsertPaymentRequest,
  type AdminSettings, type InsertAdminSettings,
  users, tasks, expenses, expenseCategories, budgetLimits, goals, userSettings,
  prayerSettings, prayerTimes, botUsers, subscriptions, paymentRequests, adminSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, isNull, lte, gte, lt } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getTasks(telegramUserId?: string): Promise<Task[]>;
  getTasksWithPendingReminders(): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>, telegramUserId?: string): Promise<Task>;
  deleteTask(id: number, telegramUserId?: string): Promise<void>;
  
  getExpenses(telegramUserId?: string): Promise<Expense[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  deleteExpense(id: number, telegramUserId?: string): Promise<void>;

  getExpenseCategories(telegramUserId?: string): Promise<ExpenseCategory[]>;
  createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory>;
  updateExpenseCategory(id: number, updates: Partial<InsertExpenseCategory>, telegramUserId?: string): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: number, telegramUserId?: string): Promise<void>;

  getBudgetLimits(telegramUserId: string): Promise<BudgetLimit[]>;
  getBudgetLimitByCategory(telegramUserId: string, category: string): Promise<BudgetLimit | undefined>;
  createBudgetLimit(limit: InsertBudgetLimit): Promise<BudgetLimit>;
  updateBudgetLimit(id: number, updates: Partial<InsertBudgetLimit>, telegramUserId: string): Promise<BudgetLimit>;
  deleteBudgetLimit(id: number, telegramUserId: string): Promise<void>;

  getGoals(telegramUserId: string): Promise<Goal[]>;
  getActiveGoals(telegramUserId: string): Promise<Goal[]>;
  createGoal(goal: InsertGoal): Promise<Goal>;
  updateGoal(id: number, updates: Partial<InsertGoal>, telegramUserId: string): Promise<Goal>;
  deleteGoal(id: number, telegramUserId: string): Promise<void>;

  getUserSettings(telegramUserId: string): Promise<UserSettings | undefined>;
  createOrUpdateUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  getAllUsersWithDailyReport(): Promise<UserSettings[]>;

  getPrayerSettings(telegramUserId: string): Promise<PrayerSettings | undefined>;
  createOrUpdatePrayerSettings(settings: InsertPrayerSettings): Promise<PrayerSettings>;
  getAllPrayerSettings(): Promise<PrayerSettings[]>;
  
  getPrayerTimes(regionCode: string, date: string): Promise<PrayerTimes | undefined>;
  savePrayerTimes(times: InsertPrayerTimes): Promise<PrayerTimes>;

  // Bot Users
  getBotUser(telegramUserId: string): Promise<BotUser | undefined>;
  createOrUpdateBotUser(user: InsertBotUser): Promise<BotUser>;
  getAllBotUsers(): Promise<BotUser[]>;
  getAdminUsers(): Promise<BotUser[]>;
  setUserAdmin(telegramUserId: string, isAdmin: boolean): Promise<BotUser | undefined>;

  // Subscriptions
  getSubscription(telegramUserId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(telegramUserId: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  getActiveSubscriptions(): Promise<Subscription[]>;
  getExpiringSubscriptions(daysUntilExpiry: number): Promise<Subscription[]>;
  getExpiredSubscriptions(): Promise<Subscription[]>;

  // Payment Requests
  createPaymentRequest(request: InsertPaymentRequest): Promise<PaymentRequest>;
  getPaymentRequest(id: number): Promise<PaymentRequest | undefined>;
  getPaymentRequestByPaymeId(paymeTransactionId: string): Promise<PaymentRequest | undefined>;
  getPendingPaymentRequests(): Promise<PaymentRequest[]>;
  getUserPaymentRequests(telegramUserId: string): Promise<PaymentRequest[]>;
  updatePaymentRequest(id: number, updates: Partial<InsertPaymentRequest>): Promise<PaymentRequest | undefined>;
  
  // Subscription helpers
  createOrUpdateSubscription(subscription: InsertSubscription): Promise<Subscription>;

  // Admin Settings
  getAdminSetting(key: string): Promise<string | undefined>;
  setAdminSetting(key: string, value: string): Promise<AdminSettings>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getTasks(telegramUserId?: string): Promise<Task[]> {
    if (telegramUserId) {
      return await db.select().from(tasks)
        .where(eq(tasks.telegramUserId, telegramUserId))
        .orderBy(desc(tasks.createdAt));
    }
    return await db.select().from(tasks)
      .where(isNull(tasks.telegramUserId))
      .orderBy(desc(tasks.createdAt));
  }

  async getTasksWithPendingReminders(): Promise<Task[]> {
    const now = new Date();
    return await db.select().from(tasks)
      .where(and(
        lte(tasks.reminderTime, now),
        eq(tasks.reminderSent, false),
        eq(tasks.completed, false)
      ));
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }

  async updateTask(id: number, updates: Partial<InsertTask>, telegramUserId?: string): Promise<Task> {
    if (telegramUserId) {
      const [updated] = await db.update(tasks).set(updates)
        .where(and(eq(tasks.id, id), eq(tasks.telegramUserId, telegramUserId)))
        .returning();
      return updated;
    }
    const [updated] = await db.update(tasks).set(updates)
      .where(and(eq(tasks.id, id), isNull(tasks.telegramUserId)))
      .returning();
    return updated;
  }

  async deleteTask(id: number, telegramUserId?: string): Promise<void> {
    if (telegramUserId) {
      await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.telegramUserId, telegramUserId)));
    } else {
      await db.delete(tasks).where(and(eq(tasks.id, id), isNull(tasks.telegramUserId)));
    }
  }

  async getExpenses(telegramUserId?: string): Promise<Expense[]> {
    if (telegramUserId) {
      return await db.select().from(expenses)
        .where(eq(expenses.telegramUserId, telegramUserId))
        .orderBy(desc(expenses.createdAt));
    }
    return await db.select().from(expenses)
      .where(isNull(expenses.telegramUserId))
      .orderBy(desc(expenses.createdAt));
  }

  async createExpense(expense: InsertExpense): Promise<Expense> {
    const [newExpense] = await db.insert(expenses).values(expense).returning();
    return newExpense;
  }

  async deleteExpense(id: number, telegramUserId?: string): Promise<void> {
    if (telegramUserId) {
      await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.telegramUserId, telegramUserId)));
    } else {
      await db.delete(expenses).where(and(eq(expenses.id, id), isNull(expenses.telegramUserId)));
    }
  }

  async getExpenseCategories(telegramUserId?: string): Promise<ExpenseCategory[]> {
    if (telegramUserId) {
      return await db.select().from(expenseCategories)
        .where(eq(expenseCategories.telegramUserId, telegramUserId));
    }
    return await db.select().from(expenseCategories)
      .where(isNull(expenseCategories.telegramUserId));
  }

  async createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory> {
    const [newCategory] = await db.insert(expenseCategories).values(category).returning();
    return newCategory;
  }

  async updateExpenseCategory(id: number, updates: Partial<InsertExpenseCategory>, telegramUserId?: string): Promise<ExpenseCategory> {
    if (telegramUserId) {
      const [updated] = await db.update(expenseCategories).set(updates)
        .where(and(eq(expenseCategories.id, id), eq(expenseCategories.telegramUserId, telegramUserId)))
        .returning();
      return updated;
    }
    const [updated] = await db.update(expenseCategories).set(updates)
      .where(and(eq(expenseCategories.id, id), isNull(expenseCategories.telegramUserId)))
      .returning();
    return updated;
  }

  async deleteExpenseCategory(id: number, telegramUserId?: string): Promise<void> {
    if (telegramUserId) {
      await db.delete(expenseCategories).where(and(eq(expenseCategories.id, id), eq(expenseCategories.telegramUserId, telegramUserId)));
    } else {
      await db.delete(expenseCategories).where(and(eq(expenseCategories.id, id), isNull(expenseCategories.telegramUserId)));
    }
  }

  async getBudgetLimits(telegramUserId: string): Promise<BudgetLimit[]> {
    return await db.select().from(budgetLimits)
      .where(eq(budgetLimits.telegramUserId, telegramUserId));
  }

  async getBudgetLimitByCategory(telegramUserId: string, category: string): Promise<BudgetLimit | undefined> {
    const [limit] = await db.select().from(budgetLimits)
      .where(and(eq(budgetLimits.telegramUserId, telegramUserId), eq(budgetLimits.category, category)));
    return limit;
  }

  async createBudgetLimit(limit: InsertBudgetLimit): Promise<BudgetLimit> {
    const [newLimit] = await db.insert(budgetLimits).values(limit).returning();
    return newLimit;
  }

  async updateBudgetLimit(id: number, updates: Partial<InsertBudgetLimit>, telegramUserId: string): Promise<BudgetLimit> {
    const [updated] = await db.update(budgetLimits).set(updates)
      .where(and(eq(budgetLimits.id, id), eq(budgetLimits.telegramUserId, telegramUserId)))
      .returning();
    return updated;
  }

  async deleteBudgetLimit(id: number, telegramUserId: string): Promise<void> {
    await db.delete(budgetLimits).where(and(eq(budgetLimits.id, id), eq(budgetLimits.telegramUserId, telegramUserId)));
  }

  async getGoals(telegramUserId: string): Promise<Goal[]> {
    return await db.select().from(goals)
      .where(eq(goals.telegramUserId, telegramUserId))
      .orderBy(desc(goals.createdAt));
  }

  async getActiveGoals(telegramUserId: string): Promise<Goal[]> {
    const now = new Date();
    return await db.select().from(goals)
      .where(and(
        eq(goals.telegramUserId, telegramUserId),
        lte(goals.startDate, now)
      ))
      .orderBy(desc(goals.createdAt));
  }

  async createGoal(goal: InsertGoal): Promise<Goal> {
    const [newGoal] = await db.insert(goals).values(goal).returning();
    return newGoal;
  }

  async updateGoal(id: number, updates: Partial<InsertGoal>, telegramUserId: string): Promise<Goal> {
    const [updated] = await db.update(goals).set(updates)
      .where(and(eq(goals.id, id), eq(goals.telegramUserId, telegramUserId)))
      .returning();
    return updated;
  }

  async deleteGoal(id: number, telegramUserId: string): Promise<void> {
    await db.delete(goals).where(and(eq(goals.id, id), eq(goals.telegramUserId, telegramUserId)));
  }

  async getUserSettings(telegramUserId: string): Promise<UserSettings | undefined> {
    const [settings] = await db.select().from(userSettings)
      .where(eq(userSettings.telegramUserId, telegramUserId));
    return settings;
  }

  async createOrUpdateUserSettings(settings: InsertUserSettings): Promise<UserSettings> {
    const existing = await this.getUserSettings(settings.telegramUserId);
    if (existing) {
      const [updated] = await db.update(userSettings)
        .set(settings)
        .where(eq(userSettings.telegramUserId, settings.telegramUserId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(userSettings).values(settings).returning();
    return created;
  }

  async getAllUsersWithDailyReport(): Promise<UserSettings[]> {
    return await db.select().from(userSettings)
      .where(eq(userSettings.dailyReportEnabled, true));
  }

  async getPrayerSettings(telegramUserId: string): Promise<PrayerSettings | undefined> {
    const [settings] = await db.select().from(prayerSettings)
      .where(eq(prayerSettings.telegramUserId, telegramUserId));
    return settings;
  }

  async createOrUpdatePrayerSettings(settings: InsertPrayerSettings): Promise<PrayerSettings> {
    const existing = await this.getPrayerSettings(settings.telegramUserId);
    if (existing) {
      const [updated] = await db.update(prayerSettings)
        .set(settings)
        .where(eq(prayerSettings.telegramUserId, settings.telegramUserId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(prayerSettings).values(settings).returning();
    return created;
  }

  async getAllPrayerSettings(): Promise<PrayerSettings[]> {
    return await db.select().from(prayerSettings);
  }

  async getPrayerTimes(regionCode: string, date: string): Promise<PrayerTimes | undefined> {
    const [times] = await db.select().from(prayerTimes)
      .where(and(eq(prayerTimes.regionCode, regionCode), eq(prayerTimes.date, date)));
    return times;
  }

  async savePrayerTimes(times: InsertPrayerTimes): Promise<PrayerTimes> {
    const existing = await this.getPrayerTimes(times.regionCode, times.date);
    if (existing) {
      const [updated] = await db.update(prayerTimes)
        .set(times)
        .where(and(eq(prayerTimes.regionCode, times.regionCode), eq(prayerTimes.date, times.date)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(prayerTimes).values(times).returning();
    return created;
  }

  // Bot Users
  async getBotUser(telegramUserId: string): Promise<BotUser | undefined> {
    const [user] = await db.select().from(botUsers)
      .where(eq(botUsers.telegramUserId, telegramUserId));
    return user;
  }

  async createOrUpdateBotUser(user: InsertBotUser): Promise<BotUser> {
    const existing = await this.getBotUser(user.telegramUserId);
    if (existing) {
      const [updated] = await db.update(botUsers)
        .set(user)
        .where(eq(botUsers.telegramUserId, user.telegramUserId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(botUsers).values(user).returning();
    return created;
  }

  async getAllBotUsers(): Promise<BotUser[]> {
    return await db.select().from(botUsers).orderBy(desc(botUsers.createdAt));
  }

  async getAdminUsers(): Promise<BotUser[]> {
    return await db.select().from(botUsers)
      .where(eq(botUsers.isAdmin, true));
  }

  async setUserAdmin(telegramUserId: string, isAdmin: boolean): Promise<BotUser | undefined> {
    const [updated] = await db.update(botUsers)
      .set({ isAdmin })
      .where(eq(botUsers.telegramUserId, telegramUserId))
      .returning();
    return updated;
  }

  // Subscriptions
  async getSubscription(telegramUserId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.telegramUserId, telegramUserId));
    return sub;
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const [created] = await db.insert(subscriptions).values(subscription).returning();
    return created;
  }

  async updateSubscription(telegramUserId: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [updated] = await db.update(subscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subscriptions.telegramUserId, telegramUserId))
      .returning();
    return updated;
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    const now = new Date();
    return await db.select().from(subscriptions)
      .where(and(
        or(
          eq(subscriptions.status, "active"),
          eq(subscriptions.status, "trial")
        ),
        gte(subscriptions.endDate, now)
      ));
  }

  async getExpiringSubscriptions(daysUntilExpiry: number): Promise<Subscription[]> {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);
    return await db.select().from(subscriptions)
      .where(and(
        lte(subscriptions.endDate, expiryDate),
        gte(subscriptions.endDate, now),
        or(
          eq(subscriptions.status, "active"),
          eq(subscriptions.status, "trial")
        )
      ));
  }

  async getExpiredSubscriptions(): Promise<Subscription[]> {
    const now = new Date();
    return await db.select().from(subscriptions)
      .where(and(
        lt(subscriptions.endDate, now),
        or(
          eq(subscriptions.status, "active"),
          eq(subscriptions.status, "trial")
        )
      ));
  }

  // Payment Requests
  async createPaymentRequest(request: InsertPaymentRequest): Promise<PaymentRequest> {
    const [created] = await db.insert(paymentRequests).values(request).returning();
    return created;
  }

  async getPaymentRequest(id: number): Promise<PaymentRequest | undefined> {
    const [request] = await db.select().from(paymentRequests)
      .where(eq(paymentRequests.id, id));
    return request;
  }

  async getPendingPaymentRequests(): Promise<PaymentRequest[]> {
    return await db.select().from(paymentRequests)
      .where(eq(paymentRequests.status, "pending"))
      .orderBy(desc(paymentRequests.createdAt));
  }

  async getUserPaymentRequests(telegramUserId: string): Promise<PaymentRequest[]> {
    return await db.select().from(paymentRequests)
      .where(eq(paymentRequests.telegramUserId, telegramUserId))
      .orderBy(desc(paymentRequests.createdAt));
  }

  async updatePaymentRequest(id: number, updates: Partial<InsertPaymentRequest>): Promise<PaymentRequest | undefined> {
    const [updated] = await db.update(paymentRequests)
      .set(updates)
      .where(eq(paymentRequests.id, id))
      .returning();
    return updated;
  }

  async getPaymentRequestByPaymeId(paymeTransactionId: string): Promise<PaymentRequest | undefined> {
    const [request] = await db.select().from(paymentRequests)
      .where(eq(paymentRequests.paymeTransactionId, paymeTransactionId));
    return request;
  }

  async createOrUpdateSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const existing = await this.getSubscription(subscription.telegramUserId);
    if (existing) {
      const [updated] = await db.update(subscriptions)
        .set({
          status: subscription.status,
          planType: subscription.planType,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.telegramUserId, subscription.telegramUserId))
        .returning();
      return updated;
    }
    return await this.createSubscription(subscription);
  }

  // Admin Settings
  async getAdminSetting(key: string): Promise<string | undefined> {
    const [setting] = await db.select().from(adminSettings)
      .where(eq(adminSettings.key, key));
    return setting?.value;
  }

  async setAdminSetting(key: string, value: string): Promise<AdminSettings> {
    const existing = await this.getAdminSetting(key);
    if (existing !== undefined) {
      const [updated] = await db.update(adminSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(adminSettings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(adminSettings).values({ key, value }).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
