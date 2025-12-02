import { storage } from "./storage";
import { bot } from "./bot";

const REMINDER_CHECK_INTERVAL = 60 * 1000;
const REPORT_CHECK_INTERVAL = 60 * 1000;

const sentDailyReports = new Map<string, string>();
const sentWeeklyReports = new Map<string, string>();

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
      
      try {
        const chatId = parseInt(task.telegramUserId);
        
        await bot.telegram.sendMessage(
          chatId,
          `🔔 *Eslatma!*\n\n📝 ${task.text}\n\nVazifani bajarish vaqti keldi!`,
          { parse_mode: "Markdown" }
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
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const today = now.toDateString();
    
    const usersWithDaily = await storage.getAllUsersWithDailyReport();
    
    for (const user of usersWithDaily) {
      if (!user.dailyReportEnabled || !user.dailyReportTime) continue;
      
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
    const now = new Date();
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const currentDay = days[now.getDay()];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (currentHour !== 10 || currentMinute !== 0) return;
    
    const weekKey = `${now.getFullYear()}-W${Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;
    
    const usersWithSettings = await storage.getAllUsersWithDailyReport();
    
    for (const user of usersWithSettings) {
      if (!user.weeklyReportEnabled) continue;
      if (user.weeklyReportDay !== currentDay) continue;
      
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

export function startScheduler() {
  console.log("📅 Scheduler ishga tushdi!");
  
  setInterval(checkAndSendReminders, REMINDER_CHECK_INTERVAL);
  
  setInterval(checkAndSendDailyReports, REPORT_CHECK_INTERVAL);
  
  setInterval(checkAndSendWeeklyReports, REPORT_CHECK_INTERVAL);
  
  setTimeout(checkAndSendReminders, 5000);
}
