import { storage } from "./storage";
import { bot } from "./bot";
import { Markup } from "telegraf";
import { getPrayerTimesForRegion, getPrayerTimesForLocation, UZBEKISTAN_REGIONS, type RegionCode } from "./prayer";

const REMINDER_CHECK_INTERVAL = 60 * 1000;
const REPORT_CHECK_INTERVAL = 60 * 1000;
const PRAYER_CHECK_INTERVAL = 60 * 1000;

const sentPrayerReminders = new Map<string, boolean>();
const sentSubscriptionReminders = new Map<string, boolean>();

const sentDailyReports = new Map<string, string>();
const sentWeeklyReports = new Map<string, string>();

const SUBSCRIPTION_CHECK_INTERVAL = 60 * 60 * 1000; // Every hour

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("uz-UZ").format(amount) + " so'm";
}

function getProgressBar(current: number, target: number): string {
  const percentage = Math.min(100, Math.round((current / target) * 100));
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty) + ` ${percentage}%`;
}

async function checkAndSendReminders() {
  try {
    const tasks = await storage.getTasksWithPendingReminders();
    
    for (const task of tasks) {
      if (!task.telegramUserId) continue;
      
      // Only send reminders to users with active subscriptions
      const hasActiveSub = await checkSubscriptionActive(task.telegramUserId);
      if (!hasActiveSub) continue;
      
      try {
        const chatId = parseInt(task.telegramUserId);
        
        await bot.telegram.sendMessage(
          chatId,
          `🔔 *Eslatma!*\n\n📝 ${task.text}\n\nVazifani bajarish vaqti keldi!`,
          { 
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback("✅ Bajarildi", `reminder_done_${task.id}`),
                Markup.button.callback("⏰ Keyinroq", `reminder_snooze_${task.id}`)
              ]
            ])
          }
        );
        
        await storage.updateTask(task.id, { reminderSent: true }, task.telegramUserId);
        
        console.log(`Reminder sent for task ${task.id} to user ${task.telegramUserId}`);
      } catch (error) {
        console.error(`Failed to send reminder for task ${task.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Error checking reminders:", error);
  }
}

const RAMADAN_FREE_END = new Date("2026-03-20T23:59:59+05:00");

async function checkSubscriptionActive(telegramUserId: string): Promise<boolean> {
  if (new Date() < RAMADAN_FREE_END) {
    return true;
  }

  const subscription = await storage.getSubscription(telegramUserId);
  if (!subscription) return false;
  
  const now = new Date();
  const endDate = new Date(subscription.endDate);
  
  if ((subscription.status === "trial" || subscription.status === "active") && endDate > now) {
    return true;
  }
  return false;
}

async function generateDailyReport(telegramUserId: string): Promise<string> {
  const tasks = await storage.getTasks(telegramUserId);
  const expenses = await storage.getExpenses(telegramUserId);
  const goals = await storage.getActiveGoals(telegramUserId);
  
  const today = new Date();
  
  const todayTasks = tasks.filter(t => {
    const d = new Date(t.createdAt);
    return d.toDateString() === today.toDateString();
  });
  
  const completedToday = todayTasks.filter(t => t.completed).length;
  const pendingToday = todayTasks.filter(t => !t.completed).length;
  
  const todayExpenses = expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.toDateString() === today.toDateString();
  });
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const categoryTotals: Record<string, number> = {};
  todayExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });
  
  let message = `📊 *Kunlik hisobot*\n\n`;
  message += `📅 ${today.toLocaleDateString("uz-UZ")}\n\n`;
  
  message += `📋 *Vazifalar:*\n`;
  message += `├ Bugun qo'shildi: ${todayTasks.length}\n`;
  message += `├ Bajarildi: ${completedToday}\n`;
  message += `└ Jarayonda: ${pendingToday}\n\n`;
  
  message += `💰 *Xarajatlar:*\n`;
  message += `└ Jami: ${formatCurrency(todayTotal)}\n`;
  
  if (Object.keys(categoryTotals).length > 0) {
    message += `\n📁 *Kategoriyalar:*\n`;
    Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amount]) => {
        message += `• ${cat}: ${formatCurrency(amount)}\n`;
      });
  }
  
  if (goals.length > 0) {
    message += `\n🎯 *Maqsadlar:*\n`;
    goals.forEach(goal => {
      const progressBar = getProgressBar(goal.currentCount, goal.targetCount);
      message += `• ${goal.title}\n  ${progressBar}\n`;
    });
  }
  
  message += `\n_Ertaga ham barakali kun bo'lsin!_ 🌿`;
  
  return message;
}

