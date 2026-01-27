import { Telegraf, Markup } from "telegraf";
import type { Context } from "telegraf";
import { storage } from "./storage";
import { UZBEKISTAN_REGIONS, getPrayerTimesForRegion, getPrayerTimesForLocation, formatPrayerTimesMessage, type RegionCode } from "./prayer";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID?.trim();
const UZ_TIMEZONE_OFFSET = 5 * 60 * 60 * 1000;

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  trial: { name: "Sinov", days: 3, price: 0 },
  monthly_1: { name: "1 oylik", days: 30, price: 20000 },
  monthly_2: { name: "2 oylik", days: 60, price: 35000 },
  monthly_3: { name: "3 oylik", days: 90, price: 50000 },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("uz-UZ").format(amount) + " so'm";
}

function getUzbekistanTime(): Date {
  return new Date(Date.now() + UZ_TIMEZONE_OFFSET);
}

function uzTimeToUTC(uzDate: Date): Date {
  return new Date(uzDate.getTime() - UZ_TIMEZONE_OFFSET);
}

function createUzbekistanDateTime(hours: number, minutes: number): Date {
  const uzNow = getUzbekistanTime();
  const uzDate = new Date(uzNow);
  uzDate.setHours(hours, minutes, 0, 0);
  if (uzDate <= uzNow) {
    uzDate.setDate(uzDate.getDate() + 1);
  }
  return uzTimeToUTC(uzDate);
}

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Safe wrapper to handle Telegram API errors gracefully
function isTelegramError(error: any, codes: number[]): boolean {
  return codes.includes(error?.response?.error_code);
}

function isIgnorableError(error: any): boolean {
  const description = error?.response?.description || "";
  const ignorablePatterns = [
    "message is not modified",
    "message content and reply markup are exactly the same",
    "query is too old",
    "bot was blocked by the user",
    "user is deactivated",
    "chat not found",
    "bot was kicked",
    "have no rights to send",
    "message to edit not found",
    "BUTTON_DATA_INVALID"
  ];
  return ignorablePatterns.some(p => description.includes(p)) || 
         isTelegramError(error, [400, 403]);
}

async function safeAnswerCallback(ctx: Context): Promise<void> {
  try {
    await ctx.answerCbQuery().catch(() => {});
  } catch {}
}

async function safeEditMessage(ctx: Context, text: string, extra?: any): Promise<boolean> {
  try {
    await ctx.editMessageText(text, extra);
    return true;
  } catch (error: any) {
    if (isIgnorableError(error)) {
      return true;
    }
    console.error("Edit message error:", error?.response?.description || error.message);
    return false;
  }
}

async function safeSendMessage(ctx: Context, text: string, extra?: any): Promise<boolean> {
  try {
    await ctx.reply(text, extra);
    return true;
  } catch (error: any) {
    if (isIgnorableError(error)) {
      return true;
    }
    console.error("Send message error:", error?.response?.description || error.message);
    return false;
  }
}

interface UserState {
  action?: string;
  step?: string;
  data?: Record<string, any>;
}

// Escape special Markdown characters to prevent parsing errors
function escapeMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/\|/g, "\\|");
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
    Markup.button.callback("🕌 Ibodat", "menu_prayer"),
    Markup.button.callback("📊 Statistika", "menu_stats"),
  ],
  [
    Markup.button.callback("💎 Obuna", "menu_subscription"),
    Markup.button.callback("⚙️ Sozlamalar", "menu_settings"),
  ],
]);

// In-memory cache for subscription checks (5 minute TTL)
const subscriptionCache = new Map<string, { data: any; expiry: number }>();
const SUB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function invalidateSubscriptionCache(telegramUserId: string) {
  subscriptionCache.delete(telegramUserId);
}

// Subscription helper functions
async function checkSubscription(telegramUserId: string): Promise<{ isActive: boolean; daysLeft: number; status: string; planType: string }> {
  // Check cache first
  const cached = subscriptionCache.get(telegramUserId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  
  const subscription = await storage.getSubscription(telegramUserId);
  
  if (!subscription) {
    const result = { isActive: false, daysLeft: 0, status: "none", planType: "none" };
    subscriptionCache.set(telegramUserId, { data: result, expiry: Date.now() + SUB_CACHE_TTL });
    return result;
  }
  
  const now = new Date();
  const endDate = new Date(subscription.endDate);
  const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  let result;
  if (subscription.status === "trial" || subscription.status === "active") {
    if (daysLeft > 0) {
      result = { isActive: true, daysLeft, status: subscription.status, planType: subscription.planType };
    } else {
      result = { isActive: false, daysLeft: 0, status: "expired", planType: subscription.planType };
    }
  } else {
    result = { isActive: false, daysLeft: 0, status: "expired", planType: subscription.planType };
  }
  
  subscriptionCache.set(telegramUserId, { data: result, expiry: Date.now() + SUB_CACHE_TTL });
  return result;
}

async function createTrialSubscription(telegramUserId: string): Promise<boolean> {
  const existingSub = await storage.getSubscription(telegramUserId);
  if (existingSub?.trialUsed) {
    return false;
  }
  
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + SUBSCRIPTION_PLANS.trial.days * 24 * 60 * 60 * 1000);
  
  if (existingSub) {
    await storage.updateSubscription(telegramUserId, {
      status: "trial",
      planType: "trial",
      startDate,
      endDate,
      trialUsed: true,
    });
  } else {
    await storage.createSubscription({
      telegramUserId,
      status: "trial",
      planType: "trial",
      startDate,
      endDate,
      trialUsed: true,
    });
  }
  
  // Invalidate subscription cache
  invalidateSubscriptionCache(telegramUserId);
  
  return true;
}

async function showSubscriptionRequired(ctx: Context, featureName: string) {
  await ctx.answerCbQuery("Obuna talab qilinadi");
  await ctx.editMessageText(
    `🔒 *${featureName}* funksiyasidan foydalanish uchun obuna talab qilinadi.\n\n` +
    `Obuna rejalarini ko'rish uchun quyidagi tugmani bosing:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💎 Obuna rejalarini ko'rish", "menu_subscription")],
        [Markup.button.callback("🔙 Orqaga", "back_main")],
      ]),
    }
  );
}

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
  [Markup.button.callback("📈 Hisobot", "expense_report")],
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
  const firstName = ctx.from?.first_name || "";
  const lastName = ctx.from?.last_name || "";
  const username = ctx.from?.username || "";
  
  // Register or update user
  await storage.createOrUpdateBotUser({
    telegramUserId,
    firstName,
    lastName,
    username,
  });
  
  await storage.createOrUpdateUserSettings({
    telegramUserId,
    dailyReportEnabled: true,
    dailyReportTime: "20:00",
    weeklyReportEnabled: true,
    weeklyReportDay: "sunday",
    timezone: "Asia/Tashkent",
  });
  
  // Check if user has subscription
  const subStatus = await checkSubscription(telegramUserId);
  
  if (subStatus.status === "none") {
    // New user - show welcome and offer trial
    const welcomeMessage = `
🌿 *Barakali Vaqt* ga xush kelibsiz, ${firstName}!

Sizning shaxsiy rejalashtirish va xarajatlarni kuzatish yordamchingiz.

✨ *Bot imkoniyatlari:*
📋 Vazifalar va eslatmalar
💰 Xarajatlarni kuzatish
🎯 Maqsadlar va statistika
🕌 Namoz vaqtlari va eslatmalar
📊 Kunlik va haftalik hisobotlar

🎁 *Maxsus taklif:* 3 kunlik BEPUL sinov muddati!

Sinov muddatida barcha imkoniyatlardan foydalanishingiz mumkin.
    `;
    
    await ctx.replyWithMarkdown(welcomeMessage, Markup.inlineKeyboard([
      [Markup.button.callback("🎁 Bepul sinov boshlash (3 kun)", "start_trial")],
      [Markup.button.callback("💎 Obuna rejalarini ko'rish", "menu_subscription")],
    ]));
  } else if (subStatus.isActive) {
    // Active subscription
    const statusText = subStatus.status === "trial" ? "Sinov" : "Premium";
    const welcomeMessage = `
🌿 *Barakali Vaqt* ga xush kelibsiz, ${firstName}!

💎 Obuna: *${statusText}*
⏰ Qolgan muddat: *${subStatus.daysLeft} kun*

Quyidagi tugmalardan birini tanlang:
    `;
    await ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard);
  } else {
    // Expired subscription
    const welcomeMessage = `
🌿 *Barakali Vaqt* ga xush kelibsiz, ${firstName}!

⚠️ Sizning obuna muddatingiz tugagan.

Barcha imkoniyatlardan foydalanish uchun obunani yangilang.
    `;
    await ctx.replyWithMarkdown(welcomeMessage, Markup.inlineKeyboard([
      [Markup.button.callback("💎 Obunani yangilash", "menu_subscription")],
      [Markup.button.callback("📋 Asosiy menyu", "back_main")],
    ]));
  }
});

bot.action("start_trial", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const success = await createTrialSubscription(telegramUserId);
  
  if (success) {
    await ctx.editMessageText(
      `🎉 *Tabriklaymiz!*\n\n` +
      `Sizga 3 kunlik bepul sinov muddati berildi!\n\n` +
      `✅ Barcha premium imkoniyatlar faollashtirildi.\n` +
      `⏰ Sinov muddati: 3 kun\n\n` +
      `Endi barcha funksiyalardan foydalanishingiz mumkin!`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📋 Asosiy menyu", "back_main")],
        ]),
      }
    );
  } else {
    await ctx.editMessageText(
      `⚠️ Siz allaqachon sinov muddatidan foydalangansiz.\n\n` +
      `Davom etish uchun obuna rejalaridan birini tanlang:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("💎 Obuna rejalarini ko'rish", "menu_subscription")],
          [Markup.button.callback("🔙 Orqaga", "back_main")],
        ]),
      }
    );
  }
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
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Rejalar");
    return;
  }
  
  await ctx.editMessageText("📋 *Rejalar va Vazifalar*\n\nNima qilmoqchisiz?", {
    parse_mode: "Markdown",
    ...tasksMenuKeyboard,
  });
});

