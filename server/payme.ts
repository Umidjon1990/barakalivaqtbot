import { storage } from "./storage";
import { bot } from "./bot";

const PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID || "";
const PAYME_SECRET_KEY = process.env.PAYME_SECRET_KEY || "";
const PAYME_TEST_KEY = process.env.PAYME_TEST_KEY || "";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ACTIVE_KEY = IS_PRODUCTION ? PAYME_SECRET_KEY : PAYME_TEST_KEY;

interface PaymeOrder {
  id: number;
  telegramUserId: string;
  planType: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  paymeTransactionId?: string;
  createdAt: Date;
}

export function generatePaymeCheckoutUrl(orderId: string, amount: number): string {
  const amountInTiyin = amount * 100;
  
  // Format: m=MERCHANT_ID;ac.order_id=ORDER_ID;a=AMOUNT
  const params = `m=${PAYME_MERCHANT_ID};ac.order_id=${orderId};a=${amountInTiyin}`;
  const base64Params = Buffer.from(params).toString("base64");
  
  // Use test sandbox in development, production in production
  const baseUrl = IS_PRODUCTION ? "https://checkout.paycom.uz" : "https://test.paycom.uz";
  return `${baseUrl}/${base64Params}`;
}

export function generatePaymeLinkUrl(orderId: string, amount: number): string {
  // Use the proper checkout URL format
  return generatePaymeCheckoutUrl(orderId, amount);
}

function verifyPaymeSignature(body: any, authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  
  const base64Credentials = authHeader.split(" ")[1];
  if (!base64Credentials) return false;
  
  const credentials = Buffer.from(base64Credentials, "base64").toString("ascii");
  const [login, password] = credentials.split(":");
  
  if (login !== "Paycom") return false;
  
  return password === ACTIVE_KEY;
}

export async function handlePaymeRequest(body: any, authHeader: string | undefined): Promise<any> {
  if (!verifyPaymeSignature(body, authHeader)) {
    return {
      error: {
        code: -32504,
        message: {
          ru: "Недостаточно привилегий",
          uz: "Huquqlar yetarli emas",
          en: "Insufficient privileges",
        },
      },
      id: body?.id,
    };
  }

  const { method, params, id } = body;

  try {
    switch (method) {
      case "CheckPerformTransaction":
        return await checkPerformTransaction(params, id);
      
      case "CreateTransaction":
        return await createTransaction(params, id);
      
      case "PerformTransaction":
        return await performTransaction(params, id);
      
      case "CancelTransaction":
        return await cancelTransaction(params, id);
      
      case "CheckTransaction":
        return await checkTransaction(params, id);
      
      case "GetStatement":
        return await getStatement(params, id);
      
      default:
        return {
          error: {
            code: -32601,
            message: { ru: "Метод не найден", uz: "Metod topilmadi", en: "Method not found" },
          },
          id,
        };
    }
  } catch (error) {
    console.error("Payme error:", error);
    return {
      error: {
        code: -31008,
        message: { ru: "Внутренняя ошибка", uz: "Ichki xatolik", en: "Internal error" },
      },
      id,
    };
  }
}