async function generateWeeklyReport(telegramUserId: string): Promise<string> {
  const tasks = await storage.getTasks(telegramUserId);
  const expenses = await storage.getExpenses(telegramUserId);
  const goals = await storage.getActiveGoals(telegramUserId);
  const budgetLimits = await storage.getBudgetLimits(telegramUserId);
  
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 7);
  
  const weekTasks = tasks.filter(t => new Date(t.createdAt) >= weekStart);
  const completedWeek = weekTasks.filter(t => t.completed).length;
  const pendingWeek = weekTasks.filter(t => !t.completed).length;
  
  const weekExpenses = expenses.filter(e => new Date(e.createdAt) >= weekStart);
  const weekTotal = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  const categoryTotals: Record<string, number> = {};
  weekExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });
  
  let message = `📊 *Haftalik hisobot*\n\n`;
  message += `📅 ${weekStart.toLocaleDateString("uz-UZ")} - ${today.toLocaleDateString("uz-UZ")}\n\n`;
  
  message += `📋 *Vazifalar:*\n`;
  message += `├ Jami qo'shildi: ${weekTasks.length}\n`;
  message += `├ Bajarildi: ${completedWeek}\n`;
  message += `└ Jarayonda: ${pendingWeek}\n`;
  
  if (weekTasks.length > 0) {
    const completionRate = Math.round((completedWeek / weekTasks.length) * 100);
    message += `\n📈 Bajarilish darajasi: ${completionRate}%\n`;
  }
  
  message += `\n💰 *Xarajatlar:*\n`;
  message += `└ Haftalik jami: ${formatCurrency(weekTotal)}\n`;
  
  if (Object.keys(categoryTotals).length > 0) {
    message += `\n📁 *Kategoriyalar:*\n`;
    Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([cat, amount]) => {
        const percentage = Math.round((amount / weekTotal) * 100);
        message += `• ${cat}: ${formatCurrency(amount)} (${percentage}%)\n`;
      });
  }
  
  if (budgetLimits.length > 0) {
    message += `\n💳 *Byudjet holati:*\n`;
    for (const limit of budgetLimits) {
      const catExpenses = weekExpenses.filter(e => e.category === limit.category);
      const spent = catExpenses.reduce((sum, e) => sum + e.amount, 0);
      const percentage = Math.round((spent / limit.limitAmount) * 100);
      let emoji = "🟢";
      if (percentage >= 100) emoji = "🔴";
      else if (percentage >= 80) emoji = "🟡";
      message += `${emoji} ${limit.category}: ${percentage}% sarflandi\n`;
    }
  }
  
  if (goals.length > 0) {
    message += `\n🎯 *Maqsadlar:*\n`;
    goals.forEach(goal => {
      const percentage = Math.round((goal.currentCount / goal.targetCount) * 100);
      let emoji = "🟢";
      if (percentage < 50) emoji = "🔴";
      else if (percentage < 80) emoji = "🟡";
      message += `${emoji} ${goal.title}: ${goal.currentCount}/${goal.targetCount} (${percentage}%)\n`;
    });
  }
  
  message += `\n_Kelgusi hafta ham barakali bo'lsin!_ 🌿`;
  
  return message;
}

async function checkAndSendDailyReports() {
  try {
    // Use Uzbekistan timezone (UTC+5)
    const now = new Date();
    const uzbekistanTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
    const currentHour = uzbekistanTime.getHours();
    const currentMinute = uzbekistanTime.getMinutes();
    const today = uzbekistanTime.toDateString();
    
    const usersWithDaily = await storage.getAllUsersWithDailyReport();
    
    for (const user of usersWithDaily) {
      if (!user.dailyReportEnabled || !user.dailyReportTime) continue;
      
      // Only send reports to users with active subscriptions
      const hasActiveSub = await checkSubscriptionActive(user.telegramUserId);
      if (!hasActiveSub) continue;
      
      const [reportHour, reportMinute] = user.dailyReportTime.split(":").map(Number);
      
      if (currentHour === reportHour && currentMinute === reportMinute) {
        const reportKey = `${user.telegramUserId}_${today}`;
        
        if (sentDailyReports.has(reportKey)) continue;
        
        try {
          const chatId = parseInt(user.telegramUserId);
          const report = await generateDailyReport(user.telegramUserId);
          
          await bot.telegram.sendMessage(chatId, report, { parse_mode: "Markdown" });
          
          sentDailyReports.set(reportKey, today);
          
          console.log(`Daily report sent to user ${user.telegramUserId}`);
        } catch (error) {
          console.error(`Failed to send daily report to ${user.telegramUserId}:`, error);
        }
      }
    }
    
    sentDailyReports.forEach((date, key) => {
      if (date !== today) sentDailyReports.delete(key);
    });
  } catch (error) {
    console.error("Error checking daily reports:", error);
  }
}

