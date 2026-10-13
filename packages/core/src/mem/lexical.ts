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

/**
 * Terms a query should match on. Order is preserved and duplicates dropped.
 * A CJK run contributes its whole span, its segmented words, and its bigrams;
 * everything else contributes whitespace-delimited tokens.
 */
export function queryTerms(query: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (term: string): void => {
    if (term.length < 2) return;
    if (seen.has(term)) return;
    seen.add(term);
    out.push(term);
  };

  for (const raw of normalize(query).split(/\s+/)) {
    if (!raw) continue;
    push(raw);
    if (!CJK.test(raw)) continue;
    if (segmenter) {
      for (const seg of segmenter.segment(raw)) {
        if (seg.isWordLike) push(seg.segment);
      }
    }
    for (const gram of cjkBigrams(raw.replace(/[^㐀-鿿]/g, ""))) {
      push(gram);
    }
  }
  return out;
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
