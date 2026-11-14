// src/utils/arabicZwjHelper.ts
import type { MorphologySegment } from "../types/schema";

const ZWJ = "\u200D";

/**
 * حروف منفصل عربی که در خط عثمان طه هرگز به حرف سمت چپ (بعد از خود) نمی‌چسبند
 */
const NON_CONNECTING_ARABIC_CHARS = new Set([
    "ا",
    "أ",
    "إ",
    "آ",
    "ٱ",
    "د",
    "ذ",
    "ر",
    "ز",
    "و",
    "ؤ",
    "ء",
    "ة",
    "ى",
]);

/**
 * اعراب و علائم وقف عربی برای پیدا کردن آخرین حرف پایه در هر قطعه
 */
const ARABIC_DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/**
 * استخراج آخرین حرف پایه (بدون اعراب) از یک رشته عربی
 */
export function getLastBaseArabicChar(text: string): string {
    const stripped = text.replace(ARABIC_DIACRITICS_REGEX, "").trim();
    return stripped.length > 0 ? stripped[stripped.length - 1] : "";
}

/**
 * بررسی می‌کند که آیا قطعه فعلی در خط عربی باید به قطعه بعدی بچسبد یا خیر
 */
export function shouldConnectToLeft(segment: MorphologySegment): boolean {
    if (!segment.connectsLeft) return false;
    const lastBaseChar = getLastBaseArabicChar(segment.text);
    if (!lastBaseChar) return false;
    return !NON_CONNECTING_ARABIC_CHARS.has(lastBaseChar);
}

/**
 * تزریق خودکار کاراکتر Zero-Width Joiner (\u200D) به آرایه قطعات کلمه قرآنی
 * تا در هنگام رندر شدن درون تگ‌های <span> مجزا با رنگ‌های مختلف، اتصال حروف نشکند.
 */
export function formatSegmentsWithZwj(
    segments: MorphologySegment[]
): Array<MorphologySegment & { renderedText: string }> {
    return segments.map((segment, index) => {
        const prevSegment = index > 0 ? segments[index - 1] : null;
        const hasNextSegment = index < segments.length - 1;

        const connectsFromRight = prevSegment ? shouldConnectToLeft(prevSegment) : false;
        const connectsToLeft = hasNextSegment && shouldConnectToLeft(segment);

        const prefixZwj = connectsFromRight ? ZWJ : "";
        const suffixZwj = connectsToLeft ? ZWJ : "";

        return {
            ...segment,
            renderedText: `${prefixZwj}${segment.text}${suffixZwj}`,
        };
    });
}