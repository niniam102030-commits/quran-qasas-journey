export interface DisplayOption {
  id: string;
  ar?: string;
  fa?: string;
  num?: number;
  words?: string[];
  wordRange?: { verse: number; from: number; to: number };
}

const farsiDigits = "۰۱۲۳۴۵۶۷۸۹";
function toFarsiNum(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => farsiDigits[Number(digit)]);
}

export function labelOption(option: DisplayOption, resolved: Record<string, string> = {}): string {
  return option.ar ?? option.fa ?? (option.num !== undefined ? toFarsiNum(option.num) : undefined) ??
    (option.words?.length ? resolved[option.id] || option.words.join(" ") : undefined) ??
    (option.wordRange ? resolved[option.id] || `آیه ${toFarsiNum(option.wordRange.verse)}، واژه‌های ${toFarsiNum(option.wordRange.from)} تا ${toFarsiNum(option.wordRange.to)}` : "");
}
