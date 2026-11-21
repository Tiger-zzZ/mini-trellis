/**
 * Persisted Factory Droid session reader.
 *
 * Layout: `~/.factory/sessions/<cwd-with-separators-as-dashes>/<id>.jsonl`.
 * Line 1 is a `session_start` header (`id`, `title`, `cwd`, and
 * `callingSessionId` for Task subagent sessions). `message` records carry
 * Anthropic-style content blocks and form a tree through `parentId`.
 *
 * Visibility: real turns have no `visibility` (or `both`). `llm_only` records
 * are host injections (reminders, skill bodies, hook context) and `user_only`
 * records are UI notices; neither is dialogue.
 *
 * Compaction: Droid keeps every earlier message in the file and appends a
 * `compaction_state` record with `summaryText`. That record becomes a boundary
 * marker in file order. `provider_switch_serialization` is a model-switch
 * re-encoding, not a user-visible compaction, and gets no marker.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  compactionBoundaryTurn,
  isBootstrapTurn,
  stripInjectionTags,
} from "../dialogue.js";
import { inRangeOverlap, sameProject } from "../filter.js";
import { findInJsonl, readJsonl, readJsonlFirst } from "../internal/jsonl.js";
import { DROID_SESSIONS, droidProjectDirName } from "../internal/paths.js";
import { parseTaskPyCommandsAll } from "../phase.js";
import { searchInDialogue } from "../search.js";
import type {
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  MemWarning,
  SearchHit,
  TaskPyEvent,
} from "../types.js";

// ---------- loose external shapes ----------

interface DroidBlock {
  type?: string;
  text?: string;
  name?: unknown;
  input?: unknown;
}

interface DroidMessage {
  role?: string;
  content?: string | (DroidBlock | null)[];
  visibility?: string;
}

interface DroidRecord {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  title?: string;
  cwd?: string;
  callingSessionId?: string;
  message?: DroidMessage;
  summaryKind?: string;
  summaryText?: string;
}

// ---------- list ----------

export function droidListSessions(
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo[] {
  const out: MemSessionInfo[] = [];
  for (const filePath of candidateFiles(f)) {
    const fallbackId = path.basename(filePath, ".jsonl");
    try {
      const header = readJsonlFirst<DroidRecord>(filePath);
      if (header?.type !== "session_start") continue;
      const cwd = typeof header.cwd === "string" ? header.cwd : undefined;
      if (f.cwd && !sameProject(cwd, f.cwd)) continue;

      const first = findInJsonl<DroidRecord>(
        filePath,
        (o) => o.type === "message" && typeof o.timestamp === "string",
        50,
      );
      const created = first?.timestamp;
      const updated = fs.statSync(filePath).mtime.toISOString();
      if (!inRangeOverlap(created, updated, f)) continue;

      const title =
        typeof header.title === "string" && header.title.trim()
          ? header.title.trim()
          : undefined;
      out.push({
        platform: "droid",
        id: typeof header.id === "string" ? header.id : fallbackId,
        title,
        cwd,
        created,
        updated,
        filePath,
        ...(typeof header.callingSessionId === "string" &&
        header.callingSessionId
          ? { parent_id: header.callingSessionId }
          : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push({
        code: "session-history-unreadable",
        message: `cannot read session ${fallbackId} (${filePath}): ${message}`,
      });
    }
  }
  return out;
}

function listDirs(root: string): string[] {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Under `--cwd`, read only the project dir and its descendants' dirs. When
 * the encoding does not match (symlinked cwd, Windows drive letters), scan
 * every dir; `sameProject` on the header cwd still scopes the result. */
function candidateFiles(f: MemFilter): string[] {
  const all = listDirs(DROID_SESSIONS);
  let dirs = all;
  if (f.cwd) {
    const derived = droidProjectDirName(f.cwd);
    const scoped = all.filter(
      (name) => name === derived || name.startsWith(`${derived}-`),
    );
    if (scoped.length > 0) dirs = scoped;
  }
  const files: string[] = [];
  for (const dir of dirs) {
    const abs = path.join(DROID_SESSIONS, dir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".jsonl"))
        files.push(path.join(abs, e.name));
    }
  }
  return files;
}

// ---------- extract ----------

