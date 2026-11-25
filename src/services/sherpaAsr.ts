// src/services/sherpaAsr.ts
// پل جاوااسکریپت برای افزونه بومی sherpa-onnx (B1) — در محیط وب بدون خطا isAvailable=false برمی‌گرداند
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export const SHERPA_ONNX_VERSION = "v2.0.3";
// مدل قرآنی Abdou/quran-asr-small (مجوز MIT) — Conformer-CTC حروفی، بومی
// sherpa-onnx (Zipformer-CTC آفلاین)، آموزشدیده روی تلاوت قرآن. فایلها
// مستقیم از مخزن رسمی هاگینگفیس گرفته میشوند و sha256 هر فایل همان هش
// رسمی LFS مخزن است؛ افزونهی بومی هر فایل را پیش از نصب با همین هش
// راستیآزمایی میکند و «نصب شد» را فقط بعد از لود آزمایشی موفق مدل
// اعلام میکند.
export interface SherpaModelFile {
  name: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

export const MODEL_FILES: SherpaModelFile[] = [
  {
    name: "model.int8.onnx",
    url: "https://huggingface.co/Abdou/quran-asr-small/resolve/main/model.int8.onnx",
    sha256: "88f9df290d57b8890275d79187b77515aeeb12626a42bc76cbd0f8bfcaff00f0",
    sizeBytes: 36081762,
  },
  {
    name: "tokens.txt",
    url: "https://huggingface.co/Abdou/quran-asr-small/resolve/main/tokens.txt",
    sha256: "75b53814499cee84a07c7b7a318524d30bcaf84273c0f8b28a04176023e8c74f",
    sizeBytes: 180,
  },
];
export const MODEL_SIZE_MB = 36;

export interface SherpaAsr {
  isAvailable(): Promise<boolean>;
  start(opts: { sampleRate: 16000; hotwords?: string[] }): Promise<void>;
  feed(samplesBase64: string): Promise<void>;
  stop(): Promise<{ text: string }>;
  addListener(event: "partial", cb: (e: { text: string }) => void): void;
}

export interface SherpaModelStatus {
  installed: boolean;
  sha256?: string;
  sizeBytes?: number;
}

interface NativeSherpaPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getModelStatus(): Promise<SherpaModelStatus>;
  downloadModel(opts: { files: SherpaModelFile[]; totalBytes: number }): Promise<{ installed: boolean; sha256: string }>;
  deleteModel(): Promise<{ deleted: boolean }>;
  start(opts: { sampleRate: number; hotwords?: string[] }): Promise<void>;
  feed(opts: { samplesBase64: string }): Promise<void>;
  stop(): Promise<{ text: string }>;
  addListener(
    eventName: "partial" | "downloadProgress",
    listenerFunc: (event: Record<string, unknown>) => void,
  ): Promise<PluginListenerHandle>;
}

const nativePlugin: NativeSherpaPlugin | null =
  typeof window !== "undefined" && Capacitor.isNativePlatform()
    ? registerPlugin<NativeSherpaPlugin>("SherpaAsr")
    : null;

/** پیاده‌سازی پیش‌فرض پل SherpaAsr مطابق قرارداد رسمی */
export const sherpaAsr: SherpaAsr = {
  async isAvailable(): Promise<boolean> {
    if (!nativePlugin) return false;
    try {
      const res = await nativePlugin.isAvailable();
      return Boolean(res?.available);
    } catch {
      return false;
    }
  },
  async start(opts: { sampleRate: 16000; hotwords?: string[] }): Promise<void> {
    if (!nativePlugin) throw new Error("افزونه بومی sherpa-onnx فقط در نسخه اندروید در دسترس است.");
    await nativePlugin.start(opts);
  },
  async feed(samplesBase64: string): Promise<void> {
    if (!nativePlugin) return;
    await nativePlugin.feed({ samplesBase64 });
  },
  async stop(): Promise<{ text: string }> {
    if (!nativePlugin) return { text: "" };
    return nativePlugin.stop();
  },
  addListener(event: "partial", cb: (e: { text: string }) => void): void {
    if (!nativePlugin) return;
    void nativePlugin.addListener(event, (ev) => {
      cb({ text: String(ev?.text ?? "") });
    });
  },
};

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hashBuf = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySha256Hex(data: ArrayBuffer | Uint8Array, expectedHex: string): Promise<boolean> {
  const actual = await sha256Hex(data);
  return actual.toLowerCase() === expectedHex.trim().toLowerCase();
}

