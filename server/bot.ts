import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import { storage } from "./storage";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

interface UserState {
  action?: string;
  step?: string;
  data?: Record<string, any>;
}

const userStates: Map<number, UserState> = new Map();

function getTelegramUserId(ctx: Context): string {
  return ctx.from?.id?.toString() || "0";
}

const mainMenuKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("📋 Rejalar", "menu_tasks"),
    Markup.button.callback("💰 Xarajatlar", "menu_expenses"),
  ],
  [
    Markup.button.callback("🎯 Maqsadlar", "menu_goals"),
    Markup.button.callback("💳 Byudjet", "menu_budget"),
  ],
  [
    Markup.button.callback("📊 Statistika", "menu_stats"),
    Markup.button.callback("⚙️ Sozlamalar", "menu_settings"),
  ],
]);

const tasksMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("➕ Yangi vazifa", "task_add")],
  [
    Markup.button.callback("📋 Barchasi", "task_list_all"),
    Markup.button.callback("✅ Bajarilgan", "task_list_done"),
  ],
  [
    Markup.button.callback("⏳ Jarayonda", "task_list_pending"),
    Markup.button.callback("🔔 Eslatmali", "task_list_reminders"),
  ],
  [Markup.button.callback("🔙 Orqaga", "back_main")],
]);

const expensesMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("➕ Yangi xarajat", "expense_add")],
  [Markup.button.callback("📋 Bugungi xarajatlar", "expense_list")],
  [Markup.button.callback("📁 Kategoriyalar", "expense_categories")],
  [Markup.button.callback("🔙 Orqaga", "back_main")],
]);

const priorityKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("🔴 Yuqori", "priority_high"),
    Markup.button.callback("🟡 O'rta", "priority_medium"),
    Markup.button.callback("🟢 Past", "priority_low"),
  ],
  [Markup.button.callback("❌ Bekor", "cancel")],
]);

const reminderKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("⏰ 1 soat", "reminder_1h"),
    Markup.button.callback("⏰ 3 soat", "reminder_3h"),
  ],
  [
    Markup.button.callback("⏰ Bugun kechqurun", "reminder_evening"),
    Markup.button.callback("⏰ Ertaga ertalab", "reminder_tomorrow"),
  ],
  [
    Markup.button.callback("⏰ Vaqt kiriting", "reminder_custom"),
  ],
  [Markup.button.callback("⏭ O'tkazib yuborish", "reminder_skip")],
  [Markup.button.callback("❌ Bekor", "cancel")],
]);

const defaultCategoriesWithIcons = [
  { name: "Ovqat", icon: "🍽" },
  { name: "Yo'l", icon: "🚗" },
  { name: "Xarid", icon: "🛒" },
  { name: "To'lov", icon: "💳" },
  { name: "Uy-joy", icon: "🏠" },
  { name: "Sog'liq", icon: "💊" },
  { name: "O'yin-kulgi", icon: "🎮" },
  { name: "Boshqa", icon: "📦" },
];

const defaultCategories = defaultCategoriesWithIcons.map(c => c.name);

function getCategoryIcon(name: string): string {
  const found = defaultCategoriesWithIcons.find(c => c.name === name);
  return found ? found.icon : "📁";
}

function getCategoryKeyboard(categories: string[]) {
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    const icon1 = getCategoryIcon(categories[i]);
    const row = [Markup.button.callback(`${icon1} ${categories[i]}`, `cat_${categories[i]}`)];
    if (categories[i + 1]) {
      const icon2 = getCategoryIcon(categories[i + 1]);
      row.push(Markup.button.callback(`${icon2} ${categories[i + 1]}`, `cat_${categories[i + 1]}`));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback("❌ Bekor", "cancel")]);
  return Markup.inlineKeyboard(rows);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("uz-UZ").format(amount) + " so'm";
}

function getPriorityEmoji(priority: string | null): string {
  switch (priority) {
    case "high": return "🔴";
    case "medium": return "🟡";
    case "low": return "🟢";
    default: return "⚪";
  }
}

function getProgressBar(current: number, target: number): string {
  const percentage = Math.min(100, Math.round((current / target) * 100));
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${percentage}%`;
}

function formatReminderTime(date: Date): string {
  return date.toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

bot.command("start", async (ctx) => {
  const telegramUserId = getTelegramUserId(ctx);
  
  await storage.createOrUpdateUserSettings({
    telegramUserId,
    dailyReportEnabled: true,
    dailyReportTime: "20:00",
    weeklyReportEnabled: true,
    weeklyReportDay: "sunday",
    timezone: "Asia/Tashkent",
  });
  
  const welcomeMessage = `
🌿 *Barakali Vaqt* ga xush kelibsiz!

Sizning shaxsiy rejalashtirish va xarajatlarni kuzatish yordamchingiz.

_"Vaqtni qadrlang, chunki u qaytib kelmaydi"_

Quyidagi tugmalardan birini tanlang:
  `;
  await ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard);
});

bot.command("menu", async (ctx) => {
  await ctx.reply("Asosiy menyu:", mainMenuKeyboard);
});

bot.action("back_main", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("Asosiy menyu:", mainMenuKeyboard);
});

bot.action("cancel", async (ctx) => {
  const numericId = ctx.from?.id;
  if (numericId) userStates.delete(numericId);
  await ctx.answerCbQuery("Bekor qilindi");
  await ctx.editMessageText("Asosiy menyu:", mainMenuKeyboard);
});

bot.action("menu_tasks", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("📋 *Rejalar va Vazifalar*\n\nNima qilmoqchisiz?", {
    parse_mode: "Markdown",
    ...tasksMenuKeyboard,
  });
});

bot.action("task_add", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  userStates.set(numericId, { action: "add_task", step: "title" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📝 *Yangi vazifa*\n\nVazifa nomini yozing:",
    { parse_mode: "Markdown" }
  );
});

bot.action(/^priority_(.+)$/, async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const state = userStates.get(numericId);
  if (!state || state.action !== "add_task" || state.step !== "priority") return;
  
  const priority = ctx.match[1];
  const title = state.data?.title;
  
  userStates.set(numericId, {
    action: "add_task",
    step: "reminder",
    data: { ...state.data, priority },
  });
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📝 *${title}*\n\n🔔 Eslatma vaqtini tanlang:`,
    { parse_mode: "Markdown", ...reminderKeyboard }
  );
});

