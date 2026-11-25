// src/learning/faCloze.ts
// ساخت قالبِ جای‌خالی‌دارِ ترجمه برای CLOZE_FA — منطق خالص، مشترک بین رندرر
// (QuestionRenderer) و سازنده‌های جلسه (useLearningStore) تا «قابل‌سرو بودن»
// یک سؤال دقیقاً با همان معیاری سنجیده شود که رندرر با آن قالب می‌سازد.

export interface FaClozeModel {
  parts: string[];
  keys: string[];
}

export interface FaClozeQuestion {
  stem?: {
    fa?: string;
    faTemplate?: string;
    verse?: number;
    hiddenIdx?: number[];
    faHidden?: { start: number; text: string }[];
    faSegments?: string[];
  };
  bank?: { id: string; fa?: string }[];
  answer?: unknown;
  explanationFa?: string;
}

// یافتن متنِ پاسخ‌ها در یک ترجمه‌ی کامل و ساخت مدل جای‌خالی از روی آن؛
// پاسخ‌های بلندتر اول جست‌وجو می‌شوند تا روی هم نیفتند.
function locateAnswersIn(
  full: string,
  keys: string[],
  answerText: (k: string) => string | null,
): FaClozeModel | null {
  const spans: { key: string; start: number; len: number }[] = [];
  const used: [number, number][] = [];
  const byLen = [...keys].sort((a, b) => (answerText(b)?.length ?? 0) - (answerText(a)?.length ?? 0));
  for (const k of byLen) {
    const t = answerText(k);
    if (!t) return null;
    let found = -1;
    let from = 0;
    while (true) {
      const i = full.indexOf(t, from);
      if (i === -1) break;
      if (used.some(([a, b]) => i < b && i + t.length > a)) {
        from = i + 1;
        continue;
      }
      found = i;
      break;
    }
    if (found === -1) return null;
    used.push([found, found + t.length]);
    spans.push({ key: k, start: found, len: t.length });
  }
  spans.sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let pos = 0;
  for (const sp of spans) {
    parts.push(full.slice(pos, sp.start));
    pos = sp.start + sp.len;
  }
  parts.push(full.slice(pos));
  return { parts, keys: spans.map((sp) => sp.key) };
}

// ساخت قالبِ جای‌خالی‌دارِ ترجمه برای CLOZE_FA از هر شکلی از داده که سؤال
// دارد؛ خروجی parts (متن‌های بین جاهای خالی) و keys (کلید هر جای خالی، به
// ترتیب ظاهرشدن در متن) است. اگر هیچ مدلی با اطمینان ساخته نشود null
// برمی‌گردد و رندر به حالت جایگزینِ فعلی (فقط دکمه‌ها) می‌افتد.
// شکل‌ها: ۱) faTemplate با ___  ۲) faTemplate با نشان‌های {n} یا {{n}}
// ۳) faSegments با hiddenIdx  ۴) faHidden با آفست کاراکتری روی ترجمه‌ی پایه
// (آفست‌ها روی همه‌ی این سؤال‌ها با ترجمه‌ی پایه راستی‌آزمایی می‌شوند)
// ۵) یافتن متنِ پاسخ‌ها در ترجمه‌ی کامل (stem.fa یا ترجمه‌ی پایه)
// ۶) یافتن متنِ پاسخ‌ها در ترجمه‌ی کاملی که داخل explanationFa آمده است
// («ترجمه کامل آیه N: «...»») — نجات‌بخش سؤال‌هایی که هیچ متن ترجمه‌ای در
// ساقه ندارند ولی پاسخ‌هایشان عیناً در توضیح خود سؤال هست.
export function buildFaClozeModel(q: FaClozeQuestion, baseFa: string | null): FaClozeModel | null {
  const answer = (q.answer as Record<string, string>) ?? {};
  const keys = Object.keys(answer);
  if (!keys.length) return null;
  const stem = q.stem ?? {};
  const byId = new Map((q.bank ?? []).map((b) => [b.id, b]));
  const answerText = (k: string): string | null => byId.get(answer[k])?.fa ?? null;

  const tpl = stem.faTemplate;
  if (tpl) {
    if (tpl.includes("___")) {
      const parts = tpl.split("___");
      if (parts.length - 1 === keys.length) return { parts, keys };
    }
    const markers = [...tpl.matchAll(/\{\{?(\d+)\}\}?/g)];
    if (markers.length === keys.length && markers.every((m) => keys.includes(m[1]))) {
      return { parts: tpl.split(/\{\{?\d+\}\}?/), keys: markers.map((m) => m[1]) };
    }
  }

  if (stem.faSegments?.length && stem.hiddenIdx?.length) {
    const hidden = new Set(stem.hiddenIdx.map(String));
    if (hidden.size === keys.length && keys.every((k) => hidden.has(k))) {
      const parts: string[] = [];
      const orderedKeys: string[] = [];
      let buf = "";
      stem.faSegments.forEach((seg, i) => {
        if (hidden.has(String(i + 1))) {
          parts.push(buf);
          orderedKeys.push(String(i + 1));
          buf = "";
        } else {
          buf = buf ? `${buf} ${seg}` : seg;
        }
      });
      parts.push(buf);
      if (parts.length === orderedKeys.length + 1) return { parts, keys: orderedKeys };
    }
  }

  if (stem.faHidden?.length && baseFa && stem.faHidden.length === keys.length) {
    const spans = [...stem.faHidden].sort((a, b) => a.start - b.start);
    if (spans.every((sp) => baseFa.slice(sp.start, sp.start + sp.text.length) === sp.text)) {
      const remaining = [...spans];
      const assigned = new Map<string, { start: number; text: string }>();
      let ok = true;
      for (const k of keys) {
        const t = answerText(k);
        if (!t) {
          ok = false;
          break;
        }
        const hit =
          remaining.find((sp) => sp.text === t) ??
          remaining.find((sp) => t.startsWith(sp.text) || sp.text.startsWith(t));
        if (!hit) {
          ok = false;
          break;
        }
        assigned.set(k, hit);
        remaining.splice(remaining.indexOf(hit), 1);
      }
      if (ok) {
        const ordered = [...assigned.entries()].sort((a, b) => a[1].start - b[1].start);
        const parts: string[] = [];
        let pos = 0;
        for (const [, sp] of ordered) {
          parts.push(baseFa.slice(pos, sp.start));
          pos = sp.start + sp.text.length;
        }
        parts.push(baseFa.slice(pos));
        return { parts, keys: ordered.map(([k]) => k) };
      }
    }
  }

  const full = stem.fa ?? baseFa;
  if (full) {
    const model = locateAnswersIn(full, keys, answerText);
    if (model) return model;
  }

  const explSpan = /(?:متن کامل ترجمه|ترجمه کامل)[^«]*«([^»]+)»/.exec(q.explanationFa ?? "");
  if (explSpan) {
    const model = locateAnswersIn(explSpan[1], keys, answerText);
    if (model) return model;
  }

  return null;
}

/** آیا برای این CLOZE_FA می‌توان قالب جای‌خالی ساخت؟ سؤال‌هایی که false
 * برمی‌گردانند نباید در هیچ جلسه/آزمونی سرو شوند (رندرشان فقط دکمه‌های
 * لخت است و کاربر هیچ متن ترجمه‌ای نمی‌بیند). */
export function faClozeServable(q: FaClozeQuestion, baseFa: string | null): boolean {
  return buildFaClozeModel(q, baseFa) !== null;
}
