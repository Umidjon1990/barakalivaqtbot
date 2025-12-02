import { 
  type User, type InsertUser, 
  type Task, type InsertTask, 
  type Expense, type InsertExpense, 
  type ExpenseCategory, type InsertExpenseCategory,
  users, tasks, expenses, expenseCategories 
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, isNull } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Task methods (with optional telegramUserId filter)
  getTasks(telegramUserId?: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>, telegramUserId?: string): Promise<Task>;
  deleteTask(id: number, telegramUserId?: string): Promise<void>;
  
  // Expense methods (with optional telegramUserId filter)
  getExpenses(telegramUserId?: string): Promise<Expense[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  deleteExpense(id: number, telegramUserId?: string): Promise<void>;

  // Expense Category methods (with optional telegramUserId filter)
  getExpenseCategories(telegramUserId?: string): Promise<ExpenseCategory[]>;
  createExpenseCategory(category: InsertExpenseCategory): Promise<ExpenseCategory>;
  updateExpenseCategory(id: number, updates: Partial<InsertExpenseCategory>, telegramUserId?: string): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: number, telegramUserId?: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Task methods
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

  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }

  async updateTask(id: number, updates: Partial<InsertTask>, telegramUserId?: string): Promise<Task> {
    if (telegramUserId) {
      const [updated] = await db
        .update(tasks)
        .set(updates)
        .where(and(eq(tasks.id, id), eq(tasks.telegramUserId, telegramUserId)))
        .returning();
      return updated;
    }
    const [updated] = await db
      .update(tasks)
      .set(updates)
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

  // Expense methods
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

  // Expense Category methods
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
      const [updated] = await db
        .update(expenseCategories)
        .set(updates)
        .where(and(eq(expenseCategories.id, id), eq(expenseCategories.telegramUserId, telegramUserId)))
        .returning();
      return updated;
    }
    const [updated] = await db
      .update(expenseCategories)
      .set(updates)
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
}

export const storage = new DatabaseStorage();