async function saveTaskWithReminder(ctx: Context, numericId: number, reminderTime: Date | null) {
  const telegramUserId = getTelegramUserId(ctx);
  const state = userStates.get(numericId);
  if (!state || !state.data) return;
  
  const { title, priority } = state.data;
  
  try {
    await storage.createTask({
      text: title,
      completed: false,
      priority,
      telegramUserId,
      reminderTime,
      reminderSent: false,
    });
    
    userStates.delete(numericId);
    
    let message = `✅ Vazifa muvaffaqiyatli qo'shildi!\n\n*${title}*\nMuhimlik: ${getPriorityEmoji(priority)}`;
    if (reminderTime) {
      message += `\n🔔 Eslatma: ${formatReminderTime(reminderTime)}`;
    }
    
    await ctx.editMessageText(message, { 
      parse_mode: "Markdown", 
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]) 
    });
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
}

bot.action("reminder_1h", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  await ctx.answerCbQuery();
  const reminderTime = new Date(Date.now() + 60 * 60 * 1000);
  await saveTaskWithReminder(ctx, numericId, reminderTime);
});

bot.action("reminder_3h", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  await ctx.answerCbQuery();
  const reminderTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
  await saveTaskWithReminder(ctx, numericId, reminderTime);
});

bot.action("reminder_evening", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  await ctx.answerCbQuery();
  const reminderTime = new Date();
  reminderTime.setHours(20, 0, 0, 0);
  if (reminderTime <= new Date()) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }
  await saveTaskWithReminder(ctx, numericId, reminderTime);
});

bot.action("reminder_tomorrow", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  await ctx.answerCbQuery();
  const reminderTime = new Date();
  reminderTime.setDate(reminderTime.getDate() + 1);
  reminderTime.setHours(9, 0, 0, 0);
  await saveTaskWithReminder(ctx, numericId, reminderTime);
});

bot.action("reminder_custom", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const state = userStates.get(numericId);
  if (!state) return;
  
  userStates.set(numericId, {
    ...state,
    step: "reminder_custom",
  });
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "🕐 *Eslatma vaqtini kiriting*\n\nFormat: soat:minut\n\n_Masalan: 14:30_",
    { parse_mode: "Markdown" }
  );
});

bot.action("reminder_skip", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  await ctx.answerCbQuery();
  await saveTaskWithReminder(ctx, numericId, null);
});

bot.action("task_list_reminders", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const tasks = await storage.getTasks(telegramUserId);
  const reminderTasks = tasks.filter(t => t.reminderTime && !t.completed);
  
  if (reminderTasks.length === 0) {
    await ctx.editMessageText(
      "🔔 Eslatmali vazifalar yo'q.",
      { ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]) }
    );
    return;
  }
  
  let message = "🔔 *Eslatmali vazifalar:*\n\n";
  reminderTasks.slice(0, 10).forEach((task) => {
    const priority = getPriorityEmoji(task.priority);
    const time = task.reminderTime ? formatReminderTime(new Date(task.reminderTime)) : "";
    message += `${priority} ${task.text}\n   ⏰ ${time}\n\n`;
  });
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]),
  });
});

bot.action("task_list_all", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const tasks = await storage.getTasks(telegramUserId);
  
  if (tasks.length === 0) {
    await ctx.editMessageText(
      "📋 Hozircha vazifalar yo'q.\n\nYangi vazifa qo'shish uchun tugmani bosing.",
      { ...Markup.inlineKeyboard([
        [Markup.button.callback("➕ Yangi vazifa", "task_add")],
        [Markup.button.callback("🔙 Orqaga", "menu_tasks")]
      ])}
    );
    return;
  }
  
  let message = "📋 *Barcha vazifalar:*\n\n";
  const buttons: any[] = [];
  
  tasks.slice(0, 10).forEach((task, index) => {
    const status = task.completed ? "✅" : "⏳";
    const priority = getPriorityEmoji(task.priority);
    const reminder = task.reminderTime ? " 🔔" : "";
    message += `${status} ${priority} ${task.text}${reminder}\n`;
    
    if (!task.completed) {
      buttons.push([
        Markup.button.callback(`✅ ${task.text.slice(0, 20)}`, `complete_${task.id}`),
        Markup.button.callback(`🗑`, `delete_task_${task.id}`),
      ]);
    }
  });
  
  buttons.push([Markup.button.callback("🔙 Orqaga", "menu_tasks")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action("task_list_done", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const tasks = await storage.getTasks(telegramUserId);
  const doneTasks = tasks.filter(t => t.completed);
  
  if (doneTasks.length === 0) {
    await ctx.editMessageText(
      "✅ Bajarilgan vazifalar yo'q.",
      { ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]) }
    );
    return;
  }
  
  let message = "✅ *Bajarilgan vazifalar:*\n\n";
  doneTasks.slice(0, 10).forEach((task) => {
    message += `✅ ${task.text}\n`;
  });
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]),
  });
});

