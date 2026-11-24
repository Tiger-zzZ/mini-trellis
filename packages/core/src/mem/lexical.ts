/**
 * Deterministic lexical helpers for unified recall.
 *
 * English is lower-cased with Unicode normalization. Chinese uses
 * `Intl.Segmenter` where the runtime has it, and always adds CJK bigrams so a
 * query term still matches when the segmenter splits a word — or when the
 * runtime has no segmenter at all, which is the fallback below Node's full-ICU
 * builds. No synonym table and no model call lives here.
 */

const CJK = /[㐀-鿿]/;
const CJK_RUN = /[㐀-鿿]+/g;

/** `Intl.Segmenter` exists on Node ≥ 16, but word granularity needs ICU data
 * that minimal builds omit. Probe once and remember. */
const segmenter: Intl.Segmenter | null = (() => {
  try {
    if (typeof Intl.Segmenter !== "function") return null;
    return new Intl.Segmenter("zh", { granularity: "word" });
  } catch {
    return null;
  }
})();

/** True when the runtime can segment Chinese words. Exposed for diagnostics. */
export function segmenterAvailable(): boolean {
  return segmenter !== null;
}

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** Overlapping bigrams of a CJK run, so 幂等 matches inside 幂等性. */
function cjkBigrams(run: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < run.length - 1; i++) grams.push(run.slice(i, i + 2));
  return grams;
}

function chineseKeywords(run: string): string[] {
  const words: string[] = [];
  for (const span of run.split(/有什么|什么|怎么|如何|哪些|是否/u)) {
    if (!segmenter || span.length <= 3) {
      words.push(span);
      continue;
    }
    // ICU also returns adjacent single Han characters for technical terms.
    // Keep that span together; its overlapping bigrams are optional matches.
    let singles = "";
    for (const { segment } of segmenter.segment(span)) {
      if (segment.length === 1) singles += segment;
      else {
        words.push(singles, segment);
        singles = "";
      }
    }
    words.push(singles);
  }
  return words;
}

