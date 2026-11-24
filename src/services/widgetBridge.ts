// src/services/widgetBridge.ts
// پل به‌روزرسانی ویجت صفحهٔ اصلی اندروید (مورد ۱۴) — در وب بی‌اثر است
import { Capacitor, registerPlugin } from "@capacitor/core";

interface NativeWidgetBridge {
  updateWidgetData(opts: {
    todayTitle: string;
    todayDetail: string;
    chillehDays: number;
    dueCount: number;
  }): Promise<{ ok: boolean }>;
}

const nativePlugin: NativeWidgetBridge | null =
  typeof window !== "undefined" && Capacitor.isNativePlatform()
    ? registerPlugin<NativeWidgetBridge>("WidgetBridge")
    : null;

export async function updateHomeWidget(data: {
  todayTitle: string;
  todayDetail: string;
  chillehDays: number;
  dueCount: number;
}): Promise<void> {
  if (!nativePlugin) return;
  try {
    await nativePlugin.updateWidgetData(data);
  } catch {
    // ویجت نباید هرگز جریان اصلی برنامه را مختل کند
  }
}