async function checkAndSendWeeklyReports() {
  try {
    // Use Uzbekistan timezone (UTC+5)
    const now = new Date();
    const uzbekistanTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const currentDay = days[uzbekistanTime.getDay()];
    const currentHour = uzbekistanTime.getHours();
    const currentMinute = uzbekistanTime.getMinutes();
    
    if (currentHour !== 10 || currentMinute !== 0) return;
    
    const weekKey = `${uzbekistanTime.getFullYear()}-W${Math.ceil((uzbekistanTime.getTime() - new Date(uzbekistanTime.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;
    
    const usersWithSettings = await storage.getAllUsersWithDailyReport();
    
    for (const user of usersWithSettings) {
      if (!user.weeklyReportEnabled) continue;
      if (user.weeklyReportDay !== currentDay) continue;
      
      // Only send reports to users with active subscriptions
      const hasActiveSub = await checkSubscriptionActive(user.telegramUserId);
      if (!hasActiveSub) continue;
      
      const reportKey = `${user.telegramUserId}_${weekKey}`;
      
      if (sentWeeklyReports.has(reportKey)) continue;
      
      try {
        const chatId = parseInt(user.telegramUserId);
        const report = await generateWeeklyReport(user.telegramUserId);
        
        await bot.telegram.sendMessage(chatId, report, { parse_mode: "Markdown" });
        
        sentWeeklyReports.set(reportKey, weekKey);
        
        console.log(`Weekly report sent to user ${user.telegramUserId}`);
      } catch (error) {
        console.error(`Failed to send weekly report to ${user.telegramUserId}:`, error);
      }
    }
    
    sentWeeklyReports.forEach((week, key) => {
      if (week !== weekKey) sentWeeklyReports.delete(key);
    });
  } catch (error) {
    console.error("Error checking weekly reports:", error);
  }
}

const prayerNames: Record<string, string> = {
  fajr: "Bomdod",
  dhuhr: "Peshin",
  asr: "Asr",
  maghrib: "Shom",
  isha: "Xufton",
};

const UZ_TIMEZONE_OFFSET = 5 * 60 * 60 * 1000;

function getUzbekistanTime(): Date {
  return new Date(Date.now() + UZ_TIMEZONE_OFFSET);
}

function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(" ")[0].split(":").map(Number);
  return hours * 60 + minutes;
}

async function checkAndSendPrayerReminders() {
  try {
    const uzNow = getUzbekistanTime();
    const currentMinutes = uzNow.getHours() * 60 + uzNow.getMinutes();
    const today = uzNow.toISOString().split("T")[0];
    
    const allPrayerSettings = await storage.getAllPrayerSettings();
    
    for (const settings of allPrayerSettings) {
      if (!settings.telegramUserId) continue;
      
      // Only send prayer reminders to users with active subscriptions
      const hasActiveSub = await checkSubscriptionActive(settings.telegramUserId);
      if (!hasActiveSub) continue;
      
      const advanceMinutes = settings.advanceMinutes || 10;
      
      let times;
      if (settings.useCustomLocation && settings.latitude && settings.longitude) {
        times = await getPrayerTimesForLocation(
          parseFloat(settings.latitude),
          parseFloat(settings.longitude)
        );
      } else {
        const regionCode = settings.regionCode || "namangan";
        times = await getPrayerTimesForRegion(regionCode);
      }
      
      if (!times) continue;
      
      const prayersToCheck = [
        { key: "fajr", time: times.fajr, enabled: settings.fajrEnabled },
        { key: "dhuhr", time: times.dhuhr, enabled: settings.dhuhrEnabled },
        { key: "asr", time: times.asr, enabled: settings.asrEnabled },
        { key: "maghrib", time: times.maghrib, enabled: settings.maghribEnabled },
        { key: "isha", time: times.isha, enabled: settings.ishaEnabled },
      ];
      
      for (const prayer of prayersToCheck) {
        if (!prayer.enabled) continue;
        
        const prayerMinutes = parseTimeToMinutes(prayer.time);
        const reminderMinutes = prayerMinutes - advanceMinutes;
        
        if (currentMinutes === reminderMinutes) {
          const reminderKey = `${settings.telegramUserId}_${prayer.key}_${today}`;
          
          if (sentPrayerReminders.has(reminderKey)) continue;
          
          try {
            const chatId = parseInt(settings.telegramUserId);
            const prayerName = prayerNames[prayer.key] || prayer.key;
            
            await bot.telegram.sendMessage(
              chatId,
              `🕌 *${prayerName} namoziga ${advanceMinutes} minut qoldi!*\n\n⏰ Vaqti: ${prayer.time.split(" ")[0]}`,
              { parse_mode: "Markdown" }
            );
            
            sentPrayerReminders.set(reminderKey, true);
            
            console.log(`Prayer reminder sent for ${prayer.key} to user ${settings.telegramUserId}`);
          } catch (error) {
            console.error(`Failed to send prayer reminder to ${settings.telegramUserId}:`, error);
          }
        }
      }

      // Saharlik reminder (before Fajr)
      if (settings.saharlikEnabled) {
        const saharlikAdvance = settings.saharlikMinutes || 30;
        const fajrMinutes = parseTimeToMinutes(times.fajr);
        const saharlikReminderMinutes = fajrMinutes - saharlikAdvance;

        if (currentMinutes === saharlikReminderMinutes) {
          const reminderKey = `${settings.telegramUserId}_saharlik_${today}`;
          if (!sentPrayerReminders.has(reminderKey)) {
            try {
              const chatId = parseInt(settings.telegramUserId);
              await bot.telegram.sendMessage(
                chatId,
                `🍽 *Saharlik vaqtiga ${saharlikAdvance} minut qoldi!*\n\n⏰ Bomdod: ${times.fajr.split(" ")[0]}\n\n_Saharlikni shu vaqtgacha tugatishingiz kerak_`,
                { parse_mode: "Markdown" }
              );
              sentPrayerReminders.set(reminderKey, true);
              console.log(`Saharlik reminder sent to user ${settings.telegramUserId}`);
            } catch (error) {
              console.error(`Failed to send saharlik reminder to ${settings.telegramUserId}:`, error);
            }
          }
        }
      }

      // Iftorlik reminder (before Maghrib)
      if (settings.iftorlikEnabled) {
        const iftorlikAdvance = settings.iftorlikMinutes || 10;
        const maghribMinutes = parseTimeToMinutes(times.maghrib);
        const iftorlikReminderMinutes = maghribMinutes - iftorlikAdvance;

        if (currentMinutes === iftorlikReminderMinutes) {
          const reminderKey = `${settings.telegramUserId}_iftorlik_${today}`;
          if (!sentPrayerReminders.has(reminderKey)) {
            try {
              const chatId = parseInt(settings.telegramUserId);
              await bot.telegram.sendMessage(
                chatId,
                `🌆 *Iftorlik vaqtiga ${iftorlikAdvance} minut qoldi!*\n\n⏰ Shom: ${times.maghrib.split(" ")[0]}\n\n_Og'iz ochish vaqti yaqinlashdi!_`,
                { parse_mode: "Markdown" }
              );
              sentPrayerReminders.set(reminderKey, true);
              console.log(`Iftorlik reminder sent to user ${settings.telegramUserId}`);
            } catch (error) {
              console.error(`Failed to send iftorlik reminder to ${settings.telegramUserId}:`, error);
            }
          }
        }
      }
    }
    
    if (uzNow.getHours() === 0 && uzNow.getMinutes() === 0) {
      sentPrayerReminders.clear();
    }
  } catch (error) {
    console.error("Error checking prayer reminders:", error);
  }
}