bot.action("task_add", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Vazifa qo'shish");
    return;
  }
  
  userStates.set(numericId, { action: "add_task", step: "title" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📝 *Yangi vazifa*\n\nVazifa nomini yozing:\n\n_Eslatma uchun vaqt qo'shing:_\n_Masalan: Tushlikka chiqish 14:30_",
    { 
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", "menu_tasks")]])
    }
  );
});

bot.action(/^priority_(.+)$/, async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  
  const state = userStates.get(numericId);
  if (!state || state.action !== "add_task" || state.step !== "priority") return;
  
  const priority = ctx.match[1];
  const existingReminderTime = state.data?.reminderTime || null;
  
  await ctx.answerCbQuery();
  
  userStates.set(numericId, {
    action: "add_task",
    step: "saving",
    data: { ...state.data, priority },
  });
  
  await saveTaskWithReminder(ctx, numericId, existingReminderTime);
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
  const reminderTime = createUzbekistanDateTime(20, 0);
  await saveTaskWithReminder(ctx, numericId, reminderTime);
});

bot.action("reminder_tomorrow", async (ctx) => {
  const numericId = ctx.from?.id;
  if (!numericId) return;
  await ctx.answerCbQuery();
  const uzNow = getUzbekistanTime();
  const uzTomorrow = new Date(uzNow);
  uzTomorrow.setDate(uzTomorrow.getDate() + 1);
  uzTomorrow.setHours(9, 0, 0, 0);
  const reminderTime = uzTimeToUTC(uzTomorrow);
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

bot.action(/^reminder_done_(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    await storage.updateTask(taskId, { completed: true }, telegramUserId);
    await ctx.answerCbQuery("Vazifa bajarildi!");
    await ctx.editMessageText(
      "✅ *Bajarildi!*\n\nVazifa muvaffaqiyatli yakunlandi.",
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
});

bot.action(/^reminder_snooze_(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  try {
    const snoozeTime = new Date(Date.now() + 60 * 60 * 1000);
    await storage.updateTask(taskId, { 
      reminderTime: snoozeTime,
      reminderSent: false 
    }, telegramUserId);
    
    await ctx.answerCbQuery("1 soatdan keyin eslatiladi");
    await ctx.editMessageText(
      `⏰ *Keyinga qoldirildi*\n\n1 soatdan keyin yana eslatiladi.\n🕐 ${snoozeTime.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await ctx.answerCbQuery("Xatolik yuz berdi");
  }
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
  const subStatus = await checkSubscription(telegramUserId);
  
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Xarajatlar");
    return;
  }
  
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
  
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Xarajat qo'shish");
    return;
  }
  
  userStates.set(numericId, { action: "add_expense", step: "input" });
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "💰 *Yangi xarajat*\n\nNomi va summasini yozing:\n\n_Masalan: Svetga 100000_\n_yoki: Tushlik 50000_",
    { 
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("❌ Bekor", "menu_expenses")]])
    }
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

bot.action("expense_report", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📈 *Xarajatlar Hisoboti*\n\nQaysi davr uchun hisobot olishni xohlaysiz?",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📅 Kunlik", "report_daily")],
        [Markup.button.callback("📆 Haftalik", "report_weekly")],
        [Markup.button.callback("🗓 Oylik", "report_monthly")],
        [Markup.button.callback("📥 Yuklab olish", "report_download")],
        [Markup.button.callback("🔙 Orqaga", "menu_expenses")],
      ]),
    }
  );
});

function generateReportText(expenses: any[], period: string, startDate: Date, endDate: Date): string {
  const categoryTotals: Record<string, number> = {};
  let total = 0;
  
  for (const expense of expenses) {
    const cat = expense.category || "Boshqa";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + expense.amount;
    total += expense.amount;
  }
  
  let report = `📈 *${period} Hisoboti*\n`;
  report += `📅 ${startDate.toLocaleDateString("uz-UZ")} - ${endDate.toLocaleDateString("uz-UZ")}\n\n`;
  
  if (expenses.length === 0) {
    report += "Bu davr uchun xarajatlar yo'q.";
    return report;
  }
  
  report += `📊 *Kategoriyalar bo'yicha:*\n`;
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  
  for (const [cat, amount] of sortedCategories) {
    const percentage = Math.round((amount / total) * 100);
    report += `├ ${cat}: ${formatCurrency(amount)} (${percentage}%)\n`;
  }
  
  report += `\n💰 *Jami: ${formatCurrency(total)}*\n`;
  report += `📝 *Xarajatlar soni: ${expenses.length}*`;
  
  return report;
}

bot.action("report_daily", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  
  const allExpenses = await storage.getExpenses(telegramUserId);
  const dayExpenses = allExpenses.filter(e => {
    const d = new Date(e.createdAt);
    return d >= startOfDay && d < endOfDay;
  });
  
  const report = generateReportText(dayExpenses, "Kunlik", startOfDay, now);
  
  await ctx.editMessageText(report, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔙 Orqaga", "expense_report")],
    ]),
  });
});

bot.action("report_weekly", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  
  const allExpenses = await storage.getExpenses(telegramUserId);
  const weekExpenses = allExpenses.filter(e => new Date(e.createdAt) >= startOfWeek);
  
  const report = generateReportText(weekExpenses, "Haftalik", startOfWeek, now);
  
  await ctx.editMessageText(report, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔙 Orqaga", "expense_report")],
    ]),
  });
});

bot.action("report_monthly", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const allExpenses = await storage.getExpenses(telegramUserId);
  const monthExpenses = allExpenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  
  const report = generateReportText(monthExpenses, "Oylik", startOfMonth, now);
  
  await ctx.editMessageText(report, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔙 Orqaga", "expense_report")],
    ]),
  });
});