bot.action("task_list_pending", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const tasks = await storage.getTasks(telegramUserId);
  const pendingTasks = tasks.filter(t => !t.completed);
  
  if (pendingTasks.length === 0) {
    await ctx.editMessageText(
      "⏳ Jarayondagi vazifalar yo'q. Hammasi bajarilgan!",
      { ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]) }
    );
    return;
  }
  
  let message = "⏳ *Jarayondagi vazifalar:*\n\n";
  const buttons: any[] = [];
  
  pendingTasks.slice(0, 10).forEach((task) => {
    const priority = getPriorityEmoji(task.priority);
    const reminder = task.reminderTime ? " 🔔" : "";
    message += `${priority} ${task.text}${reminder}\n`;
    buttons.push([
      Markup.button.callback(`✅ ${task.text.slice(0, 20)}`, `complete_${task.id}`),
      Markup.button.callback(`🗑`, `delete_task_${task.id}`),
    ]);
  });
  
  buttons.push([Markup.button.callback("🔙 Orqaga", "menu_tasks")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action(/^complete_(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.updateTask(taskId, { completed: true }, telegramUserId);
    await ctx.answerCbQuery("Vazifa bajarildi! ✅");
    
    const activeGoals = await storage.getActiveGoals(telegramUserId);
    for (const goal of activeGoals) {
      if (goal.type === "tasks") {
        await storage.updateGoal(goal.id, { currentCount: goal.currentCount + 1 }, telegramUserId);
      }
    }
    
    const tasks = await storage.getTasks(telegramUserId);
    const pendingTasks = tasks.filter(t => !t.completed);
    
    if (pendingTasks.length === 0) {
      await ctx.editMessageText(
        "🎉 Barcha vazifalar bajarildi!",
        { ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]) }
      );
    } else {
      let message = "⏳ *Jarayondagi vazifalar:*\n\n";
      const buttons: any[] = [];
      
      pendingTasks.slice(0, 10).forEach((task) => {
        const priority = getPriorityEmoji(task.priority);
        message += `${priority} ${task.text}\n`;
        buttons.push([
          Markup.button.callback(`✅ ${task.text.slice(0, 20)}`, `complete_${task.id}`),
          Markup.button.callback(`🗑`, `delete_task_${task.id}`),
        ]);
      });
      
      buttons.push([Markup.button.callback("🔙 Orqaga", "menu_tasks")]);
      
      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      });
    }
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action(/^delete_task_(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.deleteTask(taskId, telegramUserId);
    await ctx.answerCbQuery("Vazifa o'chirildi! 🗑");
    
    const tasks = await storage.getTasks(telegramUserId);
    
    if (tasks.length === 0) {
      await ctx.editMessageText(
        "📋 Hozircha vazifalar yo'q.",
        { ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Yangi vazifa", "task_add")],
          [Markup.button.callback("🔙 Orqaga", "menu_tasks")]
        ])}
      );
    } else {
      let message = "📋 *Barcha vazifalar:*\n\n";
      const buttons: any[] = [];
      
      tasks.slice(0, 10).forEach((task) => {
        const status = task.completed ? "✅" : "⏳";
        const priority = getPriorityEmoji(task.priority);
        message += `${status} ${priority} ${task.text}\n`;
        
        if (!task.completed) {
          buttons.push([
            Markup.button.callback(`✅ ${task.text.slice(0, 20)}`, `complete_${task.id}`),
            Markup.button.callback(`🗑`, `delete_task_${task.id}`),
          ]);
        }
      });
      
      buttons.push([Markup.button.callback("🔙 Orqaga", "menu_tasks")]);
      
      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      });
    }
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action("menu_expenses", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const expenses = await storage.getExpenses(telegramUserId);
  const today = new Date();
  const todayExpenses = expenses.filter(e => {
    const expDate = new Date(e.createdAt);
    return expDate.toDateString() === today.toDateString();
  });
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  await ctx.editMessageText(
    `💰 *Xarajatlar*\n\n📅 Bugun: *${formatCurrency(todayTotal)}*\n\nNima qilmoqchisiz?`,
    { parse_mode: "Markdown", ...expensesMenuKeyboard }
  );
});

bot.action("expense_add", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  userStates.set(numericId, { action: "add_expense", step: "amount" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "💰 *Yangi xarajat*\n\nSummani kiriting (faqat raqam):\n\n_Masalan: 50000_",
    { parse_mode: "Markdown" }
  );
});

bot.action(/^cat_(.+)$/, async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const telegramUserId = getTelegramUserId(ctx);
  const state = userStates.get(numericId);
  
  if (state?.action === "add_expense" && state.step === "category") {
    const category = ctx.match[1];
    const { amount, description } = state.data || {};
    
    try {
      await storage.createExpense({
        amount,
        description,
        category,
        telegramUserId,
      });
      
      const budgetLimit = await storage.getBudgetLimitByCategory(telegramUserId, category);
      let warningMessage = "";
      
      if (budgetLimit) {
        const expenses = await storage.getExpenses(telegramUserId);
        const now = new Date();
        let periodExpenses = expenses.filter(e => e.category === category);
        
        if (budgetLimit.period === "monthly") {
          periodExpenses = periodExpenses.filter(e => {
            const d = new Date(e.createdAt);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });
        } else {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          periodExpenses = periodExpenses.filter(e => new Date(e.createdAt) >= weekStart);
        }
        
        const spent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
        const percentage = (spent / budgetLimit.limitAmount) * 100;
        
        if (percentage >= 100) {
          warningMessage = `\n\n🚨 *OGOHLANTIRISH!*\n${category} byudjeti ${Math.round(percentage)}% sarflandi!`;
        } else if (percentage >= 80) {
          warningMessage = `\n\n⚠️ *Diqqat!*\n${category} byudjeti ${Math.round(percentage)}% yetdi.`;
        }
      }
      
      userStates.delete(numericId);
      await ctx.answerCbQuery("Xarajat qo'shildi!");
      await ctx.editMessageText(
        `✅ Xarajat qo'shildi!\n\n💰 *${formatCurrency(amount)}*\n📝 ${description}\n📁 ${category}${warningMessage}`,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_expenses")]]) }
      );
    } catch (error) {
      await ctx.answerCbQuery("Xatolik yuz berdi");
    }
  }
  
  if (state?.action === "add_budget" && state.step === "category") {
    const category = ctx.match[1];
    userStates.set(numericId, {
      action: "add_budget",
      step: "amount",
      data: { category },
    });
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `💳 *${category}* uchun limit\n\nLimit summasini kiriting:\n\n_Masalan: 500000_`,
      { parse_mode: "Markdown" }
    );
  }
});