async function checkPerformTransaction(params: any, id: number) {
  const orderId = params?.account?.order_id;
  const amount = params?.amount;

  if (!orderId) {
    return {
      error: {
        code: -31050,
        message: { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
      },
      id,
    };
  }

  const paymentRequest = await storage.getPaymentRequest(parseInt(orderId));
  if (!paymentRequest) {
    return {
      error: {
        code: -31050,
        message: { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
      },
      id,
    };
  }

  if (paymentRequest.status !== "pending") {
    return {
      error: {
        code: -31051,
        message: { ru: "Заказ уже обработан", uz: "Buyurtma allaqachon bajarilgan", en: "Order already processed" },
      },
      id,
    };
  }

  const expectedAmount = paymentRequest.amount * 100;
  if (amount !== expectedAmount) {
    return {
      error: {
        code: -31001,
        message: { ru: "Неверная сумма", uz: "Noto'g'ri summa", en: "Incorrect amount" },
      },
      id,
    };
  }

  return {
    result: {
      allow: true,
    },
    id,
  };
}

async function createTransaction(params: any, id: number) {
  const orderId = params?.account?.order_id;
  const transactionId = params?.id;
  const time = params?.time;
  const amount = params?.amount;

  const paymentRequest = await storage.getPaymentRequest(parseInt(orderId));
  if (!paymentRequest) {
    return {
      error: {
        code: -31050,
        message: { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
      },
      id,
    };
  }

  // If order already has a different transaction, reject
  if (paymentRequest.paymeTransactionId && paymentRequest.paymeTransactionId !== transactionId) {
    return {
      error: {
        code: -31050,
        message: { ru: "Заказ уже привязан к другой транзакции", uz: "Buyurtma boshqa tranzaksiyaga bog'langan", en: "Order already linked to another transaction" },
      },
      id,
    };
  }

  // If same transaction exists, return existing data
  if (paymentRequest.paymeTransactionId === transactionId && paymentRequest.paymeCreateTime) {
    return {
      result: {
        create_time: parseInt(paymentRequest.paymeCreateTime),
        transaction: orderId,
        state: paymentRequest.status === "approved" ? 2 : 1,
      },
      id,
    };
  }

  // New transaction - save it
  await storage.updatePaymentRequest(parseInt(orderId), { 
    paymeTransactionId: transactionId,
    paymeCreateTime: time.toString()
  });

  return {
    result: {
      create_time: time,
      transaction: orderId,
      state: 1,
    },
    id,
  };
}

async function performTransaction(params: any, id: number) {
  const transactionId = params?.id;

  const paymentRequest = await storage.getPaymentRequestByPaymeId(transactionId);
  if (!paymentRequest) {
    return {
      error: {
        code: -31003,
        message: { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
      },
      id,
    };
  }

  // If already performed, return stored perform_time
  if (paymentRequest.status === "approved" && paymentRequest.paymePerformTime) {
    return {
      result: {
        transaction: paymentRequest.id.toString(),
        perform_time: parseInt(paymentRequest.paymePerformTime),
        state: 2,
      },
      id,
    };
  }

  const performTime = Date.now();
  await storage.updatePaymentRequest(paymentRequest.id, { 
    status: "approved",
    paymePerformTime: performTime.toString()
  });
  
  const planDays: Record<string, number> = {
    "1_month": 30,
    "2_months": 60,
    "3_months": 90,
  };
  const days = planDays[paymentRequest.planType] || 30;
  
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);
  
  await storage.createOrUpdateSubscription({
    telegramUserId: paymentRequest.telegramUserId,
    status: "active",
    planType: paymentRequest.planType,
    startDate: new Date(),
    endDate,
  });

  try {
    await bot.telegram.sendMessage(
      paymentRequest.telegramUserId,
      `✅ To'lov muvaffaqiyatli qabul qilindi!\n\n` +
      `📦 Tarif: ${paymentRequest.planType}\n` +
      `⏰ Amal qilish muddati: ${days} kun\n\n` +
      `Barcha imkoniyatlardan foydalanishingiz mumkin!`
    );
  } catch (error) {
    console.error("Failed to notify user:", error);
  }

  // Notify admins about the payment
  try {
    const admins = await storage.getAdminUsers();
    const planNames: Record<string, string> = {
      "1_month": "1 oylik",
      "2_months": "2 oylik", 
      "3_months": "3 oylik",
    };
    const planName = planNames[paymentRequest.planType] || paymentRequest.planType;
    
    for (const admin of admins) {
      try {
        await bot.telegram.sendMessage(
          admin.telegramUserId,
          `💳 Payme orqali yangi to'lov!\n\n` +
          `👤 Foydalanuvchi: ${paymentRequest.fullName}\n` +
          `📞 Telefon: ${paymentRequest.phoneNumber}\n` +
          `📦 Tarif: ${planName}\n` +
          `💵 Summa: ${(paymentRequest.amount).toLocaleString()} so'm\n` +
          `✅ Holat: Avtomatik tasdiqlandi\n\n` +
          `Obuna faollashtirildi!`
        );
      } catch (e) {
        console.error(`Failed to notify admin ${admin.telegramUserId}:`, e);
      }
    }
  } catch (error) {
    console.error("Failed to notify admins:", error);
  }

  return {
    result: {
      transaction: paymentRequest.id.toString(),
      perform_time: performTime,
      state: 2,
    },
    id,
  };
}

async function cancelTransaction(params: any, id: number) {
  const transactionId = params?.id;
  const reason = params?.reason;

  const paymentRequest = await storage.getPaymentRequestByPaymeId(transactionId);
  if (!paymentRequest) {
    return {
      error: {
        code: -31003,
        message: { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
      },
      id,
    };
  }

  // Determine state based on whether it was performed or not
  const wasPerformed = paymentRequest.status === "approved" || paymentRequest.paymePerformTime;
  const state = wasPerformed ? -2 : -1;

  // If already cancelled, return stored cancel_time
  if (paymentRequest.status === "rejected" && paymentRequest.paymeCancelTime) {
    return {
      result: {
        transaction: paymentRequest.id.toString(),
        cancel_time: parseInt(paymentRequest.paymeCancelTime),
        state,
      },
      id,
    };
  }

  const cancelTime = Date.now();
  await storage.updatePaymentRequest(paymentRequest.id, { 
    status: "rejected",
    paymeCancelTime: cancelTime.toString(),
    paymeCancelReason: reason || null
  });

  try {
    await bot.telegram.sendMessage(
      paymentRequest.telegramUserId,
      `❌ To'lov bekor qilindi.\n\nSabab: ${reason || "Noma'lum"}`
    );
  } catch (error) {
    console.error("Failed to notify user:", error);
  }

  return {
    result: {
      transaction: paymentRequest.id.toString(),
      cancel_time: cancelTime,
      state,
    },
    id,
  };
}

async function checkTransaction(params: any, id: number) {
  const transactionId = params?.id;

  const paymentRequest = await storage.getPaymentRequestByPaymeId(transactionId);
  if (!paymentRequest) {
    return {
      error: {
        code: -31003,
        message: { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
      },
      id,
    };
  }

  let state = 1;
  if (paymentRequest.status === "approved") {
    state = 2;
  } else if (paymentRequest.status === "rejected") {
    // -1 if cancelled before perform, -2 if cancelled after perform
    state = paymentRequest.paymePerformTime ? -2 : -1;
  }

  // Use stored Payme times if available
  const createTime = paymentRequest.paymeCreateTime 
    ? parseInt(paymentRequest.paymeCreateTime) 
    : new Date(paymentRequest.createdAt).getTime();
  
  const performTime = paymentRequest.paymePerformTime 
    ? parseInt(paymentRequest.paymePerformTime) 
    : 0;
  
  const cancelTime = paymentRequest.paymeCancelTime 
    ? parseInt(paymentRequest.paymeCancelTime) 
    : 0;

  return {
    result: {
      create_time: createTime,
      perform_time: performTime,
      cancel_time: cancelTime,
      transaction: paymentRequest.id.toString(),
      state,
      reason: paymentRequest.paymeCancelReason || null,
    },
    id,
  };
}

async function getStatement(params: any, id: number) {
  return {
    result: {
      transactions: [],
    },
    id,
  };
}
