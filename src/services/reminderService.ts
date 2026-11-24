// src/services/reminderService.ts
// سرویس یادآور محلی هوشمند روزانه (U3) — در محیط وب بدون Capacitor به‌صورت no-op امن عمل می‌کند
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { ldb } from "../db/learningDb";
import { reviewDebt } from "../learning/cardScheduler";
import { usePreferencesStore } from "../store/usePreferencesStore";

const DAILY_REMINDER_ID = 1;
const THIRTY_DAYS_MS = 30 * 86400_000;
const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
const toFarsi = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => farsiDigits[Number(d)]);

/**
 * محاسبهٔ خالص بهترین ساعت یادآور از روی هیستوگرام ساعت محلی تلاش‌های ۳۰ روز اخیر:
 * - پرتکرارترین ساعت (۰ تا ۲۳)؛ در تساوی ساعت زودتر برنده است.
 * - اگر تعداد تلاش‌های مشمول کمتر از ۱۰ باشد، ساعت پیش‌فرض ۲۰ برگردانده می‌شود.
 */
export function bestReminderHour(
  attempts: { at: number }[],
  nowMs: number = Date.now(),
): number {
  const cutoff = nowMs - THIRTY_DAYS_MS;
  const recent = attempts.filter((a) => Number.isFinite(a.at) && a.at >= cutoff);
  if (recent.length < 10) return 20;

  const counts = new Array<number>(24).fill(0);
  for (const a of recent) {
    const h = new Date(a.at).getHours();
    if (h >= 0 && h < 24) counts[h]++;
  }

  let bestHour = 20;
  let bestCount = -1;
  for (let h = 0; h < 24; h++) {
    if (counts[h] > bestCount) {
      bestCount = counts[h];
      bestHour = h;
    }
  }
  return bestHour;
}

export async function cancelDailyReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
  } catch {
    // ignore on unsupported environments
  }
}

export async function syncDailyReminder(opts?: {
  requestPermission?: boolean;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { reminderEnabled, reminderHourOverride } = usePreferencesStore.getState();
  if (!reminderEnabled) {
    await cancelDailyReminder();
    return;
  }

  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      if (!opts?.requestPermission) return;
      perm = await LocalNotifications.requestPermissions();
      if (perm.display !== "granted") return;
    }

    const [attempts, cards] = await Promise.all([
      ldb.attempts.toArray(),
      ldb.cards.toArray(),
    ]);
    const hour = reminderHourOverride ?? bestReminderHour(attempts);
    const debt = reviewDebt(cards);
    const body =
      debt > 0
        ? `${toFarsi(debt)} کارت مرور منتظر توست؛ چله‌ات را زنده نگه دار`
        : "مرور امروزت کامل است؛ برای درس تازه آماده‌ای؟";

    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: DAILY_REMINDER_ID,
          title: "یادآور سفر سوره قصص",
          body,
          schedule: {
            on: { hour, minute: 0 },
            allowWhileIdle: true,
          },
        },
      ],
    });
  } catch {
    // عدم مسدودسازی برنامه در صورت خطای پلاگین نیتیو
  }
}