function isDialogueMessage(msg: DroidMessage | undefined): boolean {
  if (!msg) return false;
  if (msg.visibility === "llm_only" || msg.visibility === "user_only")
    return false;
  return msg.role === "user" || msg.role === "assistant";
}

function textOf(content: DroidMessage["content"]): {
  text: string;
  rawLength: number;
} {
  if (typeof content === "string")
    return { text: stripInjectionTags(content), rawLength: content.length };
  if (!Array.isArray(content)) return { text: "", rawLength: 0 };
  const parts: string[] = [];
  let rawLength = 0;
  for (const block of content) {
    if (block?.type !== "text" || typeof block.text !== "string") continue;
    rawLength += block.text.length;
    const cleaned = stripInjectionTags(block.text);
    if (cleaned) parts.push(cleaned);
  }
  return { text: parts.join("\n\n"), rawLength };
}

/**
 * Message ids on the branch the session ended on. The leaf is the last
 * dialogue message, so a trailing UI notice cannot hide the conversation.
 */
function activeMessageIds(records: DroidRecord[]): Set<string> {
  const byId = new Map<string, DroidRecord>();
  let leaf: DroidRecord | undefined;
  for (const r of records) {
    if (r.type !== "message" || typeof r.id !== "string") continue;
    byId.set(r.id, r);
    if (isDialogueMessage(r.message)) leaf = r;
  }
  const ids = new Set<string>();
  while (leaf?.id && !ids.has(leaf.id)) {
    ids.add(leaf.id);
    leaf = leaf.parentId ? byId.get(leaf.parentId) : undefined;
  }
  return ids;
}

function buildDroidTurnsAndEvents(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): { turns: DialogueTurn[]; events: TaskPyEvent[] } {
  const records: DroidRecord[] = [];
  readJsonl<DroidRecord>(
    s.filePath,
    (r) => {
      if (r.type === "message" || r.type === "compaction_state")
        records.push(r);
    },
    warnings,
  );
  const active = activeMessageIds(records);
  const turns: DialogueTurn[] = [];
  const events: TaskPyEvent[] = [];
  let precedingMessage: string | undefined;

  for (const r of records) {
    if (r.type === "compaction_state") {
      // Unlinked compaction records summarize the branch at their position in the log.
      const anchor = r.parentId ?? precedingMessage;
      if (
        !anchor ||
        !active.has(anchor) ||
        r.summaryKind === "provider_switch_serialization"
      )
        continue;
      turns.push(
        compactionBoundaryTurn(
          "context compacted here; the turns above are the conversation Droid summarized",
          typeof r.summaryText === "string"
            ? stripInjectionTags(r.summaryText)
            : undefined,
        ),
      );
      continue;
    }
    precedingMessage = r.id;
    if (!r.id || !active.has(r.id)) continue;
    const msg = r.message;
    if (!msg || !isDialogueMessage(msg)) continue;

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type !== "tool_use" || block.name !== "Execute") continue;
        const input = block.input;
        if (!input || typeof input !== "object") continue;
        const command = (input as { command?: unknown }).command;
        if (typeof command !== "string") continue;
        for (const parsed of parseTaskPyCommandsAll(command)) {
          events.push({
            action: parsed.action,
            timestamp: r.timestamp ?? "",
            turnIndex: turns.length,
            ...(parsed.action === "create"
              ? { slug: parsed.slug }
              : { taskDir: parsed.taskDir }),
          });
        }
      }
    }

    const { text, rawLength } = textOf(msg.content);
    if (!text) continue;
    if (msg.role === "user" && isBootstrapTurn(text, rawLength)) continue;
    turns.push({ role: msg.role === "user" ? "user" : "assistant", text });
  }
  return { turns, events };
}

export function droidExtractDialogue(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): DialogueTurn[] {
  return buildDroidTurnsAndEvents(s, warnings).turns;
}

export function droidSearch(
  s: MemSessionInfo,
  kw: string,
  warnings?: MemWarning[],
): SearchHit {
  return searchInDialogue(droidExtractDialogue(s, warnings), kw);
}

export function collectDroidTurnsAndEvents(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): { turns: DialogueTurn[]; events: TaskPyEvent[] } {
  return buildDroidTurnsAndEvents(s, warnings);
}
