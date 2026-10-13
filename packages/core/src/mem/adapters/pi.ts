/**
 * Persisted Pi Agent session reader.
 *
 * Layout: `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<id>.jsonl`
 * for the default store, or direct `.jsonl` files under an env/settings
 * configured custom session directory. Entries form a tree via `id` / `parentId`;
 * extraction follows the whole active branch (last entry leaf).
 *
 * Compaction: Pi writes a `compaction` entry naming the first entry it kept.
 * That is Pi's context rule, not a record of what was said — every earlier
 * entry is still on the active path. Extraction keeps the full path and renders
 * the compaction entry as a boundary marker in place.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  compactionBoundaryTurn,
  stripInjectionTags,
  isBootstrapTurn,
} from "../dialogue.js";
import { inRangeOverlap, sameProject } from "../filter.js";
import { readJsonl, readJsonlFirst } from "../internal/jsonl.js";
import {
  PI_AGENT_DIR,
  piProjectDirFromCwd,
  piSessionRoots,
  walkDir,
} from "../internal/paths.js";
import { parseTaskPyCommandsAll } from "../phase.js";
import { searchInDialogue } from "../search.js";
import type {
  DialogueRole,
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  SearchHit,
  TaskPyEvent,
} from "../types.js";

// ---------- loose external shapes ----------

interface PiContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: unknown;
  arguments?: unknown;
  data?: unknown;
}

interface PiMessage {
  role?: string;
  content?: string | PiContentBlock[];
  command?: unknown;
  summary?: unknown;
  fromId?: unknown;
  timestamp?: unknown;
}

interface PiEntry {
  type?: string;
  version?: number;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  cwd?: string;
  message?: PiMessage;
  summary?: string;
  firstKeptEntryId?: string;
  tokensBefore?: number;
  name?: string;
  content?: string | PiContentBlock[];
  customType?: string;
  display?: boolean;
  fromId?: string;
}

interface PiBuilt {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
}

// ---------- list ----------

export function piListSessions(f: MemFilter): MemSessionInfo[] {
  const out: MemSessionInfo[] = [];
  for (const filePath of candidateFiles(f)) {
    const header = readJsonlFirst<PiEntry>(filePath);
    if (header?.type !== "session") continue;

    const id = typeof header.id === "string" ? header.id : idFromFile(filePath);
    const cwd = typeof header.cwd === "string" ? header.cwd : undefined;
    if (f.cwd && !sameProject(cwd, f.cwd)) continue;

    let title: string | undefined;
    let lastActivityMs: number | undefined;
    readJsonl<PiEntry>(filePath, (entry) => {
      if (entry.type === "session_info") {
        title =
          typeof entry.name === "string" && entry.name.trim()
            ? entry.name.trim()
            : undefined;
        return;
      }
      if (entry.type !== "message") return;
      const role = entry.message?.role;
      if (role !== "user" && role !== "assistant") return;
      const activityMs =
        timestampMs(entry.message?.timestamp) ?? timestampMs(entry.timestamp);
      if (activityMs !== undefined)
        lastActivityMs = Math.max(lastActivityMs ?? 0, activityMs);
    });

    let updated: string | undefined;
    try {
      updated =
        lastActivityMs !== undefined
          ? new Date(lastActivityMs).toISOString()
          : fs.statSync(filePath).mtime.toISOString();
    } catch {
      updated =
        lastActivityMs !== undefined
          ? new Date(lastActivityMs).toISOString()
          : undefined;
    }
    const created =
      typeof header.timestamp === "string" ? header.timestamp : undefined;
    if (!inRangeOverlap(created, updated, f)) continue;

    out.push({
      platform: "pi",
      id,
      title,
      cwd,
      created,
      updated,
      filePath,
    });
  }
  return out;
}

function candidateFiles(f: MemFilter): string[] {
  const defaultRoot = path.join(PI_AGENT_DIR, "sessions");
  const seen = new Set<string>();
  const out: string[] = [];

  const pushJsonlFiles = (root: string): void => {
    if (!fs.existsSync(root)) return;
    for (const file of walkDir(root)) {
      if (!file.endsWith(".jsonl")) continue;
      const normalized = path.resolve(file);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(file);
    }
  };

  for (const root of piSessionRoots(f.cwd)) {
    if (f.cwd && path.resolve(root) === path.resolve(defaultRoot)) {
      // Fast path: the project dir derived from the cwd. The encoding is
      // ambiguous when the cwd is (or contains) a symlink — `/tmp` vs
      // `/private/tmp` produce different names — so fall back to scanning the
      // whole store; `piListSessions` then scopes by `sameProject`.
      const derived = piProjectDirFromCwd(f.cwd);
      if (fs.existsSync(derived)) pushJsonlFiles(derived);
      else pushJsonlFiles(root);
    } else {
      pushJsonlFiles(root);
    }
  }
  return out;
}

function idFromFile(filePath: string): string {
  const base = path.basename(filePath, ".jsonl");
  const underscore = base.indexOf("_");
  return underscore === -1 ? base : base.slice(underscore + 1);
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

// ---------- extract/search/phase ----------

export function piExtractDialogue(s: MemSessionInfo): DialogueTurn[] {
  return buildPiTurnsAndEvents(s).turns;
}

export function piSearch(s: MemSessionInfo, kw: string): SearchHit {
  return searchInDialogue(piExtractDialogue(s), kw);
}

export function collectPiTurnsAndEvents(s: MemSessionInfo): PiBuilt {
  return buildPiTurnsAndEvents(s);
}

function buildPiTurnsAndEvents(s: MemSessionInfo): PiBuilt {
  const activePath = piActivePath(s.filePath);
  const turns: DialogueTurn[] = [];
  const events: TaskPyEvent[] = [];

  for (const entry of activePath) {
    collectTaskEvents(entry, turns.length, events);
    const turn = turnFromEntry(entry);
    if (turn) turns.push(turn);
  }

  return { turns, events };
}

/** Walk parent links back from the last entry — the branch the session ended
 * on, in chronological order. No compaction truncation: a `compaction` entry is
 * Pi's context rule, and the entries it excluded are still on this path. */