bot.action("report_download", async (ctx) => {
  await ctx.answerCbQuery("Hisobot tayyorlanmoqda...");
  const telegramUserId = getTelegramUserId(ctx);
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const allExpenses = await storage.getExpenses(telegramUserId);
  const monthExpenses = allExpenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  
  let fileContent = `XARAJATLAR HISOBOTI\n`;
  fileContent += `Davr: ${startOfMonth.toLocaleDateString("uz-UZ")} - ${now.toLocaleDateString("uz-UZ")}\n`;
  fileContent += `${"=".repeat(40)}\n\n`;
  
  const categoryTotals: Record<string, number> = {};
  let total = 0;
  
  fileContent += `BARCHA XARAJATLAR:\n`;
  fileContent += `${"-".repeat(40)}\n`;
  
  for (const expense of monthExpenses) {
    const date = new Date(expense.createdAt).toLocaleDateString("uz-UZ");
    fileContent += `${date} | ${expense.category || "Boshqa"} | ${expense.description} | ${formatCurrency(expense.amount)}\n`;
    
    const cat = expense.category || "Boshqa";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + expense.amount;
    total += expense.amount;
  }
  
  fileContent += `\n${"=".repeat(40)}\n`;
  fileContent += `KATEGORIYALAR BO'YICHA:\n`;
  fileContent += `${"-".repeat(40)}\n`;
  
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  for (const [cat, amount] of sortedCategories) {
    const percentage = Math.round((amount / total) * 100);
    fileContent += `${cat}: ${formatCurrency(amount)} (${percentage}%)\n`;
  }
  
  fileContent += `\n${"=".repeat(40)}\n`;
  fileContent += `JAMI: ${formatCurrency(total)}\n`;
  fileContent += `Xarajatlar soni: ${monthExpenses.length}\n`;
  
  const fileName = `hisobot_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}.txt`;
  
  await ctx.replyWithDocument({
    source: Buffer.from(fileContent, "utf-8"),
    filename: fileName,
  }, {
    caption: `📥 Oylik hisobot tayyor!\n\n💰 Jami: ${formatCurrency(total)}\n📝 Xarajatlar: ${monthExpenses.length} ta`,
  });
  
  await ctx.editMessageText(
    "📈 *Xarajatlar Hisoboti*\n\n✅ Hisobot yuklandi!",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Orqaga", "menu_expenses")],
      ]),
    }
  );
});

bot.action("menu_budget", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Byudjet");
    return;
  }
  
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
  const subStatus = await checkSubscription(telegramUserId);
  
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Maqsadlar");
    return;
  }
  
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
  
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Maqsad qo'shish");
    return;
  }
  
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

bot.action("menu_prayer", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Namoz vaqtlari");
    return;
  }
  
  const settings = await storage.getPrayerSettings(telegramUserId);
  const regionCode = settings?.regionCode || "namangan";
  const region = UZBEKISTAN_REGIONS[regionCode as RegionCode];
  const advanceMinutes = settings?.advanceMinutes || 10;
  
  await ctx.editMessageText(
    `🕌 *Ibodat*\n\n📍 Hudud: *${region?.name || "Namangan"}*\n🔔 Eslatma: *${advanceMinutes} min oldin*\n\nQuyidagi tugmalardan birini tanlang:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📅 Bugungi vaqtlar", "prayer_today")],
        [Markup.button.callback("🏙 Viloyatni tanlash", "prayer_regions")],
        [Markup.button.callback("📍 Joylashuvni yuborish", "prayer_location")],
        [Markup.button.callback("🔔 Eslatma sozlamalari", "prayer_settings")],
        [Markup.button.callback("🔙 Orqaga", "back_main")],
      ]),
    }
  );
});

bot.action("prayer_today", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const settings = await storage.getPrayerSettings(telegramUserId);
  const regionCode = settings?.regionCode || "namangan";
  const region = UZBEKISTAN_REGIONS[regionCode as RegionCode];
  const advanceMinutes = settings?.advanceMinutes || 10;
  
  let times;
  if (settings?.useCustomLocation && settings.latitude && settings.longitude) {
    times = await getPrayerTimesForLocation(
      parseFloat(settings.latitude),
      parseFloat(settings.longitude)
    );
  } else {
    times = await getPrayerTimesForRegion(regionCode);
  }
  
  if (!times) {
    await ctx.editMessageText(
      "❌ Namoz vaqtlarini olishda xatolik yuz berdi. Keyinroq urinib ko'ring.",
      { ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_prayer")]]) }
    );
    return;
  }
  
  const regionName = settings?.useCustomLocation ? "Sizning joylashuvingiz" : (region?.name || "Namangan");
  const message = formatPrayerTimesMessage(regionName, times, advanceMinutes);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_prayer")]]),
  });
});

bot.action("prayer_regions", async (ctx) => {
  await ctx.answerCbQuery();
  
  const regionButtons: any[] = [];
  const regionEntries = Object.entries(UZBEKISTAN_REGIONS);
  
  for (let i = 0; i < regionEntries.length; i += 2) {
    const row = [];
    const [code1, region1] = regionEntries[i];
    row.push(Markup.button.callback(region1.name, `select_region_${code1}`));
    
    if (regionEntries[i + 1]) {
      const [code2, region2] = regionEntries[i + 1];
      row.push(Markup.button.callback(region2.name, `select_region_${code2}`));
    }
    regionButtons.push(row);
  }
  regionButtons.push([Markup.button.callback("🔙 Orqaga", "menu_prayer")]);
  
  await ctx.editMessageText(
    "🏙 *Viloyatni tanlang:*\n\nNamoz vaqtlari tanlangan viloyatga qarab hisoblanadi.",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(regionButtons),
    }
  );
});

bot.action(/^select_region_(.+)$/, async (ctx) => {
  const regionCode = ctx.match[1];
  const telegramUserId = getTelegramUserId(ctx);
  const region = UZBEKISTAN_REGIONS[regionCode as RegionCode];
  
  if (!region) {
    await ctx.answerCbQuery("Viloyat topilmadi");
    return;
  }
  
  await storage.createOrUpdatePrayerSettings({
    telegramUserId,
    regionCode,
    useCustomLocation: false,
  });
  
  await ctx.answerCbQuery(`${region.name} tanlandi!`);
  
  const times = await getPrayerTimesForRegion(regionCode);
  if (!times) {
    await ctx.editMessageText(
      `✅ *${region.name}* tanlandi!\n\nLekin namoz vaqtlarini olishda xatolik yuz berdi.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_prayer")]]),
      }
    );
    return;
  }
  
  const message = formatPrayerTimesMessage(region.name, times, 10);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_prayer")]]),
  });
});

bot.action("prayer_location", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📍 *Joylashuvni yuborish*\n\nPastdagi tugmani bosib joylashuvingizni yuboring.\n\n_Joylashuv faqat namoz vaqtlarini aniqlash uchun ishlatiladi._",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Orqaga", "menu_prayer")],
      ]),
    }
  );
  
  await ctx.reply(
    "📍 Joylashuvingizni yuboring:",
    Markup.keyboard([
      [Markup.button.locationRequest("📍 Joylashuvni yuborish")]
    ]).resize().oneTime()
  );
});

bot.action("prayer_settings", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  
  const settings = await storage.getPrayerSettings(telegramUserId);
  
  const fajr = settings?.fajrEnabled ?? true;
  const dhuhr = settings?.dhuhrEnabled ?? true;
  const asr = settings?.asrEnabled ?? true;
  const maghrib = settings?.maghribEnabled ?? true;
  const isha = settings?.ishaEnabled ?? true;
  const advanceMinutes = settings?.advanceMinutes || 10;
  
  let message = "🔔 *Namoz eslatmalari*\n\n";
  message += `⏰ Eslatma vaqti: *${advanceMinutes} min oldin*\n\n`;
  message += "Qaysi namozlar eslatilsin?\n";
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(fajr ? "✅ Bomdod" : "❌ Bomdod", "toggle_prayer_fajr"),
        Markup.button.callback(dhuhr ? "✅ Peshin" : "❌ Peshin", "toggle_prayer_dhuhr"),
      ],
      [
        Markup.button.callback(asr ? "✅ Asr" : "❌ Asr", "toggle_prayer_asr"),
        Markup.button.callback(maghrib ? "✅ Shom" : "❌ Shom", "toggle_prayer_maghrib"),
      ],
      [Markup.button.callback(isha ? "✅ Xufton" : "❌ Xufton", "toggle_prayer_isha")],
      [
        Markup.button.callback("5 min", "advance_5"),
        Markup.button.callback("10 min", "advance_10"),
        Markup.button.callback("15 min", "advance_15"),
        Markup.button.callback("20 min", "advance_20"),
      ],
      [Markup.button.callback("🔙 Orqaga", "menu_prayer")],
    ]),
  });
});

