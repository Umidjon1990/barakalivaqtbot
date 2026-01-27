import { storage } from "./storage";

// In-memory cache for prayer times to reduce database queries
const prayerTimesCache = new Map<string, {
  data: any;
  expiry: number;
}>();

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(regionCode: string, date: string): string {
  return `${regionCode}_${date}`;
}

export const UZBEKISTAN_REGIONS = {
  toshkent_shahar: { name: "Toshkent shahri", lat: 41.2995, lon: 69.2401 },
  toshkent_viloyat: { name: "Toshkent viloyati", lat: 41.3167, lon: 69.2500 },
  namangan: { name: "Namangan", lat: 41.0011, lon: 71.6725 },
  andijon: { name: "Andijon", lat: 40.7833, lon: 72.3500 },
  fargona: { name: "Farg'ona", lat: 40.3733, lon: 71.7978 },
  samarqand: { name: "Samarqand", lat: 39.6542, lon: 66.9597 },
  buxoro: { name: "Buxoro", lat: 39.7681, lon: 64.4556 },
  navoiy: { name: "Navoiy", lat: 40.0844, lon: 65.3792 },
  qashqadaryo: { name: "Qashqadaryo", lat: 38.8500, lon: 65.8000 },
  surxondaryo: { name: "Surxondaryo", lat: 37.2167, lon: 67.2833 },
  jizzax: { name: "Jizzax", lat: 40.1167, lon: 67.8333 },
  sirdaryo: { name: "Sirdaryo", lat: 40.8500, lon: 68.6667 },
  xorazm: { name: "Xorazm", lat: 41.5500, lon: 60.6333 },
  qoraqalpogiston: { name: "Qoraqalpog'iston", lat: 42.4611, lon: 59.6033 },
} as const;

export type RegionCode = keyof typeof UZBEKISTAN_REGIONS;

interface AladhanTimings {
  Fajr: string;
  Sunrise: string;
  Dhuhr: string;
  Asr: string;
  Sunset: string;
  Maghrib: string;
  Isha: string;
}

interface AladhanResponse {
  code: number;
  status: string;
  data: {
    timings: AladhanTimings;
  };
}

export async function fetchPrayerTimes(
  lat: number,
  lon: number,
  date: Date = new Date()
): Promise<AladhanTimings | null> {
  try {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    // Use method=1 (University of Islamic Sciences, Karachi) - most accurate for Hanafi/Central Asia
    // school=1 = Hanafi Asr calculation (shadow length 2x)
    // timezone=Asia/Tashkent for Uzbekistan
    // tune=0,0,0,0,0,0,0,0,0 - no manual adjustments
    const url = `https://api.aladhan.com/v1/timings/${day}-${month}-${year}?` +
      `latitude=${lat}&longitude=${lon}` +
      `&method=1` +        // Karachi University (Hanafi)
      `&school=1` +        // Hanafi Asr calculation
      `&timezone=Asia/Tashkent` +
      `&adjustment=0`;     // No hijri date adjustment
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Aladhan API error:", response.status);
      return null;
    }
    
    const data: AladhanResponse = await response.json();
    return data.data.timings;
  } catch (error) {
    console.error("Error fetching prayer times:", error);
    return null;
  }
}

export async function getPrayerTimesForRegion(regionCode: string, date: Date = new Date()): Promise<{
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  sunset: string;
  maghrib: string;
  isha: string;
} | null> {
  const dateStr = date.toISOString().split("T")[0];
  const cacheKey = getCacheKey(regionCode, dateStr);
  
  // Check in-memory cache first
  const memCached = prayerTimesCache.get(cacheKey);
  if (memCached && memCached.expiry > Date.now()) {
    return memCached.data;
  }
  
  const cached = await storage.getPrayerTimes(regionCode, dateStr);
  if (cached) {
    const result = {
      fajr: cached.fajr,
      sunrise: cached.sunrise,
      dhuhr: cached.dhuhr,
      asr: cached.asr,
      sunset: cached.sunset,
      maghrib: cached.maghrib,
      isha: cached.isha,
    };
    // Store in memory cache
    prayerTimesCache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL });
    return result;
  }
  
  const region = UZBEKISTAN_REGIONS[regionCode as RegionCode];
  if (!region) return null;
  
  const timings = await fetchPrayerTimes(region.lat, region.lon, date);
  if (!timings) return null;
  
  await storage.savePrayerTimes({
    regionCode,
    date: dateStr,
    fajr: timings.Fajr,
    sunrise: timings.Sunrise,
    dhuhr: timings.Dhuhr,
    asr: timings.Asr,
    sunset: timings.Sunset,
    maghrib: timings.Maghrib,
    isha: timings.Isha,
  });
  
  return {
    fajr: timings.Fajr,
    sunrise: timings.Sunrise,
    dhuhr: timings.Dhuhr,
    asr: timings.Asr,
    sunset: timings.Sunset,
    maghrib: timings.Maghrib,
    isha: timings.Isha,
  };
}

export async function getPrayerTimesForLocation(lat: number, lon: number, date: Date = new Date()): Promise<{
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  sunset: string;
  maghrib: string;
  isha: string;
} | null> {
  const timings = await fetchPrayerTimes(lat, lon, date);
  if (!timings) return null;
  
  return {
    fajr: timings.Fajr,
    sunrise: timings.Sunrise,
    dhuhr: timings.Dhuhr,
    asr: timings.Asr,
    sunset: timings.Sunset,
    maghrib: timings.Maghrib,
    isha: timings.Isha,
  };
}

export function formatPrayerTimesMessage(
  regionName: string,
  times: {
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    sunset: string;
    maghrib: string;
    isha: string;
  },
  advanceMinutes: number = 10
): string {
  const formatTime = (time: string) => time.split(" ")[0];
  
  let message = `🕌 *${regionName}*\n`;
  message += `📅 ${new Date().toLocaleDateString("uz-UZ")}\n\n`;
  message += `🌅 *Bomdod:* ${formatTime(times.fajr)}\n`;
  message += `🌤 *Quyosh chiqishi:* ${formatTime(times.sunrise)}\n`;
  message += `☀️ *Peshin:* ${formatTime(times.dhuhr)}\n`;
  message += `🌤 *Asr:* ${formatTime(times.asr)}\n`;
  message += `🌅 *Quyosh botishi:* ${formatTime(times.sunset)}\n`;
  message += `🌆 *Shom:* ${formatTime(times.maghrib)}\n`;
  message += `🌙 *Xufton:* ${formatTime(times.isha)}\n`;
  message += `\n🔔 _Eslatma: ${advanceMinutes} min oldin_`;
  
  return message;
}
