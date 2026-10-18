/**
 * Dialogue-window context extraction: resolve a session, optionally merge
 * sub-agent children, then select a token-budgeted window of turns around the
 * top hits.
 */

import { excerptAround, windowAt } from "./lexical.js";
import {
  buildChildIndex,
  extractDialogue,
  findSessionById,
  listAll,
  MemSessionNotFoundError,
  resolveFilter,
  WIDE_LIMIT,
} from "./sessions.js";
import type {
  DialogueRole,
  DialogueTurn,
  MemContextAnchor,
  MemContextResult,
  MemContextTurn,
  MemWarning,
  ReadMemContextOptions,
} from "./types.js";

interface SelectedContext {
  turns: MemContextTurn[];
  totalHitTurns: number;
  budgetUsed: number;
  anchor: MemContextAnchor;
}

function latestCompactionBoundary(
  turns: readonly DialogueTurn[],
): number | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.kind === "marker") return i;
  }
  return undefined;
}

/** Spoken turns immediately before the latest compaction boundary, walking
 * back across earlier boundaries until `nTurns` are collected. */
function turnsBeforeCompaction(
  turns: readonly DialogueTurn[],
  nTurns: number,
): number[] {
  const boundary = latestCompactionBoundary(turns);
  if (boundary === undefined) return [];
  const spoken: number[] = [];
  for (let i = boundary - 1; i >= 0 && spoken.length < nTurns; i--) {
    if (turns[i]?.kind === "marker") continue;
    spoken.push(i);
  }
  spoken.reverse();
  return spoken.length > 0 ? spoken : [boundary];
}

/** Reserve a share for every selected pre-compact turn, latest first, then
 * give leftover to those latest turns. An earlier long reply cannot spend
 * the budget that the last short limit needs. */
function preCompactCaps(
  indices: readonly number[],
  turns: readonly DialogueTurn[],
  maxChars: number,
): Map<number, number> {
  const caps = new Map<number, number>();
  if (!indices.length || maxChars < 1) return caps;
  const share = Math.max(1, Math.floor(maxChars / indices.length));
  let used = 0;
  for (let k = indices.length - 1; k >= 0; k--) {
    const idx = indices[k] ?? 0;
    const len = turns[idx]?.text.length ?? 0;
    const take = Math.min(len, share, Math.max(0, maxChars - used));
    caps.set(idx, take);
    used += take;
  }
  for (let k = indices.length - 1; k >= 0 && used < maxChars; k--) {
    const idx = indices[k] ?? 0;
    const len = turns[idx]?.text.length ?? 0;
    const have = caps.get(idx) ?? 0;
    const extra = Math.min(Math.max(0, len - have), maxChars - used);
    if (extra < 1) continue;
    caps.set(idx, have + extra);
    used += extra;
  }
  return caps;
}

/**
 * Pure selection: rank turns against `grep` (user-role first, then hit
 * density), take the top `nTurns`, expand each by `around` turns of context,
 * then emit turns within `maxChars`. A turn longer than its share is cut
 * around the densest matched-term window, so a hit at the end of a
 * long turn survives. With no `grep`, a session that has a compaction
 * boundary yields the spoken turns just before the latest boundary;
 * otherwise it returns the first `nTurns` turns.
 */