bot.action(/^toggle_prayer_(.+)$/, async (ctx) => {
  const prayer = ctx.match[1];
  const telegramUserId = getTelegramUserId(ctx);
  
  const settings = await storage.getPrayerSettings(telegramUserId);
  const updates: Record<string, boolean> = {};
  
  switch (prayer) {
    case "fajr": updates.fajrEnabled = !(settings?.fajrEnabled ?? true); break;
    case "dhuhr": updates.dhuhrEnabled = !(settings?.dhuhrEnabled ?? true); break;
    case "asr": updates.asrEnabled = !(settings?.asrEnabled ?? true); break;
    case "maghrib": updates.maghribEnabled = !(settings?.maghribEnabled ?? true); break;
    case "isha": updates.ishaEnabled = !(settings?.ishaEnabled ?? true); break;
  }
  
  await storage.createOrUpdatePrayerSettings({
    telegramUserId,
    ...updates,
  });
  
  await ctx.answerCbQuery("Saqlandi!");
  
  const newSettings = await storage.getPrayerSettings(telegramUserId);
  const fajr = newSettings?.fajrEnabled ?? true;
  const dhuhr = newSettings?.dhuhrEnabled ?? true;
  const asr = newSettings?.asrEnabled ?? true;
  const maghrib = newSettings?.maghribEnabled ?? true;
  const isha = newSettings?.ishaEnabled ?? true;
  const advanceMinutes = newSettings?.advanceMinutes || 10;
  
  let message = "🔔 *Namoz eslatmalari*\n\n";
  message += `⏰ Eslatma vaqti: *${advanceMinutes} min oldin*\n\n`;
  message += "Qaysi namozlar eslatilsin?\n";
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(fajr ? "✅ Bomdod" : "❌ Bomdod", "toggle_prayer_fajr"),
        Markup.button.callback(dhuhr ? "✅ Peshin" : "❌ Peshin", "toggle_prayer_dhuhr"),
      ],
      [
        Markup.button.callback(asr ? "✅ Asr" : "❌ Asr", "toggle_prayer_asr"),
        Markup.button.callback(maghrib ? "✅ Shom" : "❌ Shom", "toggle_prayer_maghrib"),
      ],
      [Markup.button.callback(isha ? "✅ Xufton" : "❌ Xufton", "toggle_prayer_isha")],
      [
        Markup.button.callback("5 min", "advance_5"),
        Markup.button.callback("10 min", "advance_10"),
        Markup.button.callback("15 min", "advance_15"),
        Markup.button.callback("20 min", "advance_20"),
      ],
      [Markup.button.callback("🔙 Orqaga", "menu_prayer")],
    ]),
  });
});

bot.action(/^advance_(\d+)$/, async (ctx) => {
  const minutes = parseInt(ctx.match[1]);
  const telegramUserId = getTelegramUserId(ctx);
  
  await storage.createOrUpdatePrayerSettings({
    telegramUserId,
    advanceMinutes: minutes,
  });
  
  await ctx.answerCbQuery(`${minutes} min oldin eslatiladi`);
  
  const settings = await storage.getPrayerSettings(telegramUserId);
  const fajr = settings?.fajrEnabled ?? true;
  const dhuhr = settings?.dhuhrEnabled ?? true;
  const asr = settings?.asrEnabled ?? true;
  const maghrib = settings?.maghribEnabled ?? true;
  const isha = settings?.ishaEnabled ?? true;
  
  let message = "🔔 *Namoz eslatmalari*\n\n";
  message += `⏰ Eslatma vaqti: *${minutes} min oldin*\n\n`;
  message += "Qaysi namozlar eslatilsin?\n";
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(fajr ? "✅ Bomdod" : "❌ Bomdod", "toggle_prayer_fajr"),
        Markup.button.callback(dhuhr ? "✅ Peshin" : "❌ Peshin", "toggle_prayer_dhuhr"),
      ],
      [
        Markup.button.callback(asr ? "✅ Asr" : "❌ Asr", "toggle_prayer_asr"),
        Markup.button.callback(maghrib ? "✅ Shom" : "❌ Shom", "toggle_prayer_maghrib"),
      ],
      [Markup.button.callback(isha ? "✅ Xufton" : "❌ Xufton", "toggle_prayer_isha")],
      [
        Markup.button.callback("5 min", "advance_5"),
        Markup.button.callback("10 min", "advance_10"),
        Markup.button.callback("15 min", "advance_15"),
        Markup.button.callback("20 min", "advance_20"),
      ],
      [Markup.button.callback("🔙 Orqaga", "menu_prayer")],
    ]),
  });
});

bot.on("location", async (ctx) => {
  const telegramUserId = getTelegramUserId(ctx);
  const { latitude, longitude } = ctx.message.location;
  
  await storage.createOrUpdatePrayerSettings({
    telegramUserId,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    useCustomLocation: true,
  });
  
  const times = await getPrayerTimesForLocation(latitude, longitude);
  if (!times) {
    await ctx.reply(
      "❌ Namoz vaqtlarini olishda xatolik yuz berdi.",
      Markup.removeKeyboard()
    );
    return;
  }
  
  const message = formatPrayerTimesMessage("Sizning joylashuvingiz", times, 10);
  
  await ctx.reply(message, {
    parse_mode: "Markdown",
    ...Markup.removeKeyboard(),
  });
  
  await ctx.reply("Asosiy menyu:", mainMenuKeyboard);
});

bot.action("menu_stats", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  
  if (!subStatus.isActive) {
    await showSubscriptionRequired(ctx, "Statistika");
    return;
  }
  
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

// Subscription Menu
bot.action("menu_subscription", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const subStatus = await checkSubscription(telegramUserId);
  
  let message = `💎 *Obuna*\n\n`;
  
  if (subStatus.isActive) {
    const statusText = subStatus.status === "trial" ? "🎁 Sinov" : "✨ Premium";
    message += `Joriy obuna: *${statusText}*\n`;
    message += `Qolgan muddat: *${subStatus.daysLeft} kun*\n\n`;
  } else if (subStatus.status === "expired") {
    message += `⚠️ Obuna muddati tugagan\n\n`;
  } else {
    message += `📌 Hozirda faol obuna yo'q\n\n`;
  }
  
  message += `📋 *Tariflar:*\n\n`;
  message += `1️⃣ *1 oylik* - ${formatCurrency(SUBSCRIPTION_PLANS.monthly_1.price)}\n`;
  message += `2️⃣ *2 oylik* - ${formatCurrency(SUBSCRIPTION_PLANS.monthly_2.price)} _(Tejamkor!)_\n`;
  message += `3️⃣ *3 oylik* - ${formatCurrency(SUBSCRIPTION_PLANS.monthly_3.price)} _(Eng foydali!)_\n\n`;
  message += `💳 To'lov: O'zbek milliy kartalari (Uzcard, Humo)`;
  
  const buttons = [];
  
  if (!subStatus.isActive && subStatus.status === "none") {
    const subscription = await storage.getSubscription(telegramUserId);
    if (!subscription?.trialUsed) {
      buttons.push([Markup.button.callback("🎁 3 kunlik bepul sinov", "start_trial")]);
    }
  }
  
  buttons.push(
    [Markup.button.callback(`1 oylik - ${formatCurrency(SUBSCRIPTION_PLANS.monthly_1.price)}`, "subscribe_1")],
    [Markup.button.callback(`2 oylik - ${formatCurrency(SUBSCRIPTION_PLANS.monthly_2.price)}`, "subscribe_2")],
    [Markup.button.callback(`3 oylik - ${formatCurrency(SUBSCRIPTION_PLANS.monthly_3.price)}`, "subscribe_3")],
    [Markup.button.callback("🔙 Orqaga", "back_main")]
  );
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
  });
});

