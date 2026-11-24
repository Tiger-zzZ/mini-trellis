import { sameProject } from "./filter.js";
/** Unified local recall: source-scoped discovery, lexical evidence, versioned refs. */
import { createHash } from "node:crypto";
import * as path from "node:path";
import {
  allowedDocPath,
  discoverDocs,
  readDocText,
  resolveProjectRoot,
  type DocDiscovery,
} from "./docs.js";
import {
  anchorLine,
  documentAnchors,
  documentSections,
  documentWindow,
  sectionAt,
  type TextAnchor,
} from "./document-evidence.js";
import { analyzeQuery, excerptAround, hasCjkBigramCoverage, matchTerms, windowAt } from "./lexical.js";
import { parseDocLineage, parseLineageMarks } from "./lineage.js";
import { MEM_PLATFORMS } from "./platforms.js";
import {
  listAll,
  prepareSqliteStores,
  resolveFilter,
  WIDE_LIMIT,
} from "./sessions.js";
import { MEM_SOURCE_KINDS } from "./types.js";
import type {
  DialogueTurn,
  MemSourceKind,
  MemWarning,
  ReadMemRefsOptions,
  LineageFault,
  RecallHit,
  RecallMemOptions,
  RecallRead,
  RecallReadResult,
  RecallResult,
} from "./types.js";

const EXCERPT_CHARS = 400;
const SUCCESSOR_EXCERPT_CHARS = 240;
const MAX_LINEAGE_HOPS = 8;
const MAX_QUERY_CHARS = 2000;
const MAX_REFS = 30;

/** Function and request words. A user turn is a question only when every token
 * is one of these or a query term. Any other word keeps the turn eligible. */
const QUERY_ECHO_WORDS = new Set([
  "a", "an", "about", "and", "any", "are", "can", "case", "could", "describe",
  "did", "do", "does", "explain", "excluded", "for", "from", "how", "in",
  "include", "is", "limits", "look", "me", "my", "need", "note", "notes",
  "numeric", "of", "on", "our", "path", "please", "quote", "should", "tell",
  "that", "the", "there", "this", "to", "up", "was", "were", "what", "when",
  "where", "which", "who", "why", "will", "would",
]);

interface EvidenceRef extends TextAnchor {
  kind: "doc" | "session";
  path?: string;
  platform?: MemSourceKind;
  id?: string;
  turn?: number;
  /** Optional in v1; older refs carry only the primary offsets. */
  secondary?: TextAnchor;
  hash: string;
}
interface Candidate {
  hit: RecallHit;
  source: string;
  anchor: TextAnchor;
  secondary?: TextAnchor;
  excerptTruncated: boolean;
  coverage: number;
  /** Sufficient query coverage in the body, excluding the document title. */
  bodyEvidence: boolean;
  cjkBodyEvidence: boolean;
  /** Required terms that contain a digit, such as TASK-4419. */
  idCoverage: number;
  derivedCoverage: number;
  titleCoverage: number;
  pathCoverage: number;
  explicitPathMatch: boolean;
  duplicateKey: string;
}

function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 24);
}
function encodeRef(ref: EvidenceRef): string {
  return `${ref.kind}:v1:${Buffer.from(JSON.stringify(ref)).toString("base64url")}`;
}
function validAnchor(anchor: unknown): anchor is TextAnchor {
  if (typeof anchor !== "object" || anchor === null) return false;
  const { start, end } = anchor as TextAnchor;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
    start >= 0 && end >= start;
}

function decodeRef(ref: string): EvidenceRef | undefined {
  if (ref.length > 8192) return undefined;
  const match = /^(doc|session):v1:([A-Za-z0-9_-]+)$/.exec(ref);
  if (!match) return undefined;
  try {
    const x = JSON.parse(
      Buffer.from(match[2] ?? "", "base64url").toString("utf8"),
    ) as EvidenceRef;
    if (
      x?.kind !== match[1] ||
      !validAnchor(x) ||
      typeof x.hash !== "string" ||
      !/^[a-f0-9]{24}$/.test(x.hash)
    )
      return undefined;
    if (x.kind === "doc")
      return typeof x.path === "string" &&
        (x.secondary === undefined || validAnchor(x.secondary))
        ? x
        : undefined;
    return typeof x.id === "string" &&
      Number.isSafeInteger(x.turn) &&
      (x.turn ?? -1) >= 0 &&
      (MEM_SOURCE_KINDS as readonly string[]).includes(x.platform ?? "")
      ? x
      : undefined;
  } catch {
    return undefined;
  }
}
function positive(value: number | undefined, fallback: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError("memory limits must be non-negative integers");
  return n;
}
/** Effective notes outrank archived / superseded ones at equal coverage. */
function inactiveRank(hit: RecallHit): number {
  return hit.status === "archived" || hit.status === "superseded" ? 1 : 0;
}

