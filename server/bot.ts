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

const defaultCategories = ["Ovqat", "Yo'l", "Xarid", "To'lov", "Boshqa"];

function getCategoryKeyboard(categories: string[]) {
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row = [Markup.button.callback(categories[i], `cat_${categories[i]}`)];
    if (categories[i + 1]) {
      row.push(Markup.button.callback(categories[i + 1], `cat_${categories[i + 1]}`));
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

bot.command("start", async (ctx) => {
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
  
  const telegramUserId = getTelegramUserId(ctx);
  const state = userStates.get(numericId);
  if (!state || state.action !== "add_task" || state.step !== "priority") return;
  
  const priority = ctx.match[1];
  const title = state.data?.title;
  
  try {
    await storage.createTask({
      text: title,
      completed: false,
      priority,
      telegramUserId,
    });
    
    userStates.delete(numericId);
    await ctx.answerCbQuery("Vazifa qo'shildi!");
    await ctx.editMessageText(
      `✅ Vazifa muvaffaqiyatli qo'shildi!\n\n*${title}*\nMuhimlik: ${getPriorityEmoji(priority)}`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_tasks")]]) }
    );
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
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
});

bot.action(/^complete_(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.updateTask(taskId, { completed: true }, telegramUserId);
    await ctx.answerCbQuery("Vazifa bajarildi! ✅");
    
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
  if (!state || state.action !== "add_expense" || state.step !== "category") return;
  
  const category = ctx.match[1];
  const { amount, description } = state.data || {};
  
  try {
    await storage.createExpense({
      amount,
      description,
      category,
      telegramUserId,
    });
    
    userStates.delete(numericId);
    await ctx.answerCbQuery("Xarajat qo'shildi!");
    await ctx.editMessageText(
      `✅ Xarajat qo'shildi!\n\n💰 *${formatCurrency(amount)}*\n📝 ${description}\n📁 ${category}`,
      { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_expenses")]]) }
    );
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
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
  
  const categories = await storage.getExpenseCategories(telegramUserId);
  const catNames = categories.length > 0 
    ? categories.map(c => c.name) 
    : defaultCategories;
  
  let message = "📁 *Kategoriyalar:*\n\n";
  catNames.forEach((name, i) => {
    message += `${i + 1}. ${name}\n`;
  });
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("➕ Yangi kategoriya", "add_category")],
      [Markup.button.callback("🔙 Orqaga", "menu_expenses")]
    ]),
  });
});

bot.action("add_category", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  userStates.set(numericId, { action: "add_category", step: "name" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📁 *Yangi kategoriya*\n\nKategoriya nomini yozing:",
    { parse_mode: "Markdown" }
  );
});

bot.action("menu_stats", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const tasks = await storage.getTasks(telegramUserId);
  const expenses = await storage.getExpenses(telegramUserId);
  
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
  }
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "back_main")]]),
  });
});

bot.action("menu_settings", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "⚙️ *Sozlamalar*\n\nHozircha sozlamalar mavjud emas.\n\nYangi imkoniyatlar tez orada qo'shiladi!",
    { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "back_main")]]) }
  );
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
      try {
        await storage.createExpenseCategory({ name: text, icon: "wallet", telegramUserId });
        userStates.delete(numericId);
        await ctx.reply(
          `✅ "${text}" kategoriyasi qo'shildi!`,
          Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "expense_categories")]])
        );
      } catch (error) {
        await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
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