// Plan selection handlers
bot.action(/^subscribe_(\d)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const planNum = ctx.match[1];
  const telegramUserId = getTelegramUserId(ctx);
  
  const planKey = `monthly_${planNum}` as keyof typeof SUBSCRIPTION_PLANS;
  const plan = SUBSCRIPTION_PLANS[planKey];
  
  if (!plan) {
    await ctx.editMessageText("Xato yuz berdi. Qaytadan urinib ko'ring.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_subscription")]]),
    });
    return;
  }
  
  userStates.set(ctx.from!.id, {
    action: "payment",
    step: "plan_selected",
    data: { planKey, planName: plan.name, planPrice: plan.price, planDays: plan.days },
  });
  
  const cardNumber = await storage.getAdminSetting("payment_card") || "8600 1234 5678 9012";
  const cardHolder = await storage.getAdminSetting("payment_card_holder") || "BARAKALI VAQT";
  
  const message = `💳 *To'lov ma'lumotlari*\n\n` +
    `📦 Tanlangan tarif: *${plan.name}*\n` +
    `💵 Narxi: *${formatCurrency(plan.price)}*\n\n` +
    `➡️ To'lovni quyidagi kartaga amalga oshiring:\n\n` +
    `📇 *Karta raqami:*\n\`${cardNumber}\`\n\n` +
    `👤 *Karta egasi:*\n${cardHolder}\n\n` +
    `📝 To'lovdan so'ng, quyidagi ma'lumotlarni yuboring:\n` +
    `1. To'liq ismingiz\n` +
    `2. Telefon raqamingiz\n` +
    `3. To'lov cheki rasmi\n\n` +
    `Davom etish uchun tugmani bosing:`;
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("📝 Ma'lumotlarni yuborish", "payment_start_form")],
      [Markup.button.callback("❌ Bekor qilish", "menu_subscription")],
    ]),
  });
});

// Payment form flow
bot.action("payment_start_form", async (ctx) => {
  await ctx.answerCbQuery();
  const state = userStates.get(ctx.from!.id);
  
  if (!state || state.action !== "payment") {
    await ctx.editMessageText("Xato yuz berdi. Qaytadan urinib ko'ring.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_subscription")]]),
    });
    return;
  }
  
  userStates.set(ctx.from!.id, { ...state, step: "awaiting_name" });
  
  await ctx.editMessageText(
    `📝 *To'lov formasi (1/3)*\n\n` +
    `To'liq ismingizni kiriting:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Bekor qilish", "cancel_payment")],
      ]),
    }
  );
});

bot.action("cancel_payment", async (ctx) => {
  await ctx.answerCbQuery();
  userStates.delete(ctx.from!.id);
  await ctx.editMessageText("To'lov bekor qilindi.", {
    ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Orqaga", "menu_subscription")]]),
  });
});

// Handle text messages for payment form
bot.on("text", async (ctx, next) => {
  const state = userStates.get(ctx.from!.id);
  
  if (!state || state.action !== "payment") {
    return next();
  }
  
  const text = ctx.message.text.trim();
  
  if (state.step === "awaiting_name") {
    if (text.length < 3) {
      await ctx.reply("Iltimos, to'liq ismingizni kiriting (kamida 3 ta harf).");
      return;
    }
    
    userStates.set(ctx.from!.id, {
      ...state,
      step: "awaiting_phone",
      data: { ...state.data, fullName: text },
    });
    
    await ctx.reply(
      `📝 *To'lov formasi (2/3)*\n\n` +
      `✅ Ism: ${text}\n\n` +
      `Telefon raqamingizni kiriting:\n` +
      `_(Masalan: +998901234567)_`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_payment")],
        ]),
      }
    );
    return;
  }
  
  if (state.step === "awaiting_phone") {
    const phoneRegex = /^\+?998\d{9}$/;
    const cleanPhone = text.replace(/[\s\-()]/g, "");
    
    if (!phoneRegex.test(cleanPhone)) {
      await ctx.reply("Iltimos, to'g'ri O'zbekiston telefon raqamini kiriting.\n_(Masalan: +998901234567)_", {
        parse_mode: "Markdown",
      });
      return;
    }
    
    userStates.set(ctx.from!.id, {
      ...state,
      step: "awaiting_receipt",
      data: { ...state.data, phone: cleanPhone },
    });
    
    await ctx.reply(
      `📝 *To'lov formasi (3/3)*\n\n` +
      `✅ Ism: ${state.data?.fullName}\n` +
      `✅ Telefon: ${cleanPhone}\n\n` +
      `📸 Endi to'lov cheki rasmini yuboring:`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_payment")],
        ]),
      }
    );
    return;
  }
  
  return next();
});

// Handle receipt photo
bot.on("photo", async (ctx, next) => {
  const state = userStates.get(ctx.from!.id);
  
  if (!state || state.action !== "payment" || state.step !== "awaiting_receipt") {
    return next();
  }
  
  const telegramUserId = getTelegramUserId(ctx);
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileId = photo.file_id;
  
  const paymentRequest = await storage.createPaymentRequest({
    telegramUserId,
    planType: state.data?.planKey,
    amount: state.data?.planPrice,
    fullName: state.data?.fullName || "",
    phoneNumber: state.data?.phone || "",
    receiptPhotoId: fileId,
    status: "pending",
  });
  
  userStates.delete(ctx.from!.id);
  
  await ctx.reply(
    `✅ *To'lov so'rovi yuborildi!*\n\n` +
    `📦 Tarif: ${state.data?.planName}\n` +
    `💵 Summa: ${formatCurrency(state.data?.planPrice)}\n` +
    `👤 Ism: ${state.data?.fullName}\n` +
    `📞 Telefon: ${state.data?.phone}\n\n` +
    `⏳ So'rovingiz tekshirilmoqda.\n` +
    `Tasdiqlangandan so'ng sizga xabar yuboriladi.\n\n` +
    `So'rov raqami: #${paymentRequest.id}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📋 Asosiy menyu", "back_main")],
      ]),
    }
  );
  
  // Notify admins
  await notifyAdminsAboutPayment(ctx, paymentRequest, fileId);
});

async function notifyAdminsAboutPayment(ctx: Context, request: any, photoFileId: string) {
  const admins = await storage.getAdminUsers();
  const user = await storage.getBotUser(request.telegramUserId);
  
  console.log(`Payment notification: Found ${admins.length} admins`);
  if (admins.length === 0) {
    console.warn("WARNING: No admin users found in database! Payment request #" + request.id + " will not be notified.");
  }
  
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  const username = user?.username || "yo'q";
  const fullName = request.fullName || "";
  
  const message = `🔔 <b>Yangi to'lov so'rovi!</b>\n\n` +
    `📝 So'rov: #${request.id}\n` +
    `👤 Ism: ${fullName || firstName + " " + lastName}\n` +
    `🆔 Username: @${username}\n` +
    `📞 Telefon: ${request.phoneNumber || "kiritilmagan"}\n` +
    `📦 Tarif: ${request.planType}\n` +
    `💵 Summa: ${formatCurrency(request.amount)}\n` +
    `🆔 Telegram ID: ${request.telegramUserId}\n` +
    `⏰ Vaqt: ${new Date().toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })}`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Tasdiqlash", `approve_payment_${request.id}`)],
    [Markup.button.callback("❌ Rad etish", `reject_payment_${request.id}`)],
  ]);
  
  // Send to admin group if configured
  if (ADMIN_GROUP_ID) {
    try {
      await ctx.telegram.sendPhoto(ADMIN_GROUP_ID, photoFileId, {
        caption: message,
        parse_mode: "HTML",
        ...keyboard,
      });
    } catch (error) {
      console.error("Failed to send to admin group:", error);
    }
  }
  
  // Also send to individual admins
  for (const admin of admins) {
    try {
      await ctx.telegram.sendPhoto(admin.telegramUserId, photoFileId, {
        caption: message,
        parse_mode: "HTML",
        ...keyboard,
      });
    } catch (error) {
      console.error(`Failed to send to admin ${admin.telegramUserId}:`, error);
    }
  }
}

