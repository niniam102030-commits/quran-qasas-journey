// src/services/__tests__/sherpaAsr.test.ts
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { ldb } from "../../db/learningDb";
import { verifyVerseRecitation } from "../recitationVerifier";
import {
  loadRecitationCalibration,
  META_RECITATION_CALIBRATION,
  recordUserConfirmedRecitationWord,
} from "../recitationCalibrationService";
import {
  MODEL_SHA256,
  MODEL_SIZE_MB,
  MODEL_URL,
  pcmFloat32ToInt16Base64,
  sha256Hex,
  sherpaAsr,
  SHERPA_ONNX_VERSION,
  verifySha256Hex,
  type SherpaAsr,
} from "../sherpaAsr";

describe("sherpaAsr bridge & helpers (B1)", () => {
  it("returns isAvailable()=false cleanly on web without throwing errors", async () => {
    await expect(sherpaAsr.isAvailable()).resolves.toBe(false);
    await expect(sherpaAsr.stop()).resolves.toEqual({ text: "" });
    expect(SHERPA_ONNX_VERSION).toBe("v2.0.3");
    expect(MODEL_SIZE_MB).toBe(247);
    expect(MODEL_SHA256).toHaveLength(64);
    expect(MODEL_URL).toContain("sherpa-onnx");
  });

  it("verifies SHA-256 digest accurately (valid vs tampered bytes)", async () => {
    const sample = new TextEncoder().encode("sherpa-onnx-arabic-model-check");
    const expected = await sha256Hex(sample);
    expect(await verifySha256Hex(sample, expected)).toBe(true);
    expect(await verifySha256Hex(sample, expected.toUpperCase())).toBe(true);
    expect(await verifySha256Hex(new TextEncoder().encode("tampered"), expected)).toBe(false);
  });

  it("encodes Float32 PCM samples (including downsampling 48kHz -> 16kHz) to valid Int16 Base64", () => {
    const samples48k = new Float32Array(480);
    for (let i = 0; i < samples48k.length; i++) {
      samples48k[i] = Math.sin((2 * Math.PI * i) / 48) * 0.5;
    }
    const b64 = pcmFloat32ToInt16Base64(samples48k, 48000, 16000);
    expect(b64.length).toBeGreaterThan(0);
    const decodedBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    // 480 / 3 = 160 samples * 2 bytes/sample = 320 bytes
    expect(decodedBytes.length).toBe(320);
  });

  it("pipes mocked SherpaAsr partial & final transcript into strict recitationVerifier unchanged", async () => {
    let partialCb: ((e: { text: string }) => void) | null = null;
    const fakeBridge: SherpaAsr = {
      isAvailable: vi.fn(async () => true),
      start: vi.fn(async () => {}),
      feed: vi.fn(async () => {
        partialCb?.({ text: "تلك آيات الكتاب" });
      }),
      stop: vi.fn(async () => ({ text: "تلك آيات الكتاب المبين" })),
      addListener: (_event, cb) => {
        partialCb = cb;
      },
    };

    expect(await fakeBridge.isAvailable()).toBe(true);
    let lastTranscript = "";
    fakeBridge.addListener("partial", (e) => {
      lastTranscript = e.text;
    });
    await fakeBridge.start({
      sampleRate: 16000,
      hotwords: ["تِلْكَ", "ءَايَٰتُ", "ٱلْكِتَٰبِ", "ٱلْمُبِينِ"],
    });
    expect(fakeBridge.start).toHaveBeenCalledWith({
      sampleRate: 16000,
      hotwords: ["تِلْكَ", "ءَايَٰتُ", "ٱلْكِتَٰبِ", "ٱلْمُبِينِ"],
    });
    await fakeBridge.feed(pcmFloat32ToInt16Base64(new Float32Array([0.1, -0.1, 0.2]), 16000, 16000));
    expect(lastTranscript).toBe("تلك آيات الكتاب");

    const final = await fakeBridge.stop();
    const expectedWords = [
      { id: "w28_002_001", ar: "تِلْكَ" },
      { id: "w28_002_002", ar: "ءَايَٰتُ" },
      { id: "w28_002_003", ar: "ٱلْكِتَٰبِ" },
      { id: "w28_002_004", ar: "ٱلْمُبِينِ" },
    ];
    const check = verifyVerseRecitation(expectedWords, final.text);
    expect(check.accuracyPercent).toBe(100);
    expect(check.correctCount).toBe(4);
  });

  it("persists and increments recitationCalibration in ldb.meta when user confirms words", async () => {
    await ldb.open();
    await ldb.meta.delete(META_RECITATION_CALIBRATION);

    await recordUserConfirmedRecitationWord("ٱلْكِتَٰبِ");
    const after1 = await recordUserConfirmedRecitationWord("الكتاب");
    expect(after1.map.get("الكتاب")).toBe(2);

    const loaded = await loadRecitationCalibration();
    expect(loaded.data.confirmed["الكتاب"]).toBe(2);
    expect(loaded.map.get("الكتاب")).toBe(2);
  });
});