function piActivePath(filePath: string): PiEntry[] {
  const entries: PiEntry[] = [];
  readJsonl<PiEntry>(filePath, (entry) => {
    if (entry.type === "session") return;
    if (typeof entry.id !== "string") return;
    entries.push(entry);
  });
  if (entries.length === 0) return [];

  const byId = new Map<string, PiEntry>();
  for (const entry of entries) {
    if (typeof entry.id === "string") byId.set(entry.id, entry);
  }

  const leaf = entries[entries.length - 1];
  if (!leaf) return [];
  const activePath: PiEntry[] = [];
  let current: PiEntry | undefined = leaf;
  const seen = new Set<string>();
  while (current) {
    if (typeof current.id !== "string" || seen.has(current.id)) break;
    seen.add(current.id);
    activePath.unshift(current);
    current =
      typeof current.parentId === "string"
        ? byId.get(current.parentId)
        : undefined;
  }
  return activePath;
}

function turnFromEntry(entry: PiEntry): DialogueTurn | null {
  if (entry.type === "compaction") {
    return compactionBoundary(entry.summary);
  }
  if (entry.type === "branch_summary") {
    return syntheticTurn("[branch summary]", entry.summary);
  }
  if (entry.type === "custom_message") {
    return buildTurn("user", entry.content);
  }
  if (entry.type !== "message") return null;

  const msg = entry.message;
  if (!msg) return null;
  switch (msg.role) {
    case "user":
      return buildTurn("user", msg.content);
    case "assistant":
      return buildTurn("assistant", msg.content);
    case "custom":
      return buildTurn("user", msg.content);
    case "branchSummary":
      return syntheticTurn("[branch summary]", msg.summary);
    case "compactionSummary":
      return compactionBoundary(msg.summary);
    default:
      return null;
  }
}

function compactionBoundary(raw: unknown): DialogueTurn {
  const summary = typeof raw === "string" ? stripInjectionTags(raw) : "";
  return compactionBoundaryTurn(
    "context compacted here; the turns above stayed on the active branch",
    summary,
  );
}

function syntheticTurn(prefix: string, raw: unknown): DialogueTurn | null {
  if (typeof raw !== "string") return null;
  const text = stripInjectionTags(raw);
  if (!text) return null;
  return { role: "user", text: `${prefix}\n${text}` };
}

function buildTurn(
  role: DialogueRole,
  content: string | PiContentBlock[] | undefined,
): DialogueTurn | null {
  const parts: string[] = [];
  let totalRaw = 0;

  if (typeof content === "string") {
    totalRaw = content.length;
    const cleaned = stripInjectionTags(content);
    if (cleaned) parts.push(cleaned);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type !== "text" || typeof block.text !== "string") continue;
      totalRaw += block.text.length;
      const cleaned = stripInjectionTags(block.text);
      if (cleaned) parts.push(cleaned);
    }
  }

  if (parts.length === 0) return null;
  const merged = parts.join("\n\n");
  if (isBootstrapTurn(merged, totalRaw)) return null;
  return { role, text: merged };
}

function collectTaskEvents(
  entry: PiEntry,
  turnIndex: number,
  events: TaskPyEvent[],
): void {
  if (entry.type !== "message") return;
  const msg = entry.message;
  if (!msg) return;

  if (msg.role === "bashExecution" && typeof msg.command === "string") {
    pushTaskEvents(msg.command, entry.timestamp, turnIndex, events);
    return;
  }

  if (msg.role !== "assistant" || !Array.isArray(msg.content)) return;
  for (const block of msg.content) {
    if (block.type !== "toolCall") continue;
    if (typeof block.name !== "string") continue;
    const toolName = block.name.toLowerCase();
    if (toolName !== "bash" && toolName !== "shell") continue;
    const args = block.arguments;
    if (!args || typeof args !== "object" || Array.isArray(args)) continue;
    const command = (args as { command?: unknown }).command;
    if (typeof command !== "string") continue;
    pushTaskEvents(command, entry.timestamp, turnIndex, events);
  }
}

function pushTaskEvents(
  command: string,
  timestamp: string | undefined,
  turnIndex: number,
  events: TaskPyEvent[],
): void {
  const parsedAll = parseTaskPyCommandsAll(command);
  for (const parsed of parsedAll) {
    const ev: TaskPyEvent = {
      action: parsed.action,
      timestamp: timestamp ?? "",
      turnIndex,
      ...(parsed.action === "create"
        ? { slug: parsed.slug }
        : { taskDir: parsed.taskDir }),
    };
    events.push(ev);
  }
}
