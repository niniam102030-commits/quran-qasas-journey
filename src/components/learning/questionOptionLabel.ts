export interface DisplayOption {
  id: string;
  ar?: string;
  fa?: string;
  num?: number;
  n?: number;
  words?: string[];
  wordsAr?: string[];
  wordRange?: { verse: number; from: number; to: number };
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => farsiDigits[Number(digit)]);
}

export function labelOption(option: DisplayOption, resolved: Record<string, string> = {}): string {
  const ar = option.ar?.trim();
  if (ar) return ar;
  const fa = option.fa?.trim();
  if (fa) return fa;
  const num = option.num ?? option.n;
  if (num !== undefined) return toFarsiNum(num);
  if (option.wordsAr?.length) return option.wordsAr.join(" ");
  if (option.words?.length) return resolved[option.id] || option.words.join(" ");
  if (option.wordRange) {
    return resolved[option.id] || `آیه ${toFarsiNum(option.wordRange.verse)}، واژه‌های ${toFarsiNum(option.wordRange.from)} تا ${toFarsiNum(option.wordRange.to)}`;
  }
  return "";
}
