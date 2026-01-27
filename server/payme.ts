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

export function generatePaymeCheckoutUrl(orderId: string, amount: number, description: string): string {
  const amountInTiyin = amount * 100;
  
  const params = new URLSearchParams({
    m: PAYME_MERCHANT_ID,
    "ac.order_id": orderId,
    a: amountInTiyin.toString(),
    c: description,
  });
  
  return `https://checkout.paycom.uz/${Buffer.from(params.toString()).toString("base64")}`;
}

export function generatePaymeLinkUrl(orderId: string, amount: number): string {
  const amountInTiyin = amount * 100;
  return `https://payme.uz/fallback/merchant/?id=${PAYME_MERCHANT_ID}&ac.order_id=${orderId}&a=${amountInTiyin}`;
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

  await storage.updatePaymentRequest(parseInt(orderId), { paymeTransactionId: transactionId });

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

  await storage.updatePaymentRequest(paymentRequest.id, { status: "approved" });
  
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

  return {
    result: {
      transaction: paymentRequest.id.toString(),
      perform_time: Date.now(),
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

  await storage.updatePaymentRequest(paymentRequest.id, { status: "rejected" });

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
      cancel_time: Date.now(),
      state: -1,
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
  if (paymentRequest.status === "approved") state = 2;
  else if (paymentRequest.status === "rejected") state = -1;

  return {
    result: {
      create_time: new Date(paymentRequest.createdAt).getTime(),
      perform_time: paymentRequest.status === "approved" ? Date.now() : 0,
      cancel_time: paymentRequest.status === "rejected" ? Date.now() : 0,
      transaction: paymentRequest.id.toString(),
      state,
      reason: null,
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