/** Raw tokens retain exact matches; coverage uses keywords, not optional bigrams. */
export function analyzeQuery(query: string): {
  tokens: string[];
  required: string[];
  terms: string[];
} {
  const tokens = [...new Set(normalize(query).split(/\s+/).filter(t => t.length >= 2))];
  const terms = new Set<string>();
  const keywords = new Set<string>();
  for (const token of tokens) {
    terms.add(token);
    if (!CJK.test(token)) {
      keywords.add(token);
      continue;
    }
    const words: string[] = [];
    for (const part of token.split(/([㐀-鿿]+)/u)) {
      if (CJK.test(part)) words.push(...chineseKeywords(part));
      // Keep embedded identifiers such as TASK-4419 and foo_bar intact.
      else words.push(...(part.match(/[\p{L}\p{N}_]+(?:[-./:#@][\p{L}\p{N}_]+)*/gu) ?? []));
    }
    const pathQuery = /\.mdx?$/.test(token);
    if (pathQuery) keywords.add(token);
    for (const word of words.filter(w => w.length >= 2)) {
      terms.add(word);
      if (!pathQuery) keywords.add(word);
    }
    for (const run of token.match(CJK_RUN) ?? [])
      for (const gram of cjkBigrams(run)) terms.add(gram);
  }
  return { tokens, terms: [...terms], required: keywords.size ? [...keywords] : tokens };
}

export function queryTerms(query: string): string[] {
  return analyzeQuery(query).terms;
}

export interface TermHit {
  term: string;
  /** Lower index is a stronger match: full token before bigram. */
  strength: number;
}

/**
 * Terms from `terms` that occur in `text`, each with the strength of its
 * strongest occurrence. `text` is normalized the same way as the query.
 */
export function matchTerms(text: string, terms: readonly string[]): TermHit[] {
  const hay = normalize(text);
  const hits: TermHit[] = [];
  terms.forEach((term, strength) => {
    if (hay.includes(term)) hits.push({ term, strength });
  });
  return hits;
}

/** Keep a body match when distinct bigrams cover at least half of a Chinese
 * query token. A single shared word cannot displace an exact title. */
export function hasCjkBigramCoverage(
  required: readonly string[],
  bodyTerms: ReadonlySet<string>,
): boolean {
  return required.some((term) => {
    if (/[^㐀-鿿\p{P}\p{S}]/u.test(term)) return false;
    const matched = new Set<string>();
    let length = 0;
    let covered = 0;
    for (const run of term.match(CJK_RUN) ?? []) {
      length += run.length;
      let last = -2;
      for (const [index, gram] of cjkBigrams(run).entries()) {
        if (!bodyTerms.has(gram)) continue;
        matched.add(gram);
        covered += index === last + 1 ? 1 : 2;
        last = index;
      }
    }
    return matched.size >= 2 && covered * 2 >= length;
  });
}

export interface TextWindow {
  excerpt: string;
  truncated: boolean;
  /** Original UTF-16 offsets, never normalized-text positions. */
  start: number;
  end: number;
  anchorStart: number;
  anchorEnd: number;
}

/** Map normalized graphemes back to the original source for citations. */
function mappedText(text: string): {
  hay: string;
  starts: number[];
  ends: number[];
} {
  if (/^\p{ASCII}*$/u.test(text))
    return { hay: text.toLowerCase(), starts: [], ends: [] };
  const chunks =
    typeof Intl.Segmenter === "function"
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            text,
          ),
          ({ segment, index }) => ({ segment, index }),
        )
      : Array.from(text.matchAll(/\P{M}\p{M}*|\p{M}+/gu), (m) => ({
          segment: m[0],
          index: m.index,
        }));
  const starts: number[] = [];
  const ends: number[] = [];
  const normalized: string[] = [];
  for (const chunk of chunks) {
    const value = normalize(chunk.segment);
    normalized.push(value);
    for (const _unit of value.split("")) {
      starts.push(chunk.index);
      ends.push(chunk.index + chunk.segment.length);
    }
  }
  return { hay: normalized.join(""), starts, ends };
}

/** Expand an original-source anchor, counting ellipses in the hard budget. */
export function windowAt(
  text: string,
  anchorStart: number,
  anchorEnd: number,
  maxChars: number,
): TextWindow {
  const budget = Math.max(0, Math.floor(maxChars));
  const a = Math.max(0, Math.min(text.length, anchorStart));
  const b = Math.max(a, Math.min(text.length, anchorEnd));
  if (text.length <= budget) {
    return {
      excerpt: text,
      truncated: false,
      start: 0,
      end: text.length,
      anchorStart: a,
      anchorEnd: b,
    };
  }
  const body = Math.max(0, budget - 2);
  const span = Math.min(body, b - a);
  const start = Math.min(
    Math.max(0, a - Math.floor((body - span) / 2)),
    Math.max(0, text.length - body),
  );
  const end = start + body;
  const excerpt = (
    (start > 0 ? "…" : "") +
    text.slice(start, end) +
    (end < text.length ? "…" : "")
  ).slice(0, budget);
  return { excerpt, truncated: true, start, end, anchorStart: a, anchorEnd: b };
}

/** Choose the densest distinct-term cluster, with all offsets in source text. */
export function excerptAround(
  text: string,
  terms: readonly string[],
  maxChars: number,
): TextWindow {
  const { hay, starts, ends } = mappedText(text);
  const positions: { start: number; end: number; term: string }[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = hay.indexOf(term, from);
      if (at < 0) break;
      positions.push({
        start: starts[at] ?? at,
        end: ends[at + term.length - 1] ?? at + term.length,
        term,
      });
      from = at + Math.max(1, term.length);
    }
  }
  positions.sort((a, b) => a.start - b.start || a.end - b.end);
  const counts = new Map<string, number>();
  let left = 0;
  let bestCount = -1;
  let anchorStart = positions[0]?.start ?? 0;
  let anchorEnd = positions[0]?.end ?? 0;
  for (let right = 0; right < positions.length; right++) {
    const here = positions[right];
    if (!here) continue;
    counts.set(here.term, (counts.get(here.term) ?? 0) + 1);
    while (
      left < right &&
      here.end - (positions[left]?.start ?? here.start) >
        Math.max(1, maxChars - 2)
    ) {
      const gone = positions[left++];
      if (!gone) break;
      const n = (counts.get(gone.term) ?? 1) - 1;
      if (n) counts.set(gone.term, n);
      else counts.delete(gone.term);
    }
    if (counts.size > bestCount) {
      bestCount = counts.size;
      anchorStart = positions[left]?.start ?? here.start;
      anchorEnd = here.end;
    }
  }
  return windowAt(text, anchorStart, anchorEnd, maxChars);
}