function hasBodyEvidence(bodyCoverage: number, requiredCount: number): boolean {
  if (bodyCoverage < 1) return false;
  // A one-term query is a whole question, so a body mention is all the body
  // evidence there can be. Longer queries need two terms and half of them.
  return (
    bodyCoverage >= Math.min(2, requiredCount) &&
    bodyCoverage * 2 >= requiredCount
  );
}

/** Keep body evidence ahead of competing titles where the coverage rules
 * below allow it. Session positions and exact ID priority stay intact. */
function orderDocBodies(docs: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  for (const candidate of docs) {
    if (!candidate.bodyEvidence) {
      out.push(candidate);
      continue;
    }
    const current = inactiveRank(candidate.hit) === 0;
    const at = out.findIndex((existing) =>
      current
        ? inactiveRank(existing.hit) > 0 ||
          (candidate.cjkBodyEvidence && !existing.bodyEvidence &&
            existing.titleCoverage > 0 && !existing.explicitPathMatch)
        : inactiveRank(existing.hit) === 0 && !existing.bodyEvidence,
    );
    if (at < 0) out.push(candidate);
    else out.splice(at, 0, candidate);
  }
  return out;
}

function preferBodyEvidence(ranked: Candidate[]): Candidate[] {
  const slots: number[] = [];
  const docs: Candidate[] = [];
  ranked.forEach((candidate, index) => {
    if (candidate.hit.sourceKind !== "doc") return;
    slots.push(index);
    docs.push(candidate);
  });
  const ordered = orderDocBodies(docs);
  const out = ranked.slice();
  slots.forEach((index, i) => {
    const doc = ordered[i];
    if (doc) out[index] = doc;
  });
  return out;
}

function rawTokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** One-letter words are noise in an echo, but they matter for "I confirm". */
function echoTokens(text: string): string[] {
  return rawTokens(text).filter(
    (token) => token.length >= 2 || /^\d+$/.test(token),
  );
}

/** Every part of every required term, so a restated question repeats
 * `TASK-4419` as `task` plus `4419` too. */
function requiredTokens(required: readonly string[]): Set<string> {
  const known = new Set<string>();
  for (const term of required)
    for (const token of echoTokens(term)) known.add(token);
  return known;
}

/** A user turn that only asks the query. Any token outside the request list
 * keeps the turn, including a fact that names no confirmation word. */
function isQueryEcho(text: string, required: readonly string[]): boolean {
  if (!required.length) return false;
  const tokens = echoTokens(text);
  const known = requiredTokens(required);
  if (
    !required.every((term) =>
      echoTokens(term).every((token) => tokens.includes(token)),
    )
  )
    return false;
  return tokens.every((token) => known.has(token) || QUERY_ECHO_WORDS.has(token));
}

/** The last current note in a declared chain ranks immediately before the note
 * it replaces. A higher-coverage unrelated note stays above that pair.
 * Cycles are not lifted. */
function liftDeclaredSuccessors(hits: RecallHit[]): RecallHit[] {
  const out = [...hits];
  for (let i = out.length - 1; i >= 0; i--) {
    const hit = out[i];
    if (!hit?.supersededBy || hit.lineageFault === "cycle") continue;
    const successorAt = out.findIndex((item) => item.path === hit.supersededBy);
    if (successorAt > i) {
      const [successor] = out.splice(successorAt, 1);
      if (successor) out.splice(i, 0, successor);
    }
  }
  return out;
}

function boundedSuccessorExcerpt(text: string | undefined): string | undefined {
  if (!text) return undefined;
  let body = text;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) body = body.slice(end + 4);
  }
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length <= SUCCESSOR_EXCERPT_CHARS
    ? flat
    : flat.slice(0, SUCCESSOR_EXCERPT_CHARS);
}

interface FollowedLineage {
  superseded: boolean;
  supersededBy?: string;
  fault?: LineageFault;
  successorExcerpt?: string;
}