// Admin payment approval
bot.action(/^approve_payment_(\d+)$/, async (ctx) => {
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda ruxsat yo'q", { show_alert: true });
    return;
  }
  
  await ctx.answerCbQuery("Tasdiqlanmoqda...");
  
  const paymentId = parseInt(ctx.match[1]);
  const request = await storage.getPaymentRequest(paymentId);
  
  if (!request) {
    await ctx.editMessageCaption("To'lov so'rovi topilmadi.");
    return;
  }
  
  if (request.status !== "pending") {
    await ctx.editMessageCaption(`Bu so'rov allaqachon ko'rib chiqilgan.\nHolat: ${request.status}`);
    return;
  }
  
  // Update payment request
  await storage.updatePaymentRequest(paymentId, {
    status: "approved",
    processedBy: telegramUserId,
    processedAt: new Date(),
  });
  
  // Create/extend subscription
  const plan = SUBSCRIPTION_PLANS[request.planType as keyof typeof SUBSCRIPTION_PLANS] || SUBSCRIPTION_PLANS.monthly_1;
  const existingSub = await storage.getSubscription(request.telegramUserId);
  
  const startDate = existingSub?.endDate && new Date(existingSub.endDate) > new Date() 
    ? new Date(existingSub.endDate) 
    : new Date();
  const endDate = new Date(startDate.getTime() + plan.days * 24 * 60 * 60 * 1000);
  
  if (existingSub) {
    await storage.updateSubscription(request.telegramUserId, {
      status: "active",
      planType: request.planType,
      startDate: existingSub?.endDate && new Date(existingSub.endDate) > new Date() ? existingSub.endDate : new Date(),
      endDate,
    });
  } else {
    await storage.createSubscription({
      telegramUserId: request.telegramUserId,
      status: "active",
      planType: request.planType,
      startDate: new Date(),
      endDate,
      trialUsed: true,
    });
  }
  
  // Invalidate subscription cache after activation
  invalidateSubscriptionCache(request.telegramUserId);
  
  // Notify user
  try {
    await ctx.telegram.sendMessage(
      request.telegramUserId,
      `🎉 *Tabriklaymiz!*\n\n` +
      `Sizning to'lovingiz tasdiqlandi!\n\n` +
      `📦 Tarif: *${plan.name}*\n` +
      `⏰ Muddat: *${plan.days} kun*\n` +
      `📅 Tugash sanasi: *${endDate.toLocaleDateString("uz-UZ")}*\n\n` +
      `Xizmatlarimizdan foydalanganingiz uchun rahmat! 🌿`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📋 Asosiy menyu", "back_main")],
        ]),
      }
    );
  } catch (error) {
    console.error("Failed to notify user:", error);
  }
  
  await ctx.editMessageCaption(
    (ctx.callbackQuery.message as any)?.caption + `\n\n✅ *TASDIQLANGAN*\nAdmin: ${admin.firstName || telegramUserId}`,
    { parse_mode: "Markdown" }
  );
});

bot.action(/^reject_payment_(\d+)$/, async (ctx) => {
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda ruxsat yo'q", { show_alert: true });
    return;
  }
  
  await ctx.answerCbQuery("Rad etilmoqda...");
  
  const paymentId = parseInt(ctx.match[1]);
  const request = await storage.getPaymentRequest(paymentId);
  
  if (!request) {
    await ctx.editMessageCaption("To'lov so'rovi topilmadi.");
    return;
  }
  
  if (request.status !== "pending") {
    await ctx.editMessageCaption(`Bu so'rov allaqachon ko'rib chiqilgan.\nHolat: ${request.status}`);
    return;
  }
  
  // Ask for rejection reason
  userStates.set(ctx.from!.id, {
    action: "reject_payment",
    step: "awaiting_reason",
    data: { paymentId, telegramUserId: request.telegramUserId },
  });
  
  await ctx.editMessageCaption(
    (ctx.callbackQuery.message as any)?.caption + "\n\n❓ Rad etish sababini kiriting:",
    { parse_mode: "Markdown" }
  );
});

// Handle rejection reason
bot.on("text", async (ctx, next) => {
  const state = userStates.get(ctx.from!.id);
  
  if (!state || state.action !== "reject_payment") {
    return next();
  }
  
  const reason = ctx.message.text.trim();
  const admin = await storage.getBotUser(getTelegramUserId(ctx));
  
  await storage.updatePaymentRequest(state.data?.paymentId, {
    status: "rejected",
    adminNote: reason,
    processedBy: getTelegramUserId(ctx),
    processedAt: new Date(),
  });
  
  // Notify user
  try {
    await ctx.telegram.sendMessage(
      state.data?.telegramUserId,
      `❌ *To'lov rad etildi*\n\n` +
      `So'rov: #${state.data?.paymentId}\n` +
      `Sabab: ${reason}\n\n` +
      `Agar savollaringiz bo'lsa, admin bilan bog'laning.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("💎 Qaytadan to'lash", "menu_subscription")],
          [Markup.button.callback("📋 Asosiy menyu", "back_main")],
        ]),
      }
    );
  } catch (error) {
    console.error("Failed to notify user:", error);
  }
  
  userStates.delete(ctx.from!.id);
  
  await ctx.reply(
    `✅ To'lov #${state.data?.paymentId} rad etildi.\n` +
    `Foydalanuvchiga xabar yuborildi.`,
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📋 Asosiy menyu", "back_main")],
      ]),
    }
  );
  
  return;
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
  
  const user = await storage.getBotUser(telegramUserId);
  
  let message = "⚙️ *Sozlamalar*\n\n";
  message += `📅 *Kunlik hisobot:*\n`;
  message += `├ Holat: ${settings.dailyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Vaqt: ${settings.dailyReportTime}\n\n`;
  message += `📊 *Haftalik hisobot:*\n`;
  message += `├ Holat: ${settings.weeklyReportEnabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;
  message += `└ Kun: ${settings.weeklyReportDay === "sunday" ? "Yakshanba" : "Shanba"}\n`;
  
  const buttons = [
    [Markup.button.callback(settings.dailyReportEnabled ? "🔕 Kunlik o'chirish" : "🔔 Kunlik yoqish", "toggle_daily")],
    [Markup.button.callback(settings.weeklyReportEnabled ? "🔕 Haftalik o'chirish" : "🔔 Haftalik yoqish", "toggle_weekly")],
  ];
  
  if (user?.isAdmin) {
    buttons.push([Markup.button.callback("👑 Admin panel", "admin_panel")]);
  }
  
  buttons.push([Markup.button.callback("🔙 Orqaga", "back_main")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(buttons),
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
      const timeMatch = text.match(/(\d{1,2}):(\d{2})$/);
      let title = text;
      let reminderTime: Date | null = null;
      
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          title = text.replace(/\s*\d{1,2}:\d{2}$/, "").trim();
          reminderTime = createUzbekistanDateTime(hours, minutes);
        }
      }
      
      userStates.set(numericId, {
        action: "add_task",
        step: "priority",
        data: { title, reminderTime },
      });
      
      let msg = `📝 *${title}*\n`;
      if (reminderTime) {
        msg += `🔔 Eslatma: ${formatReminderTime(reminderTime)}\n`;
      }
      msg += `\nMuhimlik darajasini tanlang:`;
      
      await ctx.reply(msg, { parse_mode: "Markdown", ...priorityKeyboard });
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
      
      const reminderTime = createUzbekistanDateTime(hours, minutes);
      
      await saveTaskWithReminder(ctx, numericId, reminderTime);
    }
  }
  
  if (state.action === "add_expense") {
    if (state.step === "input") {
      const parts = text.trim().split(/\s+/);
      const lastPart = parts[parts.length - 1];
      const amount = parseInt(lastPart.replace(/\s/g, ""));
      
      if (parts.length < 2 || isNaN(amount) || amount <= 0) {
        await ctx.reply(
          "❌ Noto'g'ri format.\n\nNomi va summasini yozing:\n_Masalan: Svetga 100000_",
          { parse_mode: "Markdown" }
        );
        return;
      }
      
      const description = parts.slice(0, -1).join(" ");
      
      const categories = await storage.getExpenseCategories(telegramUserId);
      const catNames = categories.length > 0 
        ? categories.map(c => c.name) 
        : defaultCategories;
      
      userStates.set(numericId, {
        action: "add_expense",
        step: "category",
        data: { amount, description },
      });
      
      await ctx.reply(
        `💰 *${formatCurrency(amount)}* - ${description}\n\nKategoriyani tanlang:`,
        { parse_mode: "Markdown", ...getCategoryKeyboard(catNames) }
      );
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

// Admin Panel
bot.command("admin", async (ctx) => {
  const telegramUserId = getTelegramUserId(ctx);
  const user = await storage.getBotUser(telegramUserId);
  
  if (!user?.isAdmin) {
    await ctx.reply("Sizda admin huquqlari yo'q.");
    return;
  }
  
  await showAdminPanel(ctx);
});

bot.action("admin_panel", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const user = await storage.getBotUser(telegramUserId);
  
  if (!user?.isAdmin) {
    await ctx.answerCbQuery("Sizda admin huquqlari yo'q", { show_alert: true });
    return;
  }
  
  await showAdminPanel(ctx, true);
});

async function showAdminPanel(ctx: Context, edit: boolean = false) {
  const users = await storage.getAllBotUsers();
  const activeSubscriptions = await storage.getActiveSubscriptions();
  const pendingPayments = await storage.getPendingPaymentRequests();
  
  const trialUsers = activeSubscriptions.filter(s => s.status === "trial").length;
  const paidUsers = activeSubscriptions.filter(s => s.status === "active").length;
  
  const message = `👑 *Admin Panel*\n\n` +
    `📊 *Statistika:*\n` +
    `├ Jami foydalanuvchilar: ${users.length}\n` +
    `├ Faol obunalar: ${activeSubscriptions.length}\n` +
    `├ Sinov muddatida: ${trialUsers}\n` +
    `├ To'lov qilganlar: ${paidUsers}\n` +
    `└ Kutilayotgan to'lovlar: ${pendingPayments.length}\n`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("📋 Foydalanuvchilar ro'yxati", "admin_users")],
    [Markup.button.callback("💰 To'lov so'rovlari", "admin_payments")],
    [Markup.button.callback("📊 Obunalar hisoboti", "admin_subscriptions")],
    [Markup.button.callback("📢 Broadcast yuborish", "admin_broadcast")],
    [Markup.button.callback("⚙️ Sozlamalar", "admin_settings")],
    [Markup.button.callback("🔙 Orqaga", "back_main")],
  ]);
  
  if (edit) {
    await ctx.editMessageText(message, { parse_mode: "Markdown", ...keyboard });
  } else {
    await ctx.reply(message, { parse_mode: "Markdown", ...keyboard });
  }
}