bot.action("expense_list", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const expenses = await storage.getExpenses(telegramUserId);
  const today = new Date();
  const todayExpenses = expenses.filter(e => {
    const expDate = new Date(e.createdAt);
    return expDate.toDateString() === today.toDateString();
  });
  
  if (todayExpenses.length === 0) {
    await ctx.editMessageText(
      "📋 Bugun xarajat yo'q.",
      { ...Markup.inlineKeyboard([
        [Markup.button.callback("➕ Yangi xarajat", "expense_add")],
        [Markup.button.callback("🔙 Orqaga", "menu_expenses")]
      ])}
    );
    return;
  }
  
  const total = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
  let message = `📋 *Bugungi xarajatlar:*\n\n`;
  
  const buttons: any[] = [];
  todayExpenses.slice(0, 10).forEach((expense) => {
    message += `• ${expense.description} - *${formatCurrency(expense.amount)}* (${expense.category})\n`;
    buttons.push([
      Markup.button.callback(`🗑 ${expense.description.slice(0, 25)}`, `delete_expense_${expense.id}`)
    ]);
  });
  
  message += `\n📊 *Jami: ${formatCurrency(total)}*`;
  
  buttons.push([Markup.button.callback("🔙 Orqaga", "menu_expenses")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action(/^delete_expense_(\d+)$/, async (ctx) => {
  const expenseId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.deleteExpense(expenseId, telegramUserId);
    await ctx.answerCbQuery("Xarajat o'chirildi! 🗑");
    
    const expenses = await storage.getExpenses(telegramUserId);
    const today = new Date();
    const todayExpenses = expenses.filter(e => {
      const expDate = new Date(e.createdAt);
      return expDate.toDateString() === today.toDateString();
    });
    
    if (todayExpenses.length === 0) {
      await ctx.editMessageText(
        "📋 Bugun xarajat yo'q.",
        { ...Markup.inlineKeyboard([
          [Markup.button.callback("➕ Yangi xarajat", "expense_add")],
          [Markup.button.callback("🔙 Orqaga", "menu_expenses")]
        ])}
      );
    } else {
      const total = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
      let message = `📋 *Bugungi xarajatlar:*\n\n`;
      
      const buttons: any[] = [];
      todayExpenses.slice(0, 10).forEach((expense) => {
        message += `• ${expense.description} - *${formatCurrency(expense.amount)}* (${expense.category})\n`;
        buttons.push([
          Markup.button.callback(`🗑 ${expense.description.slice(0, 25)}`, `delete_expense_${expense.id}`)
        ]);
      });
      
      message += `\n📊 *Jami: ${formatCurrency(total)}*`;
      buttons.push([Markup.button.callback("🔙 Orqaga", "menu_expenses")]);
      
      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(buttons),
      });
    }
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action("expense_categories", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const userCategories = await storage.getExpenseCategories(telegramUserId);
  
  let message = "📁 *Xarajat Kategoriyalari*\n\n";
  message += "Kategoriyani bosib, uning xarajatlarini ko'ring yoki o'chiring:\n\n";
  
  const buttons: any[] = [];
  
  if (userCategories.length > 0) {
    for (let i = 0; i < userCategories.length; i += 2) {
      const cat1 = userCategories[i];
      const icon1 = cat1.icon || getCategoryIcon(cat1.name);
      const row = [Markup.button.callback(`${icon1} ${cat1.name}`, `view_category_${cat1.id}`)];
      
      if (userCategories[i + 1]) {
        const cat2 = userCategories[i + 1];
        const icon2 = cat2.icon || getCategoryIcon(cat2.name);
        row.push(Markup.button.callback(`${icon2} ${cat2.name}`, `view_category_${cat2.id}`));
      }
      buttons.push(row);
    }
  } else {
    for (let i = 0; i < defaultCategoriesWithIcons.length; i += 2) {
      const cat1 = defaultCategoriesWithIcons[i];
      const row = [Markup.button.callback(`${cat1.icon} ${cat1.name}`, `default_cat_${cat1.name}`)];
      
      if (defaultCategoriesWithIcons[i + 1]) {
        const cat2 = defaultCategoriesWithIcons[i + 1];
        row.push(Markup.button.callback(`${cat2.icon} ${cat2.name}`, `default_cat_${cat2.name}`));
      }
      buttons.push(row);
    }
    message += "_Standart kategoriyalar ko'rsatilmoqda._\n_O'z kategoriyangizni qo'shing!_\n\n";
  }
  
  buttons.push([Markup.button.callback("➕ Yangi kategoriya", "add_category")]);
  buttons.push([Markup.button.callback("🔙 Orqaga", "menu_expenses")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action(/^view_category_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const categoryId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  const categories = await storage.getExpenseCategories(telegramUserId);
  const category = categories.find(c => c.id === categoryId);
  
  if (!category) {
    await ctx.editMessageText("Kategoriya topilmadi", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "expense_categories")]])
    });
    return;
  }
  
  const expenses = await storage.getExpenses(telegramUserId);
  const catExpenses = expenses.filter(e => e.category === category.name);
  const total = catExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const icon = category.icon || getCategoryIcon(category.name);
  let message = `${icon} *${category.name}*\n\n`;
  message += `📊 Jami xarajatlar: *${formatCurrency(total)}*\n`;
  message += `📝 Xarajatlar soni: *${catExpenses.length}*\n`;
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🗑 O'chirish", `delete_category_${categoryId}`)],
      [Markup.button.callback("🔙 Orqaga", "expense_categories")]
    ]),
  });
});