/** A successor is readable only when ordinary discovery already accepted it. */
function successorInSources(discovery: DocDiscovery, rel: string): boolean {
  return discovery.docs.some((doc) => doc.relPath === rel);
}

function readScopedDoc(
  discovery: DocDiscovery,
  rel: string,
  docTexts: Map<string, string>,
  warnings: MemWarning[],
): string | undefined {
  const cached = docTexts.get(rel);
  if (cached !== undefined) return cached;
  const doc = discovery.docs.find((item) => item.relPath === rel);
  if (!doc) return undefined;
  const text = readDocText(discovery.root, doc.filePath, warnings);
  if (text !== undefined) docTexts.set(rel, text);
  return text;
}

/**
 * Walk a declared chain to the last note that does not point further.
 * Every hop stays inside the documents discovery already accepted, so Git
 * ignore, knowledge-dir exceptions, and file safety match ordinary reads.
 * A cycle or a chain longer than the hop cap does not pick an intermediate
 * note as the current rule.
 */
function followLineage(
  text: string,
  rel: string,
  discovery: DocDiscovery,
  docTexts: Map<string, string>,
  warnings: MemWarning[],
): FollowedLineage {
  const start = parseDocLineage(text, discovery.root, rel);
  if (start.fault || !start.supersededBy) {
    return {
      superseded: start.superseded,
      ...(start.fault ? { fault: start.fault } : {}),
    };
  }
  if (!successorInSources(discovery, start.supersededBy)) {
    return {
      superseded: parseLineageMarks(text).statusSuperseded,
      fault: "missing-target",
    };
  }
  const seen = new Set<string>([rel]);
  const direct = start.supersededBy;
  let nextRel = start.supersededBy;
  for (let hop = 0; hop < MAX_LINEAGE_HOPS; hop++) {
    if (seen.has(nextRel)) {
      return { superseded: true, supersededBy: direct, fault: "cycle" };
    }
    seen.add(nextRel);
    const successorText = readScopedDoc(discovery, nextRel, docTexts, warnings);
    if (successorText === undefined) {
      return { superseded: true, fault: "missing-target" };
    }
    const next = parseDocLineage(successorText, discovery.root, nextRel);
    if (
      next.fault === "self" ||
      next.fault === "escapes-project" ||
      next.fault === "missing-target"
    ) {
      return { superseded: true, fault: next.fault };
    }
    if (next.supersededBy && !successorInSources(discovery, next.supersededBy)) {
      return { superseded: true, fault: "missing-target" };
    }
    if (!next.supersededBy) {
      if (next.superseded) return { superseded: true, fault: "missing-target" };
      return {
        superseded: true,
        supersededBy: nextRel,
        successorExcerpt: boundedSuccessorExcerpt(successorText),
      };
    }
    if (seen.has(next.supersededBy)) {
      return { superseded: true, supersededBy: direct, fault: "cycle" };
    }
    nextRel = next.supersededBy;
  }
  return { superseded: true, fault: "bounded" };
}