bot.action("admin_users", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda admin huquqlari yo'q", { show_alert: true });
    return;
  }
  
  const users = await storage.getAllBotUsers();
  const subscriptions = await storage.getActiveSubscriptions();
  
  const subMap = new Map(subscriptions.map(s => [s.telegramUserId, s]));
  
  let message = `👥 *Foydalanuvchilar* (${users.length} ta)\n\n`;
  
  const recentUsers = users.slice(0, 10);
  for (const user of recentUsers) {
    const sub = subMap.get(user.telegramUserId);
    let status = "⚪ Obunasiz";
    if (sub) {
      if (sub.status === "trial") status = "🎁 Sinov";
      else if (sub.status === "active") status = "✅ Premium";
    }
    
    message += `${user.firstName || "?"} ${user.lastName || ""} (@${user.username || "noname"})\n`;
    message += `├ ID: \`${user.telegramUserId}\`\n`;
    message += `└ ${status}\n\n`;
  }
  
  if (users.length > 10) {
    message += `_...va yana ${users.length - 10} ta foydalanuvchi_`;
  }
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔙 Admin panel", "admin_panel")],
    ]),
  });
});

bot.action("admin_payments", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda admin huquqlari yo'q", { show_alert: true });
    return;
  }
  
  const payments = await storage.getPendingPaymentRequests();
  
  if (payments.length === 0) {
    await ctx.editMessageText("✅ Kutilayotgan to'lov so'rovlari yo'q.", {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Admin panel", "admin_panel")],
      ]),
    });
    return;
  }
  
  let message = `💰 *Kutilayotgan to'lovlar* (${payments.length} ta)\n\n`;
  message += `Har bir to'lovni alohida ko'rish uchun tugmani bosing:\n\n`;
  
  for (const payment of payments) {
    const user = await storage.getBotUser(payment.telegramUserId);
    const date = new Date(payment.createdAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
    message += `📄 *#${payment.id}* - ${payment.fullName || user?.firstName || "?"}\n`;
    message += `├ 📦 Tarif: ${payment.planType}\n`;
    message += `├ 💵 Summa: ${formatCurrency(payment.amount)}\n`;
    message += `├ 📞 Tel: ${payment.phoneNumber || "kiritilmagan"}\n`;
    message += `├ 🆔 ID: \`${payment.telegramUserId}\`\n`;
    message += `└ 📅 Sana: ${date}\n\n`;
  }
  
  // Create view buttons for each payment (to see receipt photo)
  const viewButtons = payments.slice(0, 5).map(p => [
    Markup.button.callback(`📷 #${p.id} chekni ko'rish`, `view_receipt_${p.id}`),
  ]);
  
  const actionButtons = payments.slice(0, 5).map(p => [
    Markup.button.callback(`✅ #${p.id}`, `approve_payment_${p.id}`),
    Markup.button.callback(`❌ #${p.id}`, `reject_payment_${p.id}`),
  ]);
  
  const allButtons = [...viewButtons, ...actionButtons];
  allButtons.push([Markup.button.callback("🔙 Admin panel", "admin_panel")]);
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(allButtons),
  });
});

// View receipt photo
bot.action(/^view_receipt_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda ruxsat yo'q", { show_alert: true });
    return;
  }
  
  const paymentId = parseInt(ctx.match[1]);
  const payment = await storage.getPaymentRequest(paymentId);
  
  if (!payment) {
    await ctx.answerCbQuery("To'lov topilmadi", { show_alert: true });
    return;
  }
  
  const user = await storage.getBotUser(payment.telegramUserId);
  const date = new Date(payment.createdAt).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
  
  const caption = `📄 <b>To'lov so'rovi #${payment.id}</b>\n\n` +
    `👤 Ism: ${payment.fullName || "?"}\n` +
    `📞 Telefon: ${payment.phoneNumber || "kiritilmagan"}\n` +
    `🆔 Telegram ID: ${payment.telegramUserId}\n` +
    `👤 Username: @${user?.username || "yo'q"}\n` +
    `📦 Tarif: ${payment.planType}\n` +
    `💵 Summa: ${formatCurrency(payment.amount)}\n` +
    `📅 Sana: ${date}\n` +
    `📊 Holat: ${payment.status}`;
  
  try {
    await ctx.telegram.sendPhoto(telegramUserId, payment.receiptPhotoId, {
      caption,
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Tasdiqlash", `approve_payment_${payment.id}`)],
        [Markup.button.callback("❌ Rad etish", `reject_payment_${payment.id}`)],
        [Markup.button.callback("🔙 To'lovlar ro'yxati", "admin_payments")],
      ]),
    });
  } catch (error) {
    console.error("Failed to send receipt photo:", error);
    await ctx.reply("Chek rasmini yuborishda xatolik yuz berdi.");
  }
});

bot.action("admin_subscriptions", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda admin huquqlari yo'q", { show_alert: true });
    return;
  }
  
  const subscriptions = await storage.getActiveSubscriptions();
  const expiringIn3Days = await storage.getExpiringSubscriptions(3);
  
  let message = `📊 *Obunalar hisoboti*\n\n`;
  message += `Jami faol: ${subscriptions.length}\n`;
  message += `3 kun ichida tugaydiganlar: ${expiringIn3Days.length}\n\n`;
  
  const trialCount = subscriptions.filter(s => s.status === "trial").length;
  const paidCount = subscriptions.filter(s => s.status === "active").length;
  
  message += `📈 *Taqsimlanish:*\n`;
  message += `├ 🎁 Sinov: ${trialCount}\n`;
  message += `└ ✅ Premium: ${paidCount}\n\n`;
  
  if (expiringIn3Days.length > 0) {
    message += `⚠️ *Tez tugayadiganlar:*\n`;
    for (const sub of expiringIn3Days.slice(0, 5)) {
      const user = await storage.getBotUser(sub.telegramUserId);
      const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      message += `• ${user?.firstName || "?"} - ${daysLeft} kun qoldi\n`;
    }
  }
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("🔙 Admin panel", "admin_panel")],
    ]),
  });
});

