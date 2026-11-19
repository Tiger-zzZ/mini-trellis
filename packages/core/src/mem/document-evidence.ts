import { excerptAround, matchTerms, windowAt } from "./lexical.js";

export interface TextAnchor {
  start: number;
  end: number;
}

export interface DocumentSection {
  start: number;
  bodyStart: number;
  end: number;
  line: number;
  level: number;
  title?: string;
  parent?: DocumentSection;
}

/** A section's own text stops before its first child or next sibling. */
export function documentSections(text: string): DocumentSection[] {
  let current: DocumentSection = {
    start: 0,
    bodyStart: 0,
    end: text.length,
    level: 0,
    line: 1,
  };
  const sections = [current];
  let fence: string | undefined;
  let line = 0;
  for (const match of text.matchAll(/[^\n]*\n|[^\n]+$/g)) {
    line += 1;
    const source = match[0];
    const marker = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(source);
    if (fence) {
      if (
        marker?.[1].startsWith(fence[0]) &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      )
        fence = undefined;
      continue;
    }
    if (marker && (marker[1][0] === "~" || !marker[2].includes("`"))) {
      fence = marker[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,6})[ \t]+([^\r\n]+)/.exec(source);
    if (!heading) continue;
    const title = heading[2].replace(/[ \t]+#+[ \t]*$/, "").trim();
    if (!title) continue;
    const level = heading[1].length;
    current.end = match.index;
    let parent = current;
    while (parent.parent && parent.level >= level) parent = parent.parent;
    current = {
      start: match.index,
      bodyStart: match.index + source.length,
      end: text.length,
      line,
      level,
      title,
      parent,
    };
    sections.push(current);
  }
  return sections;
}

export function sectionAt(
  sections: readonly DocumentSection[],
  offset: number,
): DocumentSection {
  let index = sections.length - 1;
  while (index > 0 && sections[index].start > offset) index--;
  return sections[index];
}

export function anchorLine(
  text: string,
  section: DocumentSection,
  anchor: TextAnchor,
): number {
  return (
    section.line +
    text.slice(section.start, anchor.start).split("\n").length -
    1
  );
}

/** Keep one hit per document. A second relevant section preserves separate
 * evidence without guessing which heading names the applicable rule. */
export function documentAnchors(
  text: string,
  sections: readonly DocumentSection[],
  terms: readonly string[],
  budget: number,
): [TextAnchor, TextAnchor?] {
  if (!terms.length) return [{ start: 0, end: 0 }];
  if (text.length <= budget || sections.length === 1) {
    const window = excerptAround(text, terms, budget);
    return [{ start: window.anchorStart, end: window.anchorEnd }];
  }
  const ranked = sections
    .map((section) => {
      const body = text.slice(section.bodyStart, section.end);
      const bodyTerms = matchTerms(body, terms).map(({ term }) => term);
      const headingTerms = matchTerms(
        text.slice(section.start, section.bodyStart),
        terms,
      ).map(({ term }) => term);
      return {
        section,
        terms: [...new Set([...bodyTerms, ...headingTerms])],
        bodyTerms,
      };
    })
    .sort(
      (a, b) =>
        b.terms.length - a.terms.length ||
        b.bodyTerms.length - a.bodyTerms.length,
    );
  const first = ranked[0];
  const minimum = Math.max(
    1,
    Math.min(
      first.terms.length,
      Math.max(2, Math.ceil(first.terms.length / 2)),
    ),
  );
  // At similar coverage, sample a more distant section so repeated nearby
  // wording does not use up both windows.
  const second = ranked
    .slice(1)
    .filter(
      ({ terms, bodyTerms }) =>
        bodyTerms.length > 0 &&
        (terms.length >= minimum ||
          // A section may repeat a distinctive name while using different words for the rule.
          bodyTerms.some((term) => term.length >= 8 && /[a-z0-9]/.test(term))),
    )
    .sort(
      (a, b) =>
        b.terms.length - a.terms.length ||
        Math.abs(b.section.start - first.section.start) -
          Math.abs(a.section.start - first.section.start),
    )[0];
  const anchor = ({ section, terms }: typeof first): TextAnchor => {
    const w = excerptAround(
      text.slice(section.start, section.end),
      terms,
      budget,
    );
    return {
      start: section.start + w.anchorStart,
      end: section.start + w.anchorEnd,
    };
  };
  return second ? [anchor(first), anchor(second)] : [anchor(first)];
}

/** Short pieces leave their unused share to longer ones. */
function share(sizes: number[], budget: number): number[] {
  const ranked = sizes
    .map((size, index) => ({ size, index }))
    .sort((a, b) => a.size - b.size);
  const caps = sizes.map(() => 0);
  ranked.forEach(({ size, index }, position) => {
    const cap = Math.min(size, Math.floor(budget / (ranked.length - position)));
    caps[index] = cap;
    budget -= cap;
  });
  return caps;
}

/** Excerpts stay in source order. Keep ancestor headings and introductions
 * alongside the selected sections, with omission visible within the budget. */
export function documentWindow(
  text: string,
  sections: readonly DocumentSection[],
  primary: TextAnchor,
  secondary: TextAnchor | undefined,
  budget: number,
): { excerpt: string; truncated: boolean } {
  if (text.length <= budget) return { excerpt: text, truncated: false };
  if (sections.length === 1)
    return windowAt(text, primary.start, primary.end, budget);

  const included = new Map<DocumentSection, TextAnchor | undefined>();
  for (const anchor of secondary ? [primary, secondary] : [primary]) {
    const section = sectionAt(sections, anchor.start);
    included.set(section, anchor);
    for (let parent = section.parent; parent; parent = parent.parent) {
      if (!included.has(parent) && text.slice(parent.start, parent.end).trim())
        included.set(parent, undefined);
    }
  }
  const entries = [...included]
    .sort(([a], [b]) => a.start - b.start)
    .map(([section, anchor]) => ({
      prefix: text
        .slice(section.start, anchor ? section.bodyStart : section.end)
        .trimEnd(),
      body: anchor ? text.slice(section.bodyStart, section.end).trimEnd() : "",
      start: (anchor?.start ?? section.bodyStart) - section.bodyStart,
      end: (anchor?.end ?? section.bodyStart) - section.bodyStart,
      headingStart: anchor ? anchor.start - section.start : 0,
      headingEnd: anchor ? anchor.end - section.start : 0,
      label:
        anchor && secondary
          ? `[line ${anchorLine(text, section, anchor)}]\n`
          : "",
    }));
  const separator = "\n…\n";
  const available =
    budget -
    (entries.length - 1) * separator.length -
    entries.reduce(
      (used, entry) =>
        used + entry.label.length + Number(!!entry.prefix && !!entry.body),
      0,
    );
  if (available < 1) return { excerpt: "", truncated: true };

  const prefixSizes = entries.map(({ prefix }) => prefix.length);
  const bodySizes = entries.map(({ body }) => body.length);
  const prefixLength = prefixSizes.reduce((sum, size) => sum + size, 0);
  const bodyLength = bodySizes.reduce((sum, size) => sum + size, 0);
  const prefixBudget = Math.min(
    prefixLength,
    available - Math.min(bodyLength, Math.ceil(available / 2)),
  );
  const prefixes = share(prefixSizes, prefixBudget);
  const bodies = share(bodySizes, available - prefixBudget);
  if (
    prefixes.some((cap, i) => cap === 0 && prefixSizes[i] > 0) ||
    bodies.some((cap, i) => cap === 0 && bodySizes[i] > 0)
  ) {
    return { excerpt: "", truncated: true };
  }
  const excerpts = entries.map(
    ({ prefix, body, start, end, headingStart, headingEnd, label }, i) => {
      const headingIsMatch = start < 0;
      const context = windowAt(
        prefix,
        headingIsMatch ? headingStart : 0,
        headingIsMatch ? headingEnd : 0,
        prefixes[i],
      ).excerpt;
      const passage = windowAt(body, start, end, bodies[i]).excerpt;
      return label + [context, passage].filter(Boolean).join("\n");
    },
  );
  return { excerpt: excerpts.join(separator), truncated: true };
}
