// src/services/sherpaAsr.ts
// پل جاوااسکریپت برای افزونه بومی sherpa-onnx (B1) — در محیط وب بدون خطا isAvailable=false برمی‌گرداند
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export const SHERPA_ONNX_VERSION = "v2.0.3";
export const MODEL_URL =
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-ar_en_id_ja_ru_th_vi_zh-2025-02-10.tar.bz2";
export const MODEL_SHA256 = "b2365f521a4e68cef277d37add05e05688e087ebfd93435d53740125a96b24b0";
export const MODEL_SIZE_MB = 247;

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
  downloadModel(opts: { url: string; sha256: string }): Promise<{ installed: boolean; sha256: string }>;
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
  const handle = onProgress
    ? await nativePlugin.addListener("downloadProgress", (ev) => {
        onProgress(Number(ev?.loaded ?? 0), Number(ev?.total ?? 0));
      })
    : null;
  try {
    return await nativePlugin.downloadModel({ url: MODEL_URL, sha256: MODEL_SHA256 });
  } finally {
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
export async function startSherpaMicrophoneSession(opts: {
  engine?: SherpaAsr;
  hotwords?: string[];
  onTranscript: (transcript: string, isFinal: boolean) => void;
  onError: (messageFa: string) => void;
  onEnd: () => void;
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
        const res = await engine.stop();
        if (res?.text) {
          opts.onTranscript(res.text, true);
        }
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : "خطا در پایان تشخیص آفلاین");
      } finally {
        opts.onEnd();
      }
    },
  };
}