export async function getSherpaModelStatus(): Promise<SherpaModelStatus> {
  if (!nativePlugin) return { installed: false };
  try {
    return await nativePlugin.getModelStatus();
  } catch {
    return { installed: false };
  }
}

export async function downloadSherpaModel(
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ installed: boolean; sha256: string }> {
  if (!nativePlugin) {
    throw new Error("دانلود مدل آفلاین فقط در نسخه اندروید پشتیبانی می‌شود.");
  }
  let lastProgressAt = Date.now();
  const handle = await nativePlugin.addListener("downloadProgress", (ev) => {
    lastProgressAt = Date.now();
    onProgress?.(Number(ev?.loaded ?? 0), Number(ev?.total ?? 0));
  });
  // دیده‌بان: اگر دانلود در صف ماند یا شبکه بی‌صدا قطع شد، کاربر نباید منتظر بی‌نهایت بماند
  let watchdogId: number | null = null;
  const watchdog = new Promise<never>((_, reject) => {
    watchdogId = window.setInterval(() => {
      if (Date.now() - lastProgressAt > 20000) {
        reject(new Error("دانلود مدل آغاز نشد یا متوقف ماند. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید. (اگر دانلود در پس‌زمینه کامل شود، وضعیت در همین صفحه به‌روز می‌شود.)"));
      }
    }, 2000);
  });
  try {
    const totalBytes = MODEL_FILES.reduce((sum, f) => sum + f.sizeBytes, 0);
    return await Promise.race([nativePlugin.downloadModel({ files: MODEL_FILES, totalBytes }), watchdog]);
  } finally {
    if (watchdogId !== null) window.clearInterval(watchdogId);
    await handle?.remove();
  }
}

export async function deleteSherpaModel(): Promise<void> {
  if (!nativePlugin) return;
  await nativePlugin.deleteModel();
}

/** تبدیل نمونه صوتی Float32 (با نمونه برداری مجدد خطی ساده به 16kHz) به Int16 PCM Base64 */
export function pcmFloat32ToInt16Base64(
  samples: Float32Array,
  inputSampleRate = 16000,
  targetSampleRate = 16000,
): string {
  if (samples.length === 0) return "";
  let resampled = samples;
  if (inputSampleRate > 0 && targetSampleRate > 0 && inputSampleRate !== targetSampleRate) {
    const ratio = inputSampleRate / targetSampleRate;
    const outLen = Math.max(1, Math.floor(samples.length / ratio));
    resampled = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = Math.min(samples.length - 1, Math.floor(i * ratio));
      resampled[i] = samples[srcIdx];
    }
  }

  const bytes = new Uint8Array(resampled.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    const val = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    view.setInt16(i * 2, val, true);
  }

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface SherpaMicSessionHandle {
  stop: () => Promise<void>;
}

/**
 * اجرای جلسه استریم میکروفون از طریق WebAudio → chunks 16kHz PCM → SherpaAsr.feed()
 */
export interface SherpaChunkedOptions {
  /** سکوت لازم (میلی‌ثانیه) برای بستن تکهٔ جاری و دیکود آن — پیش‌فرض ۷۰۰ */
  silenceMs?: number;
  /** آستانهٔ RMS برای تشخیص وجود گفتار — پیش‌فرض ۰٫۰۱۵ */
  speechRms?: number;
  /** تحویل متن دیکودشدهٔ هر تکه بلافاصله پس از مکث وقفی (بدون پایان جلسه)؛ decodeMs زمان دیکود همان تکه است */
  onChunk: (text: string, decodeMs?: number) => void;
  /** گزارش تکه‌ای که گفتار داشت ولی دیکودش خالی ماند یا خطا داد (برای لاگ میدانی داور) */
  onChunkIssue?: (kind: "empty" | "error", decodeMs?: number) => void;
  /** سطح لحظه‌ای صدا (۰ تا ۱) برای نشانگر زندهٔ حین تلاوت */
  onLevel?: (rms: number) => void;
  /** تغییر وضعیت گفتار/سکوت برای نشانگر حین تلاوت */
  onSpeechChange?: (speaking: boolean) => void;
}