bot.action(/^default_cat_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const categoryName = ctx.match[1];
  const telegramUserId = getTelegramUserId(ctx);
  
  const icon = getCategoryIcon(categoryName);
  const expenses = await storage.getExpenses(telegramUserId);
  const catExpenses = expenses.filter(e => e.category === categoryName);
  const total = catExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  let message = `${icon} *${categoryName}*\n\n`;
  message += `📊 Jami xarajatlar: *${formatCurrency(total)}*\n`;
  message += `📝 Xarajatlar soni: *${catExpenses.length}*\n\n`;
  message += "_Bu standart kategoriya. O'chirish uchun o'z kategoriyangizni yarating._";
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔙 Orqaga", "expense_categories")]
    ]),
  });
});

bot.action(/^delete_category_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const categoryId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.deleteExpenseCategory(categoryId, telegramUserId);
    await ctx.editMessageText("✅ Kategoriya o'chirildi!", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "expense_categories")]])
    });
  } catch (error) {
    await ctx.editMessageText("❌ Xatolik yuz berdi", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "expense_categories")]])
    });
  }
});

const availableIcons = ["🍽", "🚗", "🛒", "💳", "🏠", "💊", "🎮", "📦", "✈️", "👕", "📚", "💡", "🎁", "☕", "🍕", "🎬"];

bot.action("add_category", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  userStates.set(numericId, { action: "add_category", step: "name" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📁 *Yangi kategoriya*\n\nKategoriya nomini yozing (masalan: Kafe):",
    { 
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", "expense_categories")]])
    }
  );
});

bot.action(/^select_icon_(.+)$/, async (ctx) => {
  const icon = ctx.match[1];
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const state = userStates.get(numericId);
  if (!state || state.action !== "add_category") return;
  
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.createExpenseCategory({
      name: state.data?.name || "Kategoriya",
      icon: icon,
      color: "hsl(0, 0%, 50%)",
      telegramUserId,
    });
    
    userStates.delete(numericId);
    await ctx.editMessageText(`✅ Kategoriya yaratildi!\n\n${icon} *${state.data?.name}*`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Kategoriyalar", "expense_categories")]])
    });
  } catch (error) {
    await ctx.editMessageText("❌ Xatolik yuz berdi", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "expense_categories")]])
    });
  }
});

