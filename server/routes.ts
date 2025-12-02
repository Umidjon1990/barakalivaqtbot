import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema, insertExpenseSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

  return httpServer;
}