export function selectContextTurns(
  turns: readonly DialogueTurn[],
  grep: string | undefined,
  nTurns: number,
  around: number,
  maxChars: number,
): SelectedContext {
  let hitIndices: number[] = [];
  let totalHitTurns = 0;
  let anchor: MemContextAnchor = "opening";

  if (grep) {
    const tokens = grep.toLowerCase().split(/\s+/).filter(Boolean);
    const matchCount = (text: string): number => {
      const hay = text.toLowerCase();
      if (!tokens.every((tok) => hay.includes(tok))) return 0;
      let n = 0;
      for (const tok of tokens) {
        let from = 0;
        while (true) {
          const idx = hay.indexOf(tok, from);
          if (idx === -1) break;
          n++;
          from = idx + tok.length;
        }
      }
      return n;
    };
    const ranked: { idx: number; role: DialogueRole; hits: number }[] = [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      // Compaction summaries repeat query terms but are not original dialogue.
      if (!turn || turn.kind === "marker") continue;
      const h = tokens.length === 0 ? 0 : matchCount(turn.text);
      if (h > 0) ranked.push({ idx: i, role: turn.role, hits: h });
    }
    totalHitTurns = ranked.length;
    ranked.sort((a, b) => {
      if (a.role !== b.role) return a.role === "user" ? -1 : 1;
      if (b.hits !== a.hits) return b.hits - a.hits;
      return a.idx - b.idx;
    });
    hitIndices = ranked.slice(0, nTurns).map((r) => r.idx);
    anchor = "query";
  } else if (latestCompactionBoundary(turns) !== undefined) {
    hitIndices = turnsBeforeCompaction(turns, nTurns);
    anchor = "before-compaction";
  } else {
    for (let i = 0; i < Math.min(nTurns, turns.length); i++) hitIndices.push(i);
  }

  // Expand each hit by `around` turns on either side; dedupe via Set.
  const display = new Set<number>();
  for (const idx of hitIndices) {
    for (
      let j = Math.max(0, idx - around);
      j <= Math.min(turns.length - 1, idx + around);
      j++
    ) {
      display.add(j);
    }
  }
  const hitSet = new Set(hitIndices);
  // Allocate evidence first, then short neighboring qualifiers, finally render
  // in dialogue order. A long preceding turn cannot consume the hit's budget.
  const neighbors = [...display]
    // A compact summary is a boundary, not neighboring original evidence.
    .filter((i) => !hitSet.has(i) && turns[i]?.kind !== "marker")
    .sort(
      (a, b) => (turns[a]?.text.length ?? 0) - (turns[b]?.text.length ?? 0),
    );
  const reserved =
    anchor === "before-compaction"
      ? preCompactCaps(hitIndices, turns, maxChars)
      : undefined;
  const priority = reserved
    ? [...hitIndices].reverse().concat(neighbors)
    : [...hitIndices, ...neighbors];
  const out: MemContextTurn[] = [];
  let used = 0;
  for (const i of priority) {
    const t = turns[i];
    if (!t || used >= maxChars) continue;
    const available = Math.max(0, maxChars - used);
    const reservedCap = reserved?.get(i);
    const cap =
      reservedCap !== undefined
        ? Math.min(available, reservedCap)
        : hitSet.has(i) && neighbors.length
          ? Math.min(available, Math.max(1, Math.floor(maxChars / 2)))
          : available;
    const tokens = (grep ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const text =
      hitSet.has(i) && tokens.length
        ? excerptAround(t.text, tokens, cap).excerpt
        : windowAt(t.text, 0, 0, cap).excerpt;
    if (!text) continue;
    out.push({ idx: i, role: t.role, text, isHit: hitSet.has(i) });
    used += text.length;
  }
  out.sort((a, b) => a.idx - b.idx);

  return { turns: out, totalHitTurns, budgetUsed: used, anchor };
}

function sessionFileUnreadable(
  warnings: readonly MemWarning[],
  id: string,
): boolean {
  const prefix = `cannot read session ${id} (`;
  return warnings.some(
    (warning) =>
      warning.code === "session-history-unreadable" &&
      warning.message.startsWith(prefix),
  );
}

/** Drill into a single session: top-N hit turns plus surrounding context,
 * char-budgeted. With no `grep`, read up to the latest compaction boundary
 * instead of the session opening. */
export function readMemContext(
  options: ReadMemContextOptions,
): MemContextResult {
  const f = resolveFilter(options.filter);
  const warnings: MemWarning[] = [];
  const s = findSessionById(options.sessionId, f, warnings);
  if (!s) {
    const ambiguous = warnings.some(
      (warning) =>
        warning.code === "ambiguous-session-prefix" ||
        warning.code === "ambiguous-session-id",
    );
    if (!ambiguous && !sessionFileUnreadable(warnings, options.sessionId)) {
      warnings.push({
        code: "session-history-missing",
        message:
          `session ${options.sessionId} has no readable history in this ` +
          "environment. It may not have been written yet. Do not bind a different session.",
      });
    }
    throw new MemSessionNotFoundError(options.sessionId, warnings);
  }

  const grep = typeof options.grep === "string" ? options.grep : undefined;
  const nTurns = options.turns ?? 3;
  const around = options.around ?? 1;
  const maxChars = options.maxChars ?? 6000;

  let turns: DialogueTurn[] = extractDialogue(s, warnings);
  let mergedChildren = 0;
  if (options.includeChildren === true) {
    const all = listAll({ ...f, cwd: undefined, limit: WIDE_LIMIT }, warnings);
    const childIndex = buildChildIndex(all);
    const kids = childIndex.get(s.id) ?? [];
    mergedChildren = kids.length;
    for (const c of kids) {
      turns = [...turns, ...extractDialogue(c, warnings)];
    }
  }

  const selected = selectContextTurns(turns, grep, nTurns, around, maxChars);
  if (!grep && selected.anchor === "before-compaction") {
    const boundary = latestCompactionBoundary(turns);
    let spokenBefore = 0;
    if (boundary !== undefined) {
      for (let i = 0; i < boundary; i++) {
        if (turns[i]?.kind !== "marker") spokenBefore++;
      }
    }
    if (spokenBefore === 0) {
      warnings.push({
        code: "pre-compact-history-missing",
        message:
          "A compaction boundary is present, but no turns before it are in this file. The history may not have been written yet, or this host did not retain pre-compact replies.",
      });
    }
  }

  return {
    session: s,
    query: grep,
    totalTurns: turns.length,
    totalHitTurns: selected.totalHitTurns,
    mergedChildren,
    budgetUsed: selected.budgetUsed,
    maxChars,
    anchor: selected.anchor,
    turns: selected.turns,
    warnings,
  };
}