export async function startSherpaMicrophoneSession(opts: {
  engine?: SherpaAsr;
  hotwords?: string[];
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (messageFa: string) => void;
  onEnd: () => void;
  /** حالت تکه‌ای (A+B): دیکود خودکار هر تکه با مکث‌یابی، بدون نیاز به دکمهٔ توقف */
  chunked?: SherpaChunkedOptions;
}): Promise<SherpaMicSessionHandle | null> {
  const engine = opts.engine ?? sherpaAsr;
  const available = await engine.isAvailable();
  if (!available) {
    opts.onError("مسیر تشخیص گفتار آفلاین sherpa-onnx در این دستگاه در دسترس نیست.");
    return null;
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
    opts.onError("دسترسی به میکروفون یا WebAudio در این مرورگر پشتیبانی نمی‌شود.");
    return null;
  }

  let stopped = false;
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;

  // وضعیت مکث‌یابی حالت تکه‌ای
  const chunked = opts.chunked;
  const silenceMs = chunked?.silenceMs ?? 700;
  const speechRms = chunked?.speechRms ?? 0.015;
  let speechSeenInChunk = false;
  let lastSpeechAt = 0;
  let flushing = false;
  let speakingNow = false;
  let lastLevelAt = 0;

  const flushChunk = async () => {
    if (!chunked || flushing || stopped) return;
    flushing = true;
    const hadSpeech = speechSeenInChunk;
    const decodeStartedAt = performance.now();
    try {
      const res = await engine.stop();
      const decodeMs = Math.round(performance.now() - decodeStartedAt);
      if (!stopped && res?.text) {
        chunked.onChunk(res.text, decodeMs);
      } else if (!stopped && hadSpeech) {
        chunked.onChunkIssue?.("empty", decodeMs);
      }
    } catch {
      // خطای دیکود یک تکه نباید کل جلسه را ببندد
      if (hadSpeech) {
        chunked.onChunkIssue?.("error", Math.round(performance.now() - decodeStartedAt));
      }
    }
    speechSeenInChunk = false;
    if (!stopped) {
      try {
        await engine.start({
          sampleRate: 16000,
          ...(opts.hotwords && opts.hotwords.length > 0 ? { hotwords: opts.hotwords } : {}),
        });
      } catch {
        // اگر راه‌اندازی دوبارهٔ موتور ناموفق بود، توقف نهایی خطا را گزارش می‌کند
      }
    }
    flushing = false;
  };

  try {
    engine.addListener("partial", (ev) => {
      if (!stopped && ev.text) {
        opts.onTranscript(ev.text, false);
      }
    });

    await engine.start({
      sampleRate: 16000,
      ...(opts.hotwords && opts.hotwords.length > 0 ? { hotwords: opts.hotwords } : {}),
    });
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);

    const inputRate = audioCtx.sampleRate || 16000;
    processor.onaudioprocess = (ev) => {
      if (stopped) return;
      const input = ev.inputBuffer.getChannelData(0);

      if (chunked) {
        // RMS همین بافر برای مکث‌یابی و نشانگر زنده
        let sum = 0;
        for (let k = 0; k < input.length; k++) sum += input[k] * input[k];
        const rms = Math.sqrt(sum / Math.max(1, input.length));
        const now = performance.now();
        if (now - lastLevelAt > 100) {
          lastLevelAt = now;
          chunked.onLevel?.(Math.min(1, rms * 3));
        }
        const speaking = rms >= speechRms;
        if (speaking) {
          speechSeenInChunk = true;
          lastSpeechAt = now;
        }
        if (speaking !== speakingNow) {
          speakingNow = speaking;
          chunked.onSpeechChange?.(speaking);
        }
        if (speechSeenInChunk && !flushing && now - lastSpeechAt >= silenceMs) {
          void flushChunk();
        }
        if (flushing) return; // نمونه‌های فاصلهٔ راه‌اندازی دوباره (سکوت وقف) دور ریخته می‌شوند
      }

      const b64 = pcmFloat32ToInt16Base64(input, inputRate, 16000);
      if (b64) {
        void engine.feed(b64).catch(() => {});
      }
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);
  } catch {
    if (processor) processor.disconnect();
    if (audioCtx) void audioCtx.close();
    stream?.getTracks().forEach((t) => t.stop());
    opts.onError("آغاز میکروفون برای تشخیص آفلاین با خطا روبه‌رو شد.");
    return null;
  }

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try {
        processor?.disconnect();
        if (audioCtx && audioCtx.state !== "closed") {
          await audioCtx.close();
        }
        stream?.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore cleanup errors
      }
      try {
        const decodeStartedAt = performance.now();
        const res = await engine.stop();
        const decodeMs = Math.round(performance.now() - decodeStartedAt);
        if (res?.text) {
          if (chunked) {
            chunked.onChunk(res.text, decodeMs);
          } else {
            opts.onTranscript(res.text, true);
          }
        }
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : "خطا در پایان تشخیص آفلاین");
      } finally {
        opts.onEnd();
      }
    },
  };
}
