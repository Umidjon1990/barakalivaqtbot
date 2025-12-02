# Railway'ga Deploy Qilish

## 1. Railway'da yangi loyiha yaratish

1. https://railway.com ga kiring
2. "New Project" tugmasini bosing
3. "Deploy from GitHub repo" tanlang
4. Bu repozitoriyani tanlang

## 2. PostgreSQL database qo'shish

1. Railway loyihasida "+" tugmasini bosing
2. "Database" → "PostgreSQL" tanlang
3. Database yaratilgandan keyin, `DATABASE_URL` avtomatik qo'shiladi

## 3. Environment Variables sozlash

Railway loyihasida "Variables" bo'limiga kiring va quyidagilarni qo'shing:

```
TELEGRAM_BOT_TOKEN=<sizning_bot_tokeningiz>
NODE_ENV=production
PORT=3000
```

**TELEGRAM_BOT_TOKEN** - @BotFather dan olingan token

## 4. Deploy qilish

Railway avtomatik deploy qiladi. Agar manual kerak bo'lsa:
- "Deploy" tugmasini bosing
- Yoki GitHub'ga push qiling - avtomatik deploy bo'ladi

## 5. Database migratsiya

Railway console'da quyidagini ishga tushiring:
```bash
npm run db:push
```

## Muhim eslatmalar

- Bot 24/7 ishlaydi
- Eslatmalar har daqiqa tekshiriladi
- Kunlik hisobot: soat 20:00 (O'zbekiston vaqti)
- Haftalik hisobot: Yakshanba soat 10:00

## Narxi

- Hobby plan: $5/oy (ko'p botlar uchun yetarli)
- Odatiy bot uchun: $0-3/oy

## Muammolar bo'lsa

1. Logs'ni tekshiring: Railway → Deployments → View Logs
2. DATABASE_URL to'g'ri ekanligini tekshiring
3. TELEGRAM_BOT_TOKEN to'g'ri ekanligini tekshiring