bot.action("admin_broadcast", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda admin huquqlari yo'q", { show_alert: true });
    return;
  }
  
  userStates.set(ctx.from!.id, {
    action: "admin_broadcast",
    step: "message",
    data: {},
  });
  
  await ctx.editMessageText(
    `📢 *Broadcast yuborish*\n\n` +
    `Barcha foydalanuvchilarga yuboriladigan xabarni yozing:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Bekor qilish", "cancel_broadcast")],
      ]),
    }
  );
});

bot.action("cancel_broadcast", async (ctx) => {
  await ctx.answerCbQuery();
  userStates.delete(ctx.from!.id);
  await showAdminPanel(ctx, true);
});

bot.on("text", async (ctx, next) => {
  const state = userStates.get(ctx.from!.id);
  
  if (!state || state.action !== "admin_broadcast") {
    return next();
  }
  
  const admin = await storage.getBotUser(getTelegramUserId(ctx));
  if (!admin?.isAdmin) {
    userStates.delete(ctx.from!.id);
    return next();
  }
  
  const message = ctx.message.text.trim();
  
  userStates.set(ctx.from!.id, {
    action: "admin_broadcast",
    step: "confirm",
    data: { message },
  });
  
  await ctx.reply(
    `📢 *Xabar tasdiqlanishi*\n\n` +
    `Quyidagi xabar barcha foydalanuvchilarga yuboriladi:\n\n` +
    `---\n${message}\n---\n\n` +
    `Davom etasizmi?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Yuborish", "confirm_broadcast")],
        [Markup.button.callback("❌ Bekor qilish", "cancel_broadcast")],
      ]),
    }
  );
  
  return;
});

bot.action("confirm_broadcast", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda admin huquqlari yo'q", { show_alert: true });
    return;
  }
  
  const state = userStates.get(ctx.from!.id);
  if (!state || state.action !== "admin_broadcast" || !state.data?.message) {
    await ctx.editMessageText("Xato yuz berdi. Qaytadan urinib ko'ring.", {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Admin panel", "admin_panel")]]),
    });
    return;
  }
  
  userStates.delete(ctx.from!.id);
  
  await ctx.editMessageText("📤 Xabarlar yuborilmoqda...", { parse_mode: "Markdown" });
  
  const users = await storage.getAllBotUsers();
  let successCount = 0;
  let failCount = 0;
  
  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(
        user.telegramUserId,
        `📢 *Yangilik*\n\n${state.data.message}`,
        { parse_mode: "Markdown" }
      );
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      failCount++;
    }
  }
  
  await ctx.editMessageText(
    `✅ *Broadcast yuborildi!*\n\n` +
    `├ Muvaffaqiyatli: ${successCount}\n` +
    `└ Xatolik: ${failCount}`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Admin panel", "admin_panel")]]),
    }
  );
});

bot.action("admin_settings", async (ctx) => {
  await ctx.answerCbQuery();
  const telegramUserId = getTelegramUserId(ctx);
  const admin = await storage.getBotUser(telegramUserId);
  
  if (!admin?.isAdmin) {
    await ctx.answerCbQuery("Sizda admin huquqlari yo'q", { show_alert: true });
    return;
  }
  
  const cardNumber = await storage.getAdminSetting("payment_card") || "O'rnatilmagan";
  const cardHolder = await storage.getAdminSetting("payment_card_holder") || "O'rnatilmagan";
  
  const message = `⚙️ *Admin sozlamalari*\n\n` +
    `💳 *To'lov kartasi:*\n` +
    `├ Raqam: \`${cardNumber}\`\n` +
    `└ Egasi: ${cardHolder}\n\n` +
    `Sozlamalarni o'zgartirish uchun tugmalarni bosing:`;
  
  await ctx.editMessageText(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("💳 Karta raqamini o'zgartirish", "set_payment_card")],
      [Markup.button.callback("👤 Karta egasini o'zgartirish", "set_card_holder")],
      [Markup.button.callback("👑 Admin qo'shish", "add_admin")],
      [Markup.button.callback("🔙 Admin panel", "admin_panel")],
    ]),
  });
});

bot.action("set_payment_card", async (ctx) => {
  await ctx.answerCbQuery();
  const admin = await storage.getBotUser(getTelegramUserId(ctx));
  if (!admin?.isAdmin) return;
  
  userStates.set(ctx.from!.id, {
    action: "admin_set_card",
    step: "number",
    data: {},
  });
  
  await ctx.editMessageText(
    "💳 Yangi karta raqamini kiriting:\n_(Masalan: 8600 1234 5678 9012)_",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Bekor qilish", "admin_settings")],
      ]),
    }
  );
});

bot.action("set_card_holder", async (ctx) => {
  await ctx.answerCbQuery();
  const admin = await storage.getBotUser(getTelegramUserId(ctx));
  if (!admin?.isAdmin) return;
  
  userStates.set(ctx.from!.id, {
    action: "admin_set_holder",
    step: "name",
    data: {},
  });
  
  await ctx.editMessageText(
    "👤 Karta egasi nomini kiriting:\n_(Masalan: ALIYEV VALI)_",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Bekor qilish", "admin_settings")],
      ]),
    }
  );
});

bot.action("add_admin", async (ctx) => {
  await ctx.answerCbQuery();
  const admin = await storage.getBotUser(getTelegramUserId(ctx));
  if (!admin?.isAdmin) return;
  
  userStates.set(ctx.from!.id, {
    action: "admin_add_admin",
    step: "user_id",
    data: {},
  });
  
  await ctx.editMessageText(
    "👑 Yangi adminning Telegram User ID sini kiriting:\n\n" +
    "_(User ID ni olish uchun foydalanuvchi /start buyrug'ini yuborishi kerak)_",
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("❌ Bekor qilish", "admin_settings")],
      ]),
    }
  );
});

bot.on("text", async (ctx, next) => {
  const state = userStates.get(ctx.from!.id);
  
  if (!state) return next();
  
  const admin = await storage.getBotUser(getTelegramUserId(ctx));
  if (!admin?.isAdmin) {
    userStates.delete(ctx.from!.id);
    return next();
  }
  
  const text = ctx.message.text.trim();
  
  if (state.action === "admin_set_card") {
    await storage.setAdminSetting("payment_card", text);
    userStates.delete(ctx.from!.id);
    await ctx.reply(`✅ Karta raqami o'zgartirildi: ${text}`, {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Sozlamalar", "admin_settings")]]),
    });
    return;
  }
  
  if (state.action === "admin_set_holder") {
    await storage.setAdminSetting("payment_card_holder", text);
    userStates.delete(ctx.from!.id);
    await ctx.reply(`✅ Karta egasi o'zgartirildi: ${text}`, {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Sozlamalar", "admin_settings")]]),
    });
    return;
  }
  
  if (state.action === "admin_add_admin") {
    const targetUser = await storage.getBotUser(text);
    if (!targetUser) {
      await ctx.reply("Bu User ID topilmadi. Foydalanuvchi avval /start buyrug'ini yuborishi kerak.");
      return;
    }
    
    await storage.setUserAdmin(text, true);
    userStates.delete(ctx.from!.id);
    await ctx.reply(`✅ ${targetUser.firstName || targetUser.username || text} admin qilib tayinlandi!`, {
      ...Markup.inlineKeyboard([[Markup.button.callback("🔙 Sozlamalar", "admin_settings")]]),
    });
    return;
  }
  
  return next();
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

// Global error handler - catch all unhandled errors
bot.catch((err: any, ctx: Context) => {
  const errorDesc = err?.response?.description || err.message || "Unknown error";
  
  // Ignore common non-critical errors
  if (isIgnorableError(err)) {
    return;
  }
  
  console.error(`Bot xatosi [${ctx.updateType}]:`, errorDesc);
});

export { bot };