bot.action("menu_budget", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const limits = await storage.getBudgetLimits(telegramUserId);
  const expenses = await storage.getExpenses(telegramUserId);
  const now = new Date();
  
  let message = "💳 *Byudjet Limitleri*\n\n";
  
  if (limits.length === 0) {
    message += "Hozircha limit yo'q.\n\nLimit qo'shish uchun tugmani bosing.";
  } else {
    for (const limit of limits) {
      let periodExpenses = expenses.filter(e => e.category === limit.category);
      
      if (limit.period === "monthly") {
        periodExpenses = periodExpenses.filter(e => {
          const d = new Date(e.createdAt);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
      } else {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        periodExpenses = periodExpenses.filter(e => new Date(e.createdAt) >= weekStart);
      }
      
      const spent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
      const remaining = limit.limitAmount - spent;
      const percentage = Math.round((spent / limit.limitAmount) * 100);
      
      let statusEmoji = "🟢";
      if (percentage >= 100) statusEmoji = "🔴";
      else if (percentage >= 80) statusEmoji = "🟡";
      
      message += `${statusEmoji} *${limit.category}*\n`;
      message += `├ Limit: ${formatCurrency(limit.limitAmount)} (${limit.period === "monthly" ? "oylik" : "haftalik"})\n`;
      message += `├ Sarflangan: ${formatCurrency(spent)} (${percentage}%)\n`;
      message += `└ Qoldi: ${formatCurrency(Math.max(0, remaining))}\n\n`;
    }
  }
  
  const buttons: any[] = [];
  limits.forEach(limit => {
    buttons.push([Markup.button.callback(`🗑 ${limit.category}`, `delete_budget_${limit.id}`)]);
  });
  buttons.push([Markup.button.callback("➕ Yangi limit", "add_budget")]);
  buttons.push([Markup.button.callback("🔙 Orqaga", "back_main")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action("add_budget", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const telegramUserId = getTelegramUserId(ctx);
  const categories = await storage.getExpenseCategories(telegramUserId);
  const catNames = categories.length > 0 ? categories.map(c => c.name) : defaultCategories;
  
  userStates.set(numericId, { action: "add_budget", step: "category" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "💳 *Yangi byudjet limiti*\n\nKategoriyani tanlang:",
    { parse_mode: "Markdown", ...getCategoryKeyboard(catNames) }
  );
});

bot.action(/^delete_budget_(\d+)$/, async (ctx) => {
  const budgetId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.deleteBudgetLimit(budgetId, telegramUserId);
    await ctx.answerCbQuery("Limit o'chirildi! 🗑");
    
    const limits = await storage.getBudgetLimits(telegramUserId);
    
    let message = "💳 *Byudjet Limitleri*\n\n";
    if (limits.length === 0) {
      message += "Hozircha limit yo'q.";
    }
    
    const buttons: any[] = [];
    limits.forEach(limit => {
      buttons.push([Markup.button.callback(`🗑 ${limit.category}`, `delete_budget_${limit.id}`)]);
    });
    buttons.push([Markup.button.callback("➕ Yangi limit", "add_budget")]);
    buttons.push([Markup.button.callback("🔙 Orqaga", "back_main")]);
    
    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action(/^budget_period_(.+)$/, async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const period = ctx.match[1];
  const telegramUserId = getTelegramUserId(ctx);
  const state = userStates.get(numericId);
  
  if (!state || state.action !== "add_budget" || state.step !== "period") return;
  
  const { category, amount } = state.data || {};
  
  try {
    await storage.createBudgetLimit({
      category,
      limitAmount: amount,
      period,
      telegramUserId,
    });
    
    userStates.delete(numericId);
    await ctx.answerCbQuery("Limit qo'shildi!");
    await ctx.editMessageText(
      `✅ Byudjet limiti qo'shildi!\n\n📁 Kategoriya: *${category}*\n💰 Limit: *${formatCurrency(amount)}*\n📅 Davr: ${period === "monthly" ? "Oylik" : "Haftalik"}`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_budget")]]) }
    );
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action("menu_goals", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const goals = await storage.getActiveGoals(telegramUserId);
  
  let message = "🎯 *Maqsadlar*\n\n";
  
  if (goals.length === 0) {
    message += "Hozircha maqsadlar yo'q.\n\nYangi maqsad qo'shing!";
  } else {
    for (const goal of goals) {
      const progressBar = getProgressBar(goal.currentCount, goal.targetCount);
      const periodText = goal.period === "weekly" ? "haftalik" : "oylik";
      const typeText = goal.type === "tasks" ? "vazifa" : "xarajat";
      
      message += `📌 *${goal.title}*\n`;
      message += `├ ${progressBar}\n`;
      message += `├ ${goal.currentCount}/${goal.targetCount} ${typeText}\n`;
      message += `└ ${periodText}\n\n`;
    }
  }
  
  const buttons: any[] = [];
  goals.forEach(goal => {
    buttons.push([Markup.button.callback(`🗑 ${goal.title.slice(0, 25)}`, `delete_goal_${goal.id}`)]);
  });
  buttons.push([Markup.button.callback("➕ Yangi maqsad", "add_goal")]);
  buttons.push([Markup.button.callback("🔙 Orqaga", "back_main")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

bot.action("add_goal", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  userStates.set(numericId, { action: "add_goal", step: "title" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "🎯 *Yangi maqsad*\n\nMaqsad nomini yozing:\n\n_Masalan: Haftalik 10 vazifa bajarish_",
    { parse_mode: "Markdown" }
  );
});

bot.action(/^goal_type_(.+)$/, async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const type = ctx.match[1];
  const state = userStates.get(numericId);
  
  if (!state || state.action !== "add_goal" || state.step !== "type") return;
  
  userStates.set(numericId, {
    action: "add_goal",
    step: "target",
    data: { ...state.data, type },
  });
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🎯 *${state.data?.title}*\n\nMaqsad sonini kiriting:\n\n_Masalan: 10_`,
    { parse_mode: "Markdown" }
  );
});

bot.action(/^goal_period_(.+)$/, async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const period = ctx.match[1];
  const telegramUserId = getTelegramUserId(ctx);
  const state = userStates.get(numericId);
  
  if (!state || state.action !== "add_goal" || state.step !== "period") return;
  
  const { title, type, targetCount } = state.data || {};
  
  const now = new Date();
  let endDate = new Date(now);
  if (period === "weekly") {
    endDate.setDate(now.getDate() + (7 - now.getDay()));
  } else {
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  
  try {
    await storage.createGoal({
      title,
      type,
      targetCount,
      currentCount: 0,
      period,
      telegramUserId,
      startDate: now,
      endDate,
    });
    
    userStates.delete(numericId);
    await ctx.answerCbQuery("Maqsad qo'shildi!");
    await ctx.editMessageText(
      `✅ Maqsad qo'shildi!\n\n🎯 *${title}*\n📊 ${targetCount} ${type === "tasks" ? "vazifa" : "xarajat"}\n📅 ${period === "weekly" ? "Haftalik" : "Oylik"}`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_goals")]]) }
    );
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action(/^delete_goal_(\d+)$/, async (ctx) => {
  const goalId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.deleteGoal(goalId, telegramUserId);
    await ctx.answerCbQuery("Maqsad o'chirildi! 🗑");
    
    const goals = await storage.getActiveGoals(telegramUserId);
    
    let message = "🎯 *Maqsadlar*\n\n";
    if (goals.length === 0) {
      message += "Hozircha maqsadlar yo'q.";
    }
    
    const buttons: any[] = [];
    goals.forEach(goal => {
      buttons.push([Markup.button.callback(`🗑 ${goal.title.slice(0, 25)}`, `delete_goal_${goal.id}`)]);
    });
    buttons.push([Markup.button.callback("➕ Yangi maqsad", "add_goal")]);
    buttons.push([Markup.button.callback("🔙 Orqaga", "back_main")]);
    
    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action("menu_stats", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const tasks = await storage.getTasks(telegramUserId);
  const expenses = await storage.getExpenses(telegramUserId);
  const goals = await storage.getActiveGoals(telegramUserId);
  
  const completedTasks = tasks.filter(t => t.completed).length;
  const pendingTasks = tasks.filter(t => !t.completed).length;
  
  const today = new Date();
  const thisWeek = new Date(today);
  thisWeek.setDate(today.getDate() - 7);
  
  const weekExpenses = expenses.filter(e => new Date(e.createdAt) >= thisWeek);
  const weekTotal = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const todayExpenses = expenses.filter(e => {
    const expDate = new Date(e.createdAt);
    return expDate.toDateString() === today.toDateString();
  });
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const categoryTotals: Record<string, number> = {};
  weekExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });
  
  let message = `📊 *Statistika*\n\n`;
  message += `📋 *Vazifalar:*\n`;
  message += `├ Bajarilgan: ${completedTasks}\n`;
  message += `├ Jarayonda: ${pendingTasks}\n`;
  message += `└ Jami: ${tasks.length}\n\n`;
  
  message += `💰 *Xarajatlar:*\n`;
  message += `├ Bugun: ${formatCurrency(todayTotal)}\n`;
  message += `└ Haftalik: ${formatCurrency(weekTotal)}\n\n`;
  
  if (Object.keys(categoryTotals).length > 0) {
    message += `📁 *Kategoriya bo'yicha (haftalik):*\n`;
    Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amount]) => {
        message += `• ${cat}: ${formatCurrency(amount)}\n`;
      });
    message += "\n";
  }
  
  if (goals.length > 0) {
    message += `🎯 *Maqsadlar:*\n`;
    goals.forEach(goal => {
      const percentage = Math.round((goal.currentCount / goal.targetCount) * 100);
      message += `• ${goal.title}: ${percentage}%\n`;
    });
  }
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "back_main")]]),
  });
});

bot.action("menu_settings", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const settings = await storage.getUserSettings(telegramUserId) || {
    dailyReportEnabled: true,
    dailyReportTime: "20:00",
    weeklyReportEnabled: true,
    weeklyReportDay: "sunday",
  };
  
  let message = "⚙️ *Sozlamalar*\n\n";
  message += `📅 *Kunlik hisobot:*\n`;
  message += `├ Holat: ${settings.dailyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Vaqt: ${settings.dailyReportTime}\n\n`;
  message += `📊 *Haftalik hisobot:*\n`;
  message += `├ Holat: ${settings.weeklyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Kun: ${settings.weeklyReportDay === "sunday" ? "Yakshanba" : "Shanba"}\n`;
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback(settings.dailyReportEnabled ? "🔕 Kunlik o'chirish" : "🔔 Kunlik yoqish", "toggle_daily")],
      [Markup.button.callback(settings.weeklyReportEnabled ? "🔕 Haftalik o'chirish" : "🔔 Haftalik yoqish", "toggle_weekly")],
      [Markup.button.callback("🔙 Orqaga", "back_main")]
    ]),
  });
});

