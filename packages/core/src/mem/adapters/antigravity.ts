import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compactionBoundaryTurn,
  isBootstrapTurn,
  stripInjectionTags,
} from "../dialogue.js";
import { inRangeOverlap, sessionInProject } from "../filter.js";
import { findInJsonl, readJsonl } from "../internal/jsonl.js";
import { antigravityAppDataDirs } from "../internal/paths.js";
import {
  findTable,
  requireColumns,
  scanAndDiscard,
  withSqliteDb,
  type SqliteWarningCopy,
} from "../internal/sqlite-adapter.js";
import { searchInDialogue } from "../search.js";
import { parseTaskPyCommandsAll } from "../phase.js";
import type {
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  MemWarning,
  SearchHit,
  TaskPyEvent,
} from "../types.js";

const TABLE = "conversation_summaries";
const SQLITE_WARNINGS: SqliteWarningCopy = {
  unreadableCode: "antigravity-db-unreadable",
  snapshotUnstableCode: "antigravity-db-snapshot-unstable",
  writingMessage: (file) =>
    `Antigravity is writing to its session database; retry in a moment (${file})`,
  unreadableMessage: (file, error) =>
    `cannot read Antigravity session database (${file}): ${error.message}`,
};

interface Step {
  type?: string;
  created_at?: string;
  content?: string;
  tool_calls?: {
    name?: string;
    args?: { CommandLine?: string; command?: string; cmd?: string };
  }[];
}

function isoTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match =
    /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(\.\d+)?\s*(Z|[+-]\d\d:?\d\d)?$/i.exec(
      value.trim(),
    );
  if (!match) return undefined;
  const ms = Date.parse(
    `${match[1]}T${match[2]}${match[3]?.slice(0, 4) ?? ""}${match[4] ?? "Z"}`,
  );
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function workspacePaths(value: unknown): string[] {
  if (typeof value !== "string") return [];
  let uris: unknown;
  try {
    uris = JSON.parse(value);
  } catch {
    return [];
  }
  const paths = new Set<string>();
  if (Array.isArray(uris)) {
    for (const uri of uris) {
      if (typeof uri !== "string") continue;
      try {
        const cwd = /^file:/i.test(uri) ? fileURLToPath(uri) : uri;
        if (path.isAbsolute(cwd) && !cwd.includes("\0"))
          paths.add(path.resolve(cwd));
      } catch {
        /* Skip a malformed URI without losing the other workspaces. */
      }
    }
  }
  return [...paths];
}

function readableTranscript(
  root: string,
  id: string,
): { filePath: string; mtime: string } | undefined {
  const logs = path.join(root, "brain", id, ".system_generated", "logs");
  for (const name of ["transcript_full.jsonl", "transcript.jsonl"]) {
    const filePath = path.join(logs, name);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      fs.accessSync(filePath, fs.constants.R_OK);
      return { filePath, mtime: stat.mtime.toISOString() };
    } catch {
      /* Try the shorter transcript when the full one is unavailable. */
    }
  }
  return undefined;
}

export function antigravityListSessions(
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo[] {
  const sessions = new Map<string, MemSessionInfo>();
  for (const root of antigravityAppDataDirs()) {
    const listed = withSqliteDb<MemSessionInfo[]>(
      path.join(root, TABLE + ".db"),
      warnings,
      SQLITE_WARNINGS,
      [],
      (db) => {
        requireColumns(findTable(db, TABLE), [
          "conversation_id",
          "title",
          "workspace_uris",
          "parent_conversation_id",
          "last_modified_time",
        ]);
        const rows: MemSessionInfo[] = [];
        scanAndDiscard(db, TABLE, (row) => {
          const id = row.conversation_id;
          if (
            typeof id !== "string" ||
            !id ||
            /[/\\\0]/.test(id) ||
            id === "." ||
            id === ".." ||
            sessions.has(id)
          )
            return;
          const transcript = readableTranscript(root, id);
          if (!transcript) return;
          const cwds = workspacePaths(row.workspace_uris);
          rows.push({
            platform: "antigravity",
            id,
            cwd: cwds[0],
            ...(cwds.length > 1 ? { cwds } : {}),
            filePath: transcript.filePath,
            updated: isoTime(row.last_modified_time) ?? transcript.mtime,
            title:
              typeof row.title === "string"
                ? row.title.trim() || undefined
                : undefined,
            ...(typeof row.parent_conversation_id === "string" &&
            row.parent_conversation_id
              ? { parent_id: row.parent_conversation_id }
              : {}),
          });
        });
        return rows;
      },
    );
    for (const session of listed) sessions.set(session.id, session);
  }
  return [...sessions.values()].filter((session) => {
    if (!sessionInProject(session, f.cwd)) return false;
    try {
      const first = findInJsonl<Step>(
        session.filePath,
        (step) => !!isoTime(step.created_at),
        Infinity,
      );
      session.created = isoTime(first?.created_at);
    } catch {
      warnings.push({
        code: "session-history-unreadable",
        message: `cannot read session history ${session.filePath}`,
      });
      return false;
    }
    return inRangeOverlap(session.created, session.updated, f);
  });
}

export function collectAntigravityTurnsAndEvents(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): { turns: DialogueTurn[]; events: TaskPyEvent[] } {
  const turns: DialogueTurn[] = [];
  const events: TaskPyEvent[] = [];
  readJsonl<Step>(
    s.filePath,
    (step) => {
      const content = typeof step.content === "string" ? step.content : "";
      if (step.type === "USER_INPUT") {
        const request =
          /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i.exec(content)?.[1] ??
          content.replace(
            /<(ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|SYSTEM_MESSAGE)>[\s\S]*?<\/\1>/gi,
            "",
          );
        const text = stripInjectionTags(request);
        if (text && !isBootstrapTurn(text, request.length))
          turns.push({ role: "user", text });
      } else if (step.type === "PLANNER_RESPONSE") {
        if (Array.isArray(step.tool_calls)) {
          for (const call of step.tool_calls) {
            if (call?.name !== "run_command") continue;
            const args = call.args;
            const command = args?.CommandLine ?? args?.command ?? args?.cmd;
            if (typeof command !== "string") continue;
            for (const parsed of parseTaskPyCommandsAll(command)) {
              events.push({
                action: parsed.action,
                turnIndex: turns.length,
                timestamp: isoTime(step.created_at) ?? "",
                ...(parsed.action === "create"
                  ? { slug: parsed.slug }
                  : { taskDir: parsed.taskDir }),
              });
            }
          }
        }
        const text = stripInjectionTags(content);
        if (text) turns.push({ role: "assistant", text });
      } else if (step.type === "CHECKPOINT") {
        turns.push(
          compactionBoundaryTurn(
            "context compacted here; the turns above are the conversation Antigravity summarized",
            stripInjectionTags(content),
          ),
        );
      }
    },
    warnings,
  );
  return { turns, events };
}

export function antigravityExtractDialogue(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): DialogueTurn[] {
  return collectAntigravityTurnsAndEvents(s, warnings).turns;
}

export function antigravitySearch(
  s: MemSessionInfo,
  keyword: string,
  warnings?: MemWarning[],
): SearchHit {
  return searchInDialogue(antigravityExtractDialogue(s, warnings), keyword);
}
