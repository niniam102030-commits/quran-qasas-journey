// src/services/offlineAsrService.ts
// لایه تشخیص گفتار زنده عربی از طریق Web Speech API مرورگر (آزمایشی — نیازمند پشتیبانی مرورگر و معمولاً اتصال شبکه)
// نکته شفافیت: این ماژول مدل ONNX آفلاین اجرا نمی‌کند؛ ضبط صدای آفلاین از طریق MediaRecorder در SelfReciteRecorder انجام می‌شود.

export interface DeviceAsrCapability {
  hasWebSpeech: boolean;
}

export function getDeviceAsrCapability(): DeviceAsrCapability {
  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : {};
  const hasWebSpeech = Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
  return { hasWebSpeech };
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
 * شروع تشخیص گفتار زنده عربی با Web Speech API مرورگر.
 * در Android WebView (داخل APK) معمولاً این API در دسترس نیست و کاربر به ضبط صدای آفلاین هدایت می‌شود.
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
    callbacks.onError("مرورگر این دستگاه از تشخیص گفتار زنده عربی (Web Speech API) پشتیبانی نمی‌کند؛ می‌توانید از ضبط صدای آفلاین استفاده کنید.");
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
      callbacks.onError("موتور تشخیص گفتار مرورگر برای زبان عربی به اتصال اینترنت نیاز دارد.");
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