bot.action("toggle_daily", async (ctx) => {
  const telegramUserId = getTelegramUserId(ctx);
  const settings = await storage.getUserSettings(telegramUserId);
  
  await storage.createOrUpdateUserSettings({
    telegramUserId,
    dailyReportEnabled: !settings?.dailyReportEnabled,
    dailyReportTime: settings?.dailyReportTime || "20:00",
    weeklyReportEnabled: settings?.weeklyReportEnabled ?? true,
    weeklyReportDay: settings?.weeklyReportDay || "sunday",
    timezone: settings?.timezone || "Asia/Tashkent",
  });
  
  await ctx.answerCbQuery(settings?.dailyReportEnabled ? "Kunlik hisobot o'chirildi" : "Kunlik hisobot yoqildi");
  
  const newSettings = await storage.getUserSettings(telegramUserId);
  let message = "⚙️ *Sozlamalar*\n\n";
  message += `📅 *Kunlik hisobot:*\n`;
  message += `├ Holat: ${newSettings?.dailyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Vaqt: ${newSettings?.dailyReportTime}\n\n`;
  message += `📊 *Haftalik hisobot:*\n`;
  message += `├ Holat: ${newSettings?.weeklyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Kun: ${newSettings?.weeklyReportDay === "sunday" ? "Yakshanba" : "Shanba"}\n`;
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback(newSettings?.dailyReportEnabled ? "🔕 Kunlik o'chirish" : "🔔 Kunlik yoqish", "toggle_daily")],
      [Markup.button.callback(newSettings?.weeklyReportEnabled ? "🔕 Haftalik o'chirish" : "🔔 Haftalik yoqish", "toggle_weekly")],
      [Markup.button.callback("🔙 Orqaga", "back_main")]
    ]),
  });
});

bot.action("toggle_weekly", async (ctx) => {
  const telegramUserId = getTelegramUserId(ctx);
  const settings = await storage.getUserSettings(telegramUserId);
  
  await storage.createOrUpdateUserSettings({
    telegramUserId,
    dailyReportEnabled: settings?.dailyReportEnabled ?? true,
    dailyReportTime: settings?.dailyReportTime || "20:00",
    weeklyReportEnabled: !settings?.weeklyReportEnabled,
    weeklyReportDay: settings?.weeklyReportDay || "sunday",
    timezone: settings?.timezone || "Asia/Tashkent",
  });
  
  await ctx.answerCbQuery(settings?.weeklyReportEnabled ? "Haftalik hisobot o'chirildi" : "Haftalik hisobot yoqildi");
  
  const newSettings = await storage.getUserSettings(telegramUserId);
  let message = "⚙️ *Sozlamalar*\n\n";
  message += `📅 *Kunlik hisobot:*\n`;
  message += `├ Holat: ${newSettings?.dailyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Vaqt: ${newSettings?.dailyReportTime}\n\n`;
  message += `📊 *Haftalik hisobot:*\n`;
  message += `├ Holat: ${newSettings?.weeklyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Kun: ${newSettings?.weeklyReportDay === "sunday" ? "Yakshanba" : "Shanba"}\n`;
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback(newSettings?.dailyReportEnabled ? "🔕 Kunlik o'chirish" : "🔔 Kunlik yoqish", "toggle_daily")],
      [Markup.button.callback(newSettings?.weeklyReportEnabled ? "🔕 Haftalik o'chirish" : "🔔 Haftalik yoqish", "toggle_weekly")],
      [Markup.button.callback("🔙 Orqaga", "back_main")]
    ]),
  });
});