/** Limit the serialized evidence records, including refs and source metadata. */
function select(
  candidates: Candidate[],
  limit: number,
  maxChars: number,
): { hits: RecallHit[]; truncated: boolean } {
  const sorted = [...candidates].sort(
    (a, b) =>
      b.idCoverage - a.idCoverage ||
      b.coverage - a.coverage ||
      b.titleCoverage - a.titleCoverage ||
      b.pathCoverage - a.pathCoverage ||
      b.derivedCoverage - a.derivedCoverage ||
      inactiveRank(a.hit) - inactiveRank(b.hit) ||
      (b.hit.sourceTime ?? "").localeCompare(a.hit.sourceTime ?? ""),
  );
  // An identifier match such as TASK-4419 outranks generic wording, so the
  // body-evidence pass only reorders candidates at the same identifier level.
  const ranked: Candidate[] = [];
  let block: Candidate[] = [];
  for (const candidate of sorted) {
    const previous = block[block.length - 1];
    if (previous && previous.idCoverage !== candidate.idCoverage) {
      ranked.push(...preferBodyEvidence(block));
      block = [];
    }
    block.push(candidate);
  }
  if (block.length) ranked.push(...preferBodyEvidence(block));
  const hits: RecallHit[] = [];
  let used = 0;
  let truncated = false;
  const emitted = new Set<string>();
  // Resolve declared priority before either result count or character budget
  // can discard the current note. Keep the candidate's own evidence anchor.
  const byRef = new Map(ranked.map((candidate) => [candidate.hit.ref, candidate]));
  const ordered = liftDeclaredSuccessors(ranked.map((candidate) => candidate.hit));
  for (const orderedHit of ordered) {
    const candidate = byRef.get(orderedHit.ref);
    if (!candidate) continue;
    if (emitted.has(candidate.duplicateKey)) continue;
    if (hits.length >= limit) {
      truncated = true;
      break;
    }
    const hit = { ...candidate.hit };
    const overhead = JSON.stringify({ ...hit, excerpt: "" }).length;
    const available = maxChars - used - overhead;
    if (available < 1) {
      truncated = true;
      continue;
    }
    if (JSON.stringify(hit).length > maxChars - used) {
      // JSON escaping and metadata also consume the budget. Keep the anchor.
      let cap = Math.min(hit.excerpt.length, available);
      const sections = hit.sourceKind === "doc" ? documentSections(candidate.source) : undefined;
      do {
        hit.excerpt = sections
          ? documentWindow(
              candidate.source, sections, candidate.anchor, candidate.secondary, cap,
            ).excerpt
          : windowAt(candidate.source, candidate.anchor.start, candidate.anchor.end, cap).excerpt;
        cap -= Math.max(1, JSON.stringify(hit).length - (maxChars - used));
      } while (cap > 0 && JSON.stringify(hit).length > maxChars - used);
      if (!hit.excerpt || JSON.stringify(hit).length > maxChars - used) {
        truncated = true;
        continue;
      }
      truncated = true;
    }
    if (!hit.excerpt) {
      truncated = true;
      continue;
    }
    hits.push(hit);
    truncated ||= candidate.excerptTruncated;
    emitted.add(candidate.duplicateKey);
    used += JSON.stringify(hit).length;
  }
  return { hits, truncated };
}

