/**
 * Local knowledge-lineage marks for Markdown notes.
 *
 * Strict, bounded parsing only — no YAML library and no network. Recognizes
 * `status: superseded` and `superseded_by: <repo-relative path>` in YAML
 * front matter or as ATX-heading / bare lines in a short preamble.
 *
 * An invalid, missing, escaping, or self `superseded_by` target is not
 * followed. `status: superseded` alone still marks the note. One file parse
 * does not walk a successor chain.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { allowedDocPath } from "./docs.js";
import type { LineageFault } from "./types.js";

/** Hard caps so a hostile note cannot force unbounded scanning. */
const MAX_SCAN_CHARS = 8192;
const MAX_PREAMBLE_LINES = 40;
const MAX_PATH_CHARS = 512;

export interface DocLineage {
  /** True when the note is marked superseded by a recognized convention. */
  superseded: boolean;
  /**
   * Repo-relative posix path of the successor when `superseded_by` resolves
   * to a different allowed in-project Markdown file. Omitted otherwise.
   */
  supersededBy?: string;
  /** Why a declared target was not followed. Omitted when the mark is usable. */
  fault?: LineageFault;
}

interface RawMark {
  statusSuperseded: boolean;
  supersededByRaw?: string;
}

function relPosix(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

function sourcePosix(sourceRel: string | undefined): string | undefined {
  if (!sourceRel) return undefined;
  const normalized = sourceRel.split(/[/\\]/).join("/");
  return normalized || undefined;
}

/** Unquoted or simply-quoted scalar; reject anything nested or multi-line. */
function scalar(raw: string): string | undefined {
  const t = raw.trim();
  if (!t || t.length > MAX_PATH_CHARS) return undefined;
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    const inner = t.slice(1, -1);
    if (!inner || /[\r\n]/.test(inner)) return undefined;
    return inner;
  }
  if (/[#:{}[\],]|^\s|\s$/.test(t) || /\s{2,}/.test(t)) return undefined;
  return t;
}

const STATUS_RE = /^(#{1,6}\s+)?status:\s*(.+)$/i;
const SUPERSEDED_BY_RE = /^(#{1,6}\s+)?superseded_by:\s*(.+)$/i;

function applyLine(mark: RawMark, line: string): void {
  // Nested keys stay inside their parent. They do not retarget the whole note.
  if (/^\s/.test(line)) return;
  const trimmed = line.trim();
  if (!trimmed) return;
  const status = STATUS_RE.exec(trimmed);
  if (status) {
    const value = scalar(status[2] ?? "");
    if (value?.toLowerCase() === "superseded") mark.statusSuperseded = true;
    return;
  }
  const by = SUPERSEDED_BY_RE.exec(trimmed);
  if (by) {
    const value = scalar(by[2] ?? "");
    if (value) mark.supersededByRaw = value;
  }
}

/**
 * Parse a bounded front-matter block or preamble for lineage keys only.
 * Unknown keys and malformed lines are skipped.
 */
export function parseLineageMarks(text: string): RawMark {
  const mark: RawMark = { statusSuperseded: false };
  const slice = text.slice(0, MAX_SCAN_CHARS);
  const lines = slice.split(/\r?\n/, MAX_PREAMBLE_LINES + 1);

  let i = 0;
  if (lines[0]?.charCodeAt(0) === 0xfeff) {
    lines[0] = lines[0].slice(1);
  }
  if (lines[0]?.trim() === "---") {
    i = 1;
    for (; i < lines.length && i <= MAX_PREAMBLE_LINES; i++) {
      const line = lines[i] ?? "";
      if (line.trim() === "---") {
        i += 1;
        break;
      }
      applyLine(mark, line);
    }
  }

  for (; i < lines.length && i < MAX_PREAMBLE_LINES; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (STATUS_RE.test(trimmed) || SUPERSEDED_BY_RE.test(trimmed)) {
      applyLine(mark, line);
      continue;
    }
    if (/^#{1,6}\s+superseded\s*$/i.test(trimmed)) continue;
    break;
  }

  return mark;
}

function escapesProject(raw: string): boolean {
  return (
    /:\/\//.test(raw) ||
    raw.startsWith("/") ||
    raw.startsWith("~") ||
    path.isAbsolute(raw) ||
    raw.split(/[/\\]/).includes("..")
  );
}

/**
 * Resolve `superseded_by` to an allowed in-project Markdown path, or ignore it.
 * Does not check self-reference; callers compare the result with the source.
 */
export function resolveSupersededBy(
  root: string,
  raw: string,
): string | undefined {
  if (!raw || raw.length > MAX_PATH_CHARS || escapesProject(raw))
    return undefined;
  const normalized = raw.split(/[/\\]/).join("/");
  if (!normalized || normalized === ".") return undefined;
  const abs = path.resolve(root, normalized);
  const real = allowedDocPath(root, abs);
  if (!real) return undefined;
  try {
    if (!fs.statSync(real).isFile()) return undefined;
  } catch {
    return undefined;
  }
  return relPosix(root, real);
}

/** Parse lineage for one document. Does not read the successor. */
export function parseDocLineage(
  text: string,
  root: string,
  sourceRel?: string,
): DocLineage {
  const mark = parseLineageMarks(text);
  if (!mark.supersededByRaw) {
    return mark.statusSuperseded
      ? { superseded: true }
      : { superseded: false };
  }
  if (escapesProject(mark.supersededByRaw)) {
    return {
      superseded: mark.statusSuperseded,
      fault: "escapes-project",
    };
  }
  const successor = resolveSupersededBy(root, mark.supersededByRaw);
  if (!successor) {
    return {
      superseded: mark.statusSuperseded,
      fault: "missing-target",
    };
  }
  if (successor === sourcePosix(sourceRel)) {
    return {
      superseded: mark.statusSuperseded,
      fault: "self",
    };
  }
  return { superseded: true, supersededBy: successor };
}
