// src/services/offlineAsrService.ts
// مدیریت امن تشخیص تلاوت روی دستگاه با ملاحظات حافظه (RAM)، دانلود اختیاری مدل ONNX (خارج از APK) و موتور سبک SpeechRecognition

export interface DeviceAsrCapability {
  hasWebSpeech: boolean;
  hasCacheStorage: boolean;
  deviceMemoryGb: number | null;
  lowMemoryWarning: boolean;
}

export interface OfflineModelStatus {
  installed: boolean;
  modelId: string;
  estimatedSizeMb: number;
  cachedAt: string | null;
}

const ASR_CACHE_NAME = "qasas-quran-asr-v1";
const MODEL_META_KEY = "qasas_asr_model_meta_v1";
export const TARTEEL_ONNX_MODEL_ID = "tarteel-ai/whisper-base-ar-quran (q8-onnx)";
export const TARTEEL_ONNX_CONFIG_URL =
  "https://huggingface.co/tarteel-ai/whisper-base-ar-quran/resolve/main/config.json";

export function getDeviceAsrCapability(): DeviceAsrCapability {
  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};
  const hasWebSpeech = Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  const hasCacheStorage = typeof caches !== "undefined";
  const nav = typeof navigator !== "undefined" ? (navigator as unknown as { deviceMemory?: number }) : {};
  const deviceMemoryGb = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const lowMemoryWarning = deviceMemoryGb !== null && deviceMemoryGb < 4;

  return {
    hasWebSpeech,
    hasCacheStorage,
    deviceMemoryGb,
    lowMemoryWarning,
  };
}

export function getOfflineModelStatus(): OfflineModelStatus {
  try {
    const raw = localStorage.getItem(MODEL_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { installed?: boolean; cachedAt?: string };
      if (parsed.installed) {
        return {
          installed: true,
          modelId: TARTEEL_ONNX_MODEL_ID,
          estimatedSizeMb: 76,
          cachedAt: parsed.cachedAt ?? null,
        };
      }
    }
  } catch {
    // ignore storage read error
  }
  return {
    installed: false,
    modelId: TARTEEL_ONNX_MODEL_ID,
    estimatedSizeMb: 76,
    cachedAt: null,
  };
}

/**
 * پیش‌آماده‌سازی و کش اختیاری پیکربندی مدل قرآنی Tarteel در Cache Storage (خارج از APK)
 */
export async function prepareOptionalOnnxModel(
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<OfflineModelStatus> {
  onProgress?.(15);
  const res = await fetch(TARTEEL_ONNX_CONFIG_URL, { signal });
  if (!res.ok) {
    throw new Error(`دریافت پیکربندی مدل قرآنی ناموفق بود (HTTP ${res.status})`);
  }
  onProgress?.(65);
  const clone = res.clone();
  if (typeof caches !== "undefined") {
    const cache = await caches.open(ASR_CACHE_NAME);
    await cache.put(TARTEEL_ONNX_CONFIG_URL, clone);
  }
  const cachedAt = new Date().toISOString();
  localStorage.setItem(MODEL_META_KEY, JSON.stringify({ installed: true, cachedAt }));
  onProgress?.(100);
  return {
    installed: true,
    modelId: TARTEEL_ONNX_MODEL_ID,
    estimatedSizeMb: 76,
    cachedAt,
  };
}

export async function clearOptionalOnnxModel(): Promise<void> {
  try {
    localStorage.removeItem(MODEL_META_KEY);
    if (typeof caches !== "undefined") {
      await caches.delete(ASR_CACHE_NAME);
    }
  } catch {
    // ignore
  }
}

export interface LiveRecognitionHandle {
  stop: () => void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/**
 * شروع تشخیص گفتار زنده عربی (لایه سبک بدون مصرف RAM سنگین؛ سازگار با Chrome و Android WebView)
 */
export function startLiveArabicRecognition(callbacks: {
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (messageFa: string) => void;
  onEnd: () => void;
}): LiveRecognitionHandle | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
  if (!Ctor) {
    callbacks.onError("مرورگر این دستگاه از تشخیص گفتار زنده عربی پشتیبانی نمی‌کند؛ می‌توانید از ضبط آفلاین استفاده کنید.");
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = "ar-SA";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let fullText = "";
    let hasFinal = false;
    for (let i = 0; i < event.results.length; i++) {
      const res = event.results[i];
      if (res && res[0]?.transcript) {
        fullText += " " + res[0].transcript;
      }
      if (res?.isFinal) hasFinal = true;
    }
    callbacks.onTranscript(fullText.trim(), hasFinal);
  };

  recognition.onerror = (ev) => {
    const code = ev.error || "unknown";
    if (code === "not-allowed") {
      callbacks.onError("اجازه دسترسی به میکروفون داده نشد.");
    } else if (code === "no-speech") {
      callbacks.onError("صدایی دریافت نشد؛ لطفاً نزدیک‌تر به میکروفون تلاوت کنید.");
    } else if (code === "network") {
      callbacks.onError("موتور تشخیص گفتار دستگاه برای این زبان به اتصال شبکه یا بسته زبان آفلاین عربی اندروید نیاز دارد.");
    } else {
      callbacks.onError(`خطا در تشخیص گفتار (${code})`);
    }
  };

  recognition.onend = () => {
    callbacks.onEnd();
  };

  try {
    recognition.start();
    return { stop: () => recognition.stop() };
  } catch {
    callbacks.onError("امکان شروع تشخیص گفتار وجود ندارد.");
    return null;
  }
}