export function recallMem(options: RecallMemOptions): RecallResult {
  const source = options.source ?? "docs";
  const limit = positive(options.limit, 3);
  const maxChars = positive(options.maxChars, 3000);
  const warnings: MemWarning[] = [];
  const query = options.query.slice(0, MAX_QUERY_CHARS);
  if (query.length !== options.query.length)
    warnings.push({
      code: "query-truncated",
      message: "query exceeded 2000 characters; results are partial",
    });
  const { tokens, required, terms } = analyzeQuery(query);
  if (!terms.length)
    return {
      source,
      hits: [],
      totalHits: 0,
      incomplete: false,
      truncated: false,
      warnings,
    };
  const cwd = options.cwd ?? process.cwd();
  const discovery: DocDiscovery = source === "history"
    ? { ...resolveProjectRoot(cwd), docs: [], warnings: [] }
    : discoverDocs(cwd);
  warnings.push(...discovery.warnings);
  const candidates: Candidate[] = [];
  const add = (
    text: string,
    hit: Omit<RecallHit, "ref" | "excerpt" | "matchedTerms" | "strength">,
    ref: Omit<EvidenceRef, "start" | "end">,
  ): void => {
    const matches = matchTerms(text, terms);
    const pathMatches = hit.path ? matchTerms(hit.path, terms) : [];
    if (!matches.length && !pathMatches.length) return;
    const sections = ref.kind === "doc" ? documentSections(text) : undefined;
    const heading = sections?.[1];
    const title = sections ? heading?.title ?? hit.title ?? "" : "";
    const titleMatches = matchTerms(title, terms);
    const textTerms = matches.map(({ term }) => term);
    let anchor: TextAnchor;
    let secondary: TextAnchor | undefined;
    let window: { excerpt: string; truncated: boolean };
    if (sections) {
      [anchor, secondary] = documentAnchors(text, sections, textTerms, EXCERPT_CHARS);
      window = documentWindow(text, sections, anchor, secondary, EXCERPT_CHARS);
    } else {
      const dialogue = excerptAround(text, textTerms, EXCERPT_CHARS);
      anchor = { start: dialogue.anchorStart, end: dialogue.anchorEnd };
      window = dialogue;
    }
    const matchedTerms = [...new Set([...matches, ...pathMatches].map((h) => h.term))];
    const coverage = required.filter((t) => matchedTerms.includes(t)).length;
    const body = heading
      ? text.slice(0, heading.start) + text.slice(heading.bodyStart)
      : text;
    const bodyTerms = new Set(sections ? matchTerms(body, terms).map(({ term }) => term) : []);
    const bodyCoverage = required.filter((term) => bodyTerms.has(term)).length;
    const cjkBodyEvidence = bodyTerms.size > 0 && hasCjkBigramCoverage(tokens, bodyTerms);
    const titleCoverage = titleMatches.length / terms.length;
    const pathCoverage = pathMatches.length / terms.length;
    // Only a turn we can see is just the question loses its rank. A fact that
    // does not use a confirmation word stays eligible.
    const echo =
      ref.kind === "session" &&
      hit.section === "user" &&
      isQueryEcho(text, tokens);
    const record: RecallHit = {
      ...hit,
      ...(title ? { title } : {}),
      ref: encodeRef({
        ...ref,
        ...anchor,
        ...(secondary ? { secondary } : {}),
      }),
      excerpt: window.excerpt,
      matchedTerms,
      strength: !echo && coverage === required.length ? "strong" : "weak",
    };
    if (sections) {
      const section = sectionAt(sections, anchor.start);
      record.line = anchorLine(text, section, anchor);
      record.section = section.title;
    }
    candidates.push({
      hit: record,
      source: text,
      anchor,
      secondary,
      excerptTruncated: window.truncated,
      coverage: echo ? 0 : coverage,
      bodyEvidence: cjkBodyEvidence || hasBodyEvidence(bodyCoverage, required.length),
      cjkBodyEvidence,
      idCoverage: required.filter(
        (term) => /\d/.test(term) && matchedTerms.includes(term),
      ).length,
      derivedCoverage: matchedTerms.length / Math.max(1, terms.length),
      titleCoverage,
      pathCoverage,
      explicitPathMatch: pathMatches.some(({ term }) => /\.mdx?$/.test(term)),
      // The full versioned neighborhood and speaker must agree. Equal excerpts
      // alone may hide different qualifiers, denials, or attribution.
      duplicateKey: JSON.stringify([hit.sourceKind, hit.path ?? hit.sessionId,
        hit.section, ref.hash, anchor.start, anchor.end]),
    });
  };
  const docTexts = new Map<string, string>();
  for (const doc of discovery.docs) {
    const text = readDocText(discovery.root, doc.filePath, warnings);
    if (text === undefined) continue;
    docTexts.set(doc.relPath, text);
    const lineage = followLineage(
      text,
      doc.relPath,
      discovery,
      docTexts,
      warnings,
    );
    const status = lineage.superseded
      ? ("superseded" as const)
      : doc.archived
        ? ("archived" as const)
        : undefined;
    add(
      text,
      {
        sourceKind: "doc",
        title: doc.relPath,
        path: doc.relPath,
        ...(status ? { status } : {}),
        ...(lineage.supersededBy ? { supersededBy: lineage.supersededBy } : {}),
        ...(lineage.successorExcerpt
          ? { successorExcerpt: lineage.successorExcerpt }
          : {}),
        ...(lineage.fault ? { lineageFault: lineage.fault } : {}),
      },
      { kind: "doc", path: doc.relPath, hash: fingerprint(text) },
    );
  }
  const filter = resolveFilter({
    cwd: discovery.root,
    platform: options.platform,
    limit: WIDE_LIMIT,
  });
  const sessions = source === "docs" ? [] : listAll(filter, warnings);
  // OpenCode sessions share one database; prepare it once per recall, as search does.
  const releases = prepareSqliteStores(sessions, warnings);
  try {
    for (const session of sessions) {
      const adapter = MEM_PLATFORMS[session.platform];
      const turns = adapter.extract(session, warnings);
      turns.forEach((turn, idx) => {
        if (turn.kind === "marker") return;
        add(
          turn.text,
          {
            sourceKind: session.platform,
            title: session.id,
            section: turn.role,
            sessionId: session.id,
            turn: idx,
            ...(session.created ? { sourceTime: session.created } : {}),
          },
          {
            kind: "session",
            platform: session.platform,
            id: session.id,
            turn: idx,
            hash: fingerprint(
              JSON.stringify(turns.slice(Math.max(0, idx - 1), idx + 2)),
            ),
          },
        );
      });
    }
  } finally {
    for (const release of releases) release();
  }
  const strong = candidates.filter((c) => c.hit.strength === "strong");
  // A user question does not by itself drop every weaker document. A current
  // note with full coverage, or else an archived full match, still narrows it.
  const strongCurrent = strong.filter(
    (c) => c.hit.section !== "user" && inactiveRank(c.hit) === 0,
  );
  const anchors = strongCurrent.length
    ? strongCurrent
    : strong.filter((c) => inactiveRank(c.hit) > 0);
  const successors = new Set(strong.filter((c) => !c.hit.lineageFault)
    .map((c) => c.hit.supersededBy).filter(Boolean));
  // A current rule may use fewer query terms than the note it replaces, and a
  // note whose body states the rule must survive archived title matches.
  const pool = anchors.length
    ? candidates.filter(
        (c) =>
          c.hit.strength === "strong" ||
          successors.has(c.hit.path) ||
          c.bodyEvidence,
      )
    : candidates;
  const selected = select(pool, limit, maxChars);
  return {
    source,
    ...selected,
    totalHits: pool.length,
    incomplete: warnings.some(w => w.code !== "query-truncated" && w.kind !== "history-gap"),
    warnings,
  };
}