async function checkAndSendSubscriptionReminders() {
  try {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    
    // Check expiring subscriptions (1 day left)
    const expiringIn1Day = await storage.getExpiringSubscriptions(1);
    for (const sub of expiringIn1Day) {
      const reminderKey = `${sub.telegramUserId}_expiring_1day_${today}`;
      if (sentSubscriptionReminders.has(reminderKey)) continue;
      
      try {
        const chatId = parseInt(sub.telegramUserId);
        const statusText = sub.status === "trial" ? "sinov muddatingiz" : "obunangiz";
        
        await bot.telegram.sendMessage(
          chatId,
          `⚠️ *Eslatma!*\n\n` +
          `Sizning ${statusText} *ertaga* tugaydi!\n\n` +
          `Barcha imkoniyatlardan foydalanishni davom ettirish uchun obunani yangilang.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("💎 Obunani yangilash", "menu_subscription")],
            ]),
          }
        );
        
        sentSubscriptionReminders.set(reminderKey, true);
        console.log(`Subscription expiry reminder (1 day) sent to ${sub.telegramUserId}`);
      } catch (error) {
        console.error(`Failed to send subscription reminder to ${sub.telegramUserId}:`, error);
      }
    }
    
    // Check expiring subscriptions (2 days left)
    const expiringIn2Days = await storage.getExpiringSubscriptions(2);
    for (const sub of expiringIn2Days) {
      const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft === 2) {
        const reminderKey = `${sub.telegramUserId}_expiring_2day_${today}`;
        if (sentSubscriptionReminders.has(reminderKey)) continue;
        
        try {
          const chatId = parseInt(sub.telegramUserId);
          const statusText = sub.status === "trial" ? "sinov muddatingiz" : "obunangiz";
          
          await bot.telegram.sendMessage(
            chatId,
            `⚠️ *Eslatma*\n\n` +
            `Sizning ${statusText} *2 kun*dan so'ng tugaydi.\n\n` +
            `Uzilishsiz davom etish uchun obunani yangilashni unutmang.`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [Markup.button.callback("💎 Obuna rejalarini ko'rish", "menu_subscription")],
              ]),
            }
          );
          
          sentSubscriptionReminders.set(reminderKey, true);
          console.log(`Subscription expiry reminder (2 days) sent to ${sub.telegramUserId}`);
        } catch (error) {
          console.error(`Failed to send subscription reminder to ${sub.telegramUserId}:`, error);
        }
      }
    }
    
    // Check expiring subscriptions (3 days left)
    const expiringIn3Days = await storage.getExpiringSubscriptions(3);
    for (const sub of expiringIn3Days) {
      const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft === 3) {
        const reminderKey = `${sub.telegramUserId}_expiring_3day_${today}`;
        if (sentSubscriptionReminders.has(reminderKey)) continue;
        
        try {
          const chatId = parseInt(sub.telegramUserId);
          const statusText = sub.status === "trial" ? "sinov muddatingiz" : "obunangiz";
          
          await bot.telegram.sendMessage(
            chatId,
            `ℹ️ *Eslatma*\n\n` +
            `Sizning ${statusText} *3 kun*dan so'ng tugaydi.\n\n` +
            `Uzilishsiz davom etish uchun obunani yangilashni unutmang.`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [Markup.button.callback("💎 Obuna rejalarini ko'rish", "menu_subscription")],
              ]),
            }
          );
          
          sentSubscriptionReminders.set(reminderKey, true);
          console.log(`Subscription expiry reminder (3 days) sent to ${sub.telegramUserId}`);
        } catch (error) {
          console.error(`Failed to send subscription reminder to ${sub.telegramUserId}:`, error);
        }
      }
    }
    
    // Check and mark expired subscriptions
    const expired = await storage.getExpiredSubscriptions();
    for (const sub of expired) {
      try {
        await storage.updateSubscription(sub.telegramUserId, { status: "expired" });
        
        const chatId = parseInt(sub.telegramUserId);
        await bot.telegram.sendMessage(
          chatId,
          `⏰ *Obuna muddati tugadi*\n\n` +
          `Sizning obunangiz muddati tugadi.\n\n` +
          `Barcha imkoniyatlardan foydalanish uchun obunani yangilang.`,
          {
            parse_mode: "Markdown",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("💎 Obunani yangilash", "menu_subscription")],
            ]),
          }
        );
        
        console.log(`Subscription expired notification sent to ${sub.telegramUserId}`);
      } catch (error) {
        console.error(`Failed to process expired subscription for ${sub.telegramUserId}:`, error);
      }
    }
    
    // Clear old reminder keys at midnight
    const uzNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    if (uzNow.getHours() === 0 && uzNow.getMinutes() === 0) {
      sentSubscriptionReminders.clear();
    }
  } catch (error) {
    console.error("Error checking subscription reminders:", error);
  }
}

export function startScheduler() {
  console.log("📅 Scheduler ishga tushdi!");
  
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL);
  
  setInterval(checkAndSendDailyReports, REPORT_CHECK_INTERVAL);
  
  setInterval(checkAndSendWeeklyReports, REPORT_CHECK_INTERVAL);
  
  setInterval(checkAndSendPrayerReminders, PRAYER_CHECK_INTERVAL);
  
  setInterval(checkAndSendSubscriptionReminders, SUBSCRIPTION_CHECK_INTERVAL);
  
  setTimeout(checkAndSendReminders, 5000);
  setTimeout(checkAndSendPrayerReminders, 10000);
  setTimeout(checkAndSendSubscriptionReminders, 15000);
}
