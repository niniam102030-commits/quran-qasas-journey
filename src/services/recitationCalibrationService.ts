// src/services/recitationCalibrationService.ts
// ذخیره‌سازی و بازیابی کالیبراسیون شخصی تلاوت در جدول meta (بخش ۲)
import {
  calibrationToMap,
  incrementCalibrationWord,
  MAX_CALIBRATION_ENTRIES,
  type RecitationCalibrationData,
} from "../learning/recitationAlign";
import { getMeta, setMeta } from "./metaStore";

export const META_RECITATION_CALIBRATION = "recitationCalibration";

export async function loadRecitationCalibration(): Promise<{
  data: RecitationCalibrationData;
  map: Map<string, number>;
}> {
  const saved = await getMeta<RecitationCalibrationData | null>(META_RECITATION_CALIBRATION, null);
  const data: RecitationCalibrationData = {
    confirmed: saved?.confirmed && typeof saved.confirmed === "object" ? { ...saved.confirmed } : {},
  };
  return {
    data,
    map: calibrationToMap(data),
  };
}

export async function recordUserConfirmedRecitationWord(
  word: string,
): Promise<{ data: RecitationCalibrationData; map: Map<string, number> }> {
  const { data } = await loadRecitationCalibration();
  const next = incrementCalibrationWord(data, word, MAX_CALIBRATION_ENTRIES);
  await setMeta(META_RECITATION_CALIBRATION, next);
  return {
    data: next,
    map: calibrationToMap(next),
  };
}