/** Preserve the hit first, then spend the remaining budget on neighboring turns. */
function dialogueWindow(
  turns: readonly DialogueTurn[],
  idx: number,
  start: number,
  end: number,
  budget: number,
): { text: string; truncated: boolean } {
  const selected = new Map<number, string>();
  const hit = turns[idx];
  if (!hit) return { text: "", truncated: false };
  const prefix = `${hit.role}: `;
  if (budget < prefix.length + 1) return { text: "", truncated: true };
  const neighbors = [idx - 1, idx + 1]
    .filter((i) => turns[i] && turns[i]?.kind !== "marker")
    .sort(
      (a, b) => (turns[a]?.text.length ?? 0) - (turns[b]?.text.length ?? 0),
    );
  const hitBudget = neighbors.length
    ? Math.max(1, Math.floor((budget - prefix.length) / 2))
    : budget - prefix.length;
  const window = windowAt(hit.text, start, end, hitBudget);
  selected.set(idx, prefix + window.excerpt);
  let used = prefix.length + window.excerpt.length;
  let truncated = window.truncated;
  for (const neighbor of neighbors) {
    const turn = turns[neighbor];
    if (!turn || turn.kind === "marker") continue;
    const label = `${turn.role}: `;
    const available = budget - used - label.length - 2;
    if (available < 1) {
      truncated = true;
      continue;
    }
    const anchor = neighbor < idx ? turn.text.length : 0;
    const w = windowAt(turn.text, anchor, anchor, available);
    selected.set(neighbor, label + w.excerpt);
    used += label.length + w.excerpt.length + 2;
    truncated ||= w.truncated;
  }
  return {
    text: [...selected]
      .sort(([a], [b]) => a - b)
      .map(([, t]) => t)
      .join("\n\n"),
    truncated,
  };
}

function readDoc(
  ref: string,
  evidence: EvidenceRef,
  discovery: DocDiscovery,
  budget: number,
  warnings: MemWarning[],
): RecallRead | undefined {
  const abs = path.resolve(discovery.root, evidence.path ?? "");
  const real = allowedDocPath(discovery.root, abs);
  const doc = real && discovery.docs.find((d) => d.filePath === real);
  if (!doc) {
    warnings.push({
      code: "ref-outside-project",
      message:
        "document ref is missing or outside the allowed project sources; recall again",
    });
    return undefined;
  }
  const text = readDocText(discovery.root, doc.filePath, warnings);
  if (text === undefined) return undefined;
  const lineage = followLineage(
    text,
    evidence.path ?? "",
    discovery,
    new Map(),
    warnings,
  );
  const lineageFields = {
    ...(lineage.superseded ? { status: "superseded" as const }
      : doc.archived ? { status: "archived" as const } : {}),
    ...(lineage.supersededBy ? { supersededBy: lineage.supersededBy } : {}),
    ...(lineage.fault ? { lineageFault: lineage.fault } : {}),
  };
  if (fingerprint(text) !== evidence.hash) {
    warnings.push({
      code: "ref-changed",
      message: "document changed since recall; recall again before using it",
    });
    return {
      ref,
      sourceKind: "doc",
      path: evidence.path,
      text: "",
      changed: true,
      ...lineageFields,
    };
  }
  if (evidence.end > text.length || (evidence.secondary && evidence.secondary.end > text.length)) {
    warnings.push({
      code: "ref-invalid",
      message: "document anchor is out of bounds",
    });
    return undefined;
  }
  const w = documentWindow(text, documentSections(text), evidence, evidence.secondary, budget);
  return {
    ref,
    sourceKind: "doc",
    path: evidence.path,
    title: evidence.path,
    text: w.excerpt,
    changed: false,
    truncated: w.truncated,
    ...lineageFields,
  };
}

