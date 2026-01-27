import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema, insertExpenseSchema, insertExpenseCategorySchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { handlePaymeRequest } from "./payme";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint - keeps Railway from sleeping
  app.get("/health", (req, res) => {
    res.status(200).json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.get("/", (req, res) => {
    res.status(200).json({ 
      name: "Barakali Vaqt Bot",
      status: "running",
      version: "1.0.0"
    });
  });

  // Payme webhook endpoint
  app.post("/api/payme/webhook", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const result = await handlePaymeRequest(req.body, authHeader);
      res.json(result);
    } catch (error) {
      console.error("Payme webhook error:", error);
      res.status(500).json({
        error: {
          code: -32400,
          message: { ru: "Системная ошибка", uz: "Tizim xatosi", en: "System error" }
        }
      });
    }
  });

  // Test endpoint to simulate Payme payment (only in development)
  app.post("/api/payme/test-payment/:paymentId", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Test endpoint disabled in production" });
    }
    try {
      const paymentId = parseInt(req.params.paymentId);
      const testBody = {
        method: "PerformTransaction",
        params: { id: `test_${paymentId}` }
      };
      
      // First create the transaction
      const payment = await storage.getPaymentRequest(paymentId);
      if (!payment) {
        return res.status(404).json({ error: "Payment not found" });
      }
      
      await storage.updatePaymentRequest(paymentId, { paymeTransactionId: `test_${paymentId}` });
      
      // Then perform it
      const result = await handlePaymeRequest(testBody, undefined);
      res.json({ success: true, result });
    } catch (error) {
      console.error("Test payment error:", error);
      res.status(500).json({ error: "Test payment failed" });
    }
  });

  // Task routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const result = insertTaskSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }
      const task = await storage.createTask(result.data);
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertTaskSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }
      const task = await storage.updateTask(id, result.data);
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTask(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Expense routes
  app.get("/api/expenses", async (req, res) => {
    try {
      const expenses = await storage.getExpenses();
      res.json(expenses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", async (req, res) => {
    try {
      const result = insertExpenseSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }
      const expense = await storage.createExpense(result.data);
      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteExpense(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete expense" });
    }
  });

  // Expense Category routes
  app.get("/api/expense-categories", async (req, res) => {
    try {
      const categories = await storage.getExpenseCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expense categories" });
    }
  });

  app.post("/api/expense-categories", async (req, res) => {
    try {
      const result = insertExpenseCategorySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }
      const category = await storage.createExpenseCategory(result.data);
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Failed to create expense category" });
    }
  });

  app.patch("/api/expense-categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertExpenseCategorySchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }
      const category = await storage.updateExpenseCategory(id, result.data);
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Failed to update expense category" });
    }
  });

  app.delete("/api/expense-categories/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteExpenseCategory(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete expense category" });
    }
  });

  return httpServer;
}