bot.on("text", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const telegramUserId = getTelegramUserId(ctx);
  const state = userStates.get(numericId);
  if (!state) {
    await ctx.reply("Asosiy menyu:", mainMenuKeyboard);
    return;
  }
  
  const text = ctx.message.text;
  
  if (state.action === "add_task") {
    if (state.step === "title") {
      userStates.set(numericId, {
        action: "add_task",
        step: "priority",
        data: { title: text },
      });
      await ctx.reply("Muhimlik darajasini tanlang:", priorityKeyboard);
    } else if (state.step === "reminder_custom") {
      const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) {
        await ctx.reply("Noto'g'ri format. Iltimos, soat:minut formatida kiriting (masalan: 14:30):");
        return;
      }
      
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        await ctx.reply("Noto'g'ri vaqt. Soat 0-23, minut 0-59 oralig'ida bo'lishi kerak:");
        return;
      }
      
      const reminderTime = new Date();
      reminderTime.setHours(hours, minutes, 0, 0);
      if (reminderTime <= new Date()) {
        reminderTime.setDate(reminderTime.getDate() + 1);
      }
      
      await saveTaskWithReminder(ctx, numericId, reminderTime);
    }
  }
  
  if (state.action === "add_expense") {
    if (state.step === "amount") {
      const amount = parseInt(text.replace(/\s/g, ""));
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply("Iltimos, to'g'ri summa kiriting (faqat raqam):");
        return;
      }
      
      userStates.set(numericId, {
        action: "add_expense",
        step: "description",
        data: { amount },
      });
      await ctx.reply("Xarajat tavsifini yozing:\n\n_Masalan: Tushlik_", { parse_mode: "Markdown" });
    } else if (state.step === "description") {
      const categories = await storage.getExpenseCategories(telegramUserId);
      const catNames = categories.length > 0 
        ? categories.map(c => c.name) 
        : defaultCategories;
      
      userStates.set(numericId, {
        action: "add_expense",
        step: "category",
        data: { ...state.data, description: text },
      });
      await ctx.reply("Kategoriyani tanlang:", getCategoryKeyboard(catNames));
    }
  }
  
  if (state.action === "add_category") {
    if (state.step === "name") {
      userStates.set(numericId, {
        action: "add_category",
        step: "icon",
        data: { name: text },
      });
      
      const iconRows = [];
      for (let i = 0; i < availableIcons.length; i += 4) {
        const row = [];
        for (let j = i; j < i + 4 && j < availableIcons.length; j++) {
          row.push(Markup.button.callback(availableIcons[j], `select_icon_${availableIcons[j]}`));
        }
        iconRows.push(row);
      }
      iconRows.push([Markup.button.callback("❌ Bekor", "expense_categories")]);
      
      await ctx.reply(
        `📁 *${text}*\n\nKategoriya uchun icon tanlang:`,
        { 
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard(iconRows)
        }
      );
    }
  }
  
  if (state.action === "add_budget") {
    if (state.step === "amount") {
      const amount = parseInt(text.replace(/\s/g, ""));
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply("Iltimos, to'g'ri summa kiriting (faqat raqam):");
        return;
      }
      
      userStates.set(numericId, {
        action: "add_budget",
        step: "period",
        data: { ...state.data, amount },
      });
      await ctx.reply(
        "Davr tanlang:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("📅 Haftalik", "budget_period_weekly"),
            Markup.button.callback("📆 Oylik", "budget_period_monthly"),
          ],
          [Markup.button.callback("❌ Bekor", "cancel")],
        ])
      );
    }
  }
  
  if (state.action === "add_goal") {
    if (state.step === "title") {
      userStates.set(numericId, {
        action: "add_goal",
        step: "type",
        data: { title: text },
      });
      await ctx.reply(
        "Maqsad turini tanlang:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("📋 Vazifalar", "goal_type_tasks"),
            Markup.button.callback("💰 Xarajatlar", "goal_type_expenses"),
          ],
          [Markup.button.callback("❌ Bekor", "cancel")],
        ])
      );
    } else if (state.step === "target") {
      const targetCount = parseInt(text);
      if (isNaN(targetCount) || targetCount <= 0) {
        await ctx.reply("Iltimos, to'g'ri son kiriting:");
        return;
      }
      
      userStates.set(numericId, {
        action: "add_goal",
        step: "period",
        data: { ...state.data, targetCount },
      });
      await ctx.reply(
        "Davr tanlang:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("📅 Haftalik", "goal_period_weekly"),
            Markup.button.callback("📆 Oylik", "goal_period_monthly"),
          ],
          [Markup.button.callback("❌ Bekor", "cancel")],
        ])
      );
    }
  }
});

export async function startBot() {
  try {
    await bot.launch();
    console.log("🤖 Telegram bot ishga tushdi!");
    
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (error) {
    console.error("Bot ishga tushirishda xatolik:", error);
  }
}

export { bot };