function readSession(
  ref: string,
  evidence: EvidenceRef,
  root: string,
  budget: number,
  warnings: MemWarning[],
): RecallRead | undefined {
  const platform = evidence.platform;
  if (!platform || evidence.id === undefined || evidence.turn === undefined)
    return undefined;
  const session = listAll(
    resolveFilter({ cwd: root, platform, limit: WIDE_LIMIT }),
    warnings,
  ).find((s) => s.id === evidence.id && sameProject(s.cwd, root));
  if (!session) {
    warnings.push({
      code: "ref-missing",
      message: "session ref no longer resolves in this project",
    });
    return undefined;
  }
  const turns = MEM_PLATFORMS[platform].extract(session, warnings);
  const idx = evidence.turn;
  const turn = turns[idx];
  if (
    !turn ||
    fingerprint(JSON.stringify(turns.slice(Math.max(0, idx - 1), idx + 2))) !==
      evidence.hash
  ) {
    warnings.push({
      code: "ref-changed",
      message: "dialogue window changed since recall; recall again",
    });
    return {
      ref,
      sourceKind: platform,
      sessionId: session.id,
      text: "",
      changed: true,
    };
  }
  if (evidence.end > turn.text.length) {
    warnings.push({
      code: "ref-invalid",
      message: "dialogue anchor is out of bounds",
    });
    return undefined;
  }
  const window = dialogueWindow(
    turns,
    idx,
    evidence.start,
    evidence.end,
    budget,
  );
  return {
    ref,
    sourceKind: platform,
    title: session.id,
    sessionId: session.id,
    ...window,
    changed: false,
  };
}

/** Expand only versioned refs emitted by recall, with one total batch budget. */
export function readMemRefs(options: ReadMemRefsOptions): RecallReadResult {
  const cwd = options.cwd ?? process.cwd();
  let discovery: DocDiscovery | undefined;
  let historyRoot: string | undefined;
  const warnings: MemWarning[] = [];
  const budget = positive(options.maxChars, 4000);
  const reads: RecallRead[] = [];
  let used = 0;
  let truncated = options.refs.length > MAX_REFS;
  const refs = [...new Set(options.refs)].slice(0, MAX_REFS);
  for (const [index, ref] of refs.entries()) {
    const evidence = decodeRef(ref);
    if (!evidence) {
      warnings.push({
        code: "ref-invalid",
        message:
          "invalid or unversioned ref; run recall to obtain a current ref",
      });
      continue;
    }
    // Reserve metadata before reading, so one batch cannot grow per-ref caps.
    const overhead = JSON.stringify({
      ref,
      sourceKind: evidence.platform ?? "doc",
      title: evidence.path ?? evidence.id,
      ...(evidence.kind === "doc"
        ? { path: evidence.path }
        : { sessionId: evidence.id }),
      text: "",
      changed: false,
      truncated: false,
    }).length;
    const allowance = Math.floor((budget - used) / (refs.length - index));
    const remaining = allowance - overhead;
    if (remaining < 1) {
      truncated = true;
      break;
    }
    const expand = (cap: number): RecallRead | undefined => {
      if (evidence.kind === "session") {
        historyRoot ??= discovery?.root ?? resolveProjectRoot(cwd).root;
        return readSession(ref, evidence, historyRoot, cap, warnings);
      }
      if (!discovery) {
        discovery = discoverDocs(cwd);
        warnings.push(...discovery.warnings);
      }
      return readDoc(ref, evidence, discovery, cap, warnings);
    };
    let read = expand(remaining);
    if (!read) continue;
    let cap = remaining;
    while (JSON.stringify(read).length > allowance && cap > 0) {
      cap -= Math.max(1, JSON.stringify(read).length - allowance);
      if (cap <= 0) break;
      read = expand(cap);
      if (!read) break;
    }
    if (!read || JSON.stringify(read).length > allowance) {
      truncated = true;
      continue;
    }
    reads.push(read);
    used += JSON.stringify(read).length;
    truncated ||= read.truncated === true;
  }
  return { reads, warnings, truncated };
}
