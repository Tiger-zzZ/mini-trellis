/**
 * ZCode (Zhipu) persisted-session reader.
 *
 * ZCode stores sessions in a SQLite database at `~/.zcode/cli/db/db.sqlite`
 * (WAL mode). The three tables this adapter reads are:
 *
 *   - `session`  — id / title / directory (workspace cwd) / time_created /
 *                  time_updated / task_type
 *   - `message`  — id / session_id / time_created / data (JSON: {role, ...})
 *   - `part`     — message_id / time_created / data (JSON: {type, text|tool, ...})
 *                  plus compaction markers that replace earlier dialogue with
 *                  a summary message.
 *
 * The older `~/.zcode/v2/sessions/*.json` layout is abandoned by current ZCode,
 * and `~/.zcode/cli/rollout/*.jsonl` is a non-persistent model-IO stream that
 * gets cleaned up periodically — neither is read here. SQLite is the single
 * complete source of truth (see `docs-hlaia/06-...` for the investigation).
 *
 * SQLite access is via the zero-dependency parser in `internal/sqlite-readonly.ts`
 * — `better-sqlite3` was rejected because its native build chain broke npm
 * install on Windows for the OpenCode adapter.
 */

import {
  compactionBoundaryTurn,
  stripInjectionTags,
  isBootstrapTurn,
} from "../dialogue.js";
import { inRangeOverlap, sameProject } from "../filter.js";
import {
  createSqlitePreparedStore,
  findTable,
  requireColumns,
  requireRowColumns,
  withSqliteDb,
  type SqliteWarningCopy,
} from "../internal/sqlite-adapter.js";
import { type SqliteRow } from "../internal/sqlite-readonly.js";
import { ZCODE_DB } from "../internal/paths.js";
import { parseTaskPyCommandsAll } from "../phase.js";
import { searchInDialogue } from "../search.js";
import type {
  DialogueRole,
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  MemWarning,
  SearchHit,
  TaskPyEvent,
} from "../types.js";

// ---------- loose external shapes ----------

interface ZcodeMessageData {
  role?: string;
}

interface ZcodeTextPart {
  type?: string;
  text?: string;
}

interface ZcodeToolPart {
  type?: string;
  tool?: string;
  state?: { input?: { command?: string } };
}

interface ZcodePartData {
  type?: string;
  text?: string;
  tool?: string;
  state?: { input?: { command?: string } };
  summaryMessageId?: unknown;
  tail_start_id?: unknown;
  compactBoundary?: unknown;
}

function parseDialogueRole(v: unknown): DialogueRole | undefined {
  return v === "user" || v === "assistant" ? v : undefined;
}

/** Safely parse the JSON stored in a `data` column. Returns null on failure. */
function parseDataJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ---------- shared scan helpers ----------

interface ZcodeMessageRow {
  id: string;
  time_created: number;
  role: DialogueRole;
}

interface ZcodePartRow {
  message_id: string;
  time_created: number;
  data: Record<string, unknown>;
}

/**
 * All sessions' messages + parts read from one db, grouped by session id.
 * This full-db shape is used only by the search-scoped store; extract/context
 * paths instead scan and retain just the requested session's rows.
 */
interface ZcodeSessionStore {
  /** sessionId → that session's messages in time order. */
  messagesBySession: Map<string, ZcodeMessageRow[]>;
  /** messageId → that message's parts in time order (across all sessions). */
  partsByMsg: Map<string, ZcodePartRow[]>;
}

const SQLITE_WARNINGS: SqliteWarningCopy = {
  unreadableCode: "zcode-db-unreadable",
  snapshotUnstableCode: "zcode-db-snapshot-unstable",
  writingMessage: (dbPath) => `ZCode 正在写入，请重试。 (${dbPath})`,
  unreadableMessage: (dbPath, error) =>
    `cannot read ZCode session database (${dbPath}): ${error.message}`,
};

function emptySessionStore(): ZcodeSessionStore {
  return { messagesBySession: new Map(), partsByMsg: new Map() };
}

function scanMessagesAndParts(
  db: Parameters<typeof findTable>[0],
  sessionId: string | undefined,
): ZcodeSessionStore {
  const messageTable = findTable(db, "message");
  requireColumns(messageTable, ["id", "session_id", "data"]);
  const partTable = findTable(db, "part");
  requireColumns(partTable, ["message_id", "data"]);

  const messages =
    sessionId === undefined
      ? db.scanTable("message")
      : db.scanTable("message", (row) => row.session_id === sessionId);
  requireRowColumns(messages, "message", ["id", "session_id", "data"]);

  let parts: SqliteRow[];
  if (sessionId === undefined) {
    parts = db.scanTable("part");
  } else {
    const messageIds = new Set(
      messages
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string"),
    );
    parts = db.scanTable(
      "part",
      (row) =>
        typeof row.message_id === "string" && messageIds.has(row.message_id),
    );
  }
  requireRowColumns(parts, "part", ["message_id", "data"]);
  return buildSessionStore(messages, parts);
}

function buildSessionStore(
  allMessages: readonly SqliteRow[],
  allParts: readonly SqliteRow[],
): ZcodeSessionStore {
  const messagesBySession = new Map<string, ZcodeMessageRow[]>();
  for (const row of allMessages) {
    const sessionId = typeof row.session_id === "string" ? row.session_id : "";
    if (!sessionId) continue;
    const data = parseDataJson(row.data) as ZcodeMessageData | null;
    const role = parseDialogueRole(data?.role);
    if (!role) continue;
    const tc = typeof row.time_created === "number" ? row.time_created : 0;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const list = messagesBySession.get(sessionId) ?? [];
    list.push({ id, time_created: tc, role });
    messagesBySession.set(sessionId, list);
  }
  for (const list of messagesBySession.values()) {
    list.sort((a, b) => a.time_created - b.time_created);
  }

  const partsByMsg = new Map<string, ZcodePartRow[]>();
  for (const row of allParts) {
    const msgId = typeof row.message_id === "string" ? row.message_id : "";
    if (!msgId) continue;
    const data = parseDataJson(row.data);
    if (!data) continue;
    const tc = typeof row.time_created === "number" ? row.time_created : 0;
    const list = partsByMsg.get(msgId) ?? [];
    list.push({ message_id: msgId, time_created: tc, data });
    partsByMsg.set(msgId, list);
  }
  for (const list of partsByMsg.values()) {
    list.sort((a, b) => a.time_created - b.time_created);
  }

  return { messagesBySession, partsByMsg };
}

/** Search-scoped whole-db store. It is explicitly prepared/released by the
 * orchestrator; one-session extract/context calls never populate it. */
const preparedStore = createSqlitePreparedStore<ZcodeSessionStore>();

function loadSessionStore(
  dbPath: string,
  warnings: MemWarning[],
  sessionId?: string,
): ZcodeSessionStore {
  return withSqliteDb(
    dbPath,
    warnings,
    SQLITE_WARNINGS,
    emptySessionStore(),
    (db) => scanMessagesAndParts(db, sessionId),
  );
}

export function prepareZcodeSessionStore(
  dbPath: string,
  warnings: MemWarning[],
): void {
  preparedStore.prepare(dbPath, () => loadSessionStore(dbPath, warnings));
}

export function releaseZcodeSessionStore(): void {
  preparedStore.release();
}

/** Read one session with row filtering unless a search-scoped whole-db store
 * has been prepared by the orchestrator. */
function readSessionMessages(
  dbPath: string,
  sessionId: string,
  warnings: MemWarning[],
): { messages: ZcodeMessageRow[]; partsByMsg: Map<string, ZcodePartRow[]> } {
  const prepared = preparedStore.get(dbPath);
  if (prepared) {
    return {
      messages: prepared.messagesBySession.get(sessionId) ?? [],
      partsByMsg: prepared.partsByMsg,
    };
  }
  const store = loadSessionStore(dbPath, warnings, sessionId);
  return {
    messages: store.messagesBySession.get(sessionId) ?? [],
    partsByMsg: store.partsByMsg,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCompactionSummaryPart(data: Record<string, unknown>): boolean {
  return (
    data.type === "compaction" &&
    (typeof data.tail_start_id === "string" || isRecord(data.compactBoundary))
  );
}

function compactionMarkerSummaryId(
  data: Record<string, unknown>,
): string | undefined {
  return data.type === "compaction" &&
    data.replace === true &&
    typeof data.summaryMessageId === "string"
    ? data.summaryMessageId
    : undefined;
}

/**
 * ZCode compaction writes two markers:
 * - an assistant marker with `replace: true` and `summaryMessageId`
 * - a summary message carrying text plus a `compaction` part with
 *   `tail_start_id` / `compactBoundary`
 *
 * Those say where ZCode cut its own context. The summarized messages are still
 * rows in the same database, so extraction keeps them and renders each summary
 * message as a boundary marker in place.
 */
function compactSummaryMessageIds(
  messages: readonly ZcodeMessageRow[],
  partsByMsg: Map<string, ZcodePartRow[]>,
): Set<string> {
  const summaryIds = new Set<string>();
  const markerSummaryIds = new Set<string>();

  for (const msg of messages) {
    if (markerSummaryIds.has(msg.id)) summaryIds.add(msg.id);
    for (const part of partsByMsg.get(msg.id) ?? []) {
      const markerSummaryId = compactionMarkerSummaryId(part.data);
      if (markerSummaryId) markerSummaryIds.add(markerSummaryId);
      if (isCompactionSummaryPart(part.data)) {
        summaryIds.add(msg.id);
        break;
      }
    }
  }
  return summaryIds;
}

function buildTextTurn(
  msg: ZcodeMessageRow,
  parts: readonly ZcodePartRow[],
  compactSummaryIds: ReadonlySet<string>,
): DialogueTurn | null {
  const collected: string[] = [];
  let totalRaw = 0;
  for (const part of parts) {
    const pd = part.data as ZcodePartData;
    if (pd.type !== "text") continue;
    const txt = typeof pd.text === "string" ? pd.text : "";
    if (!txt) continue;
    totalRaw += txt.length;
    collected.push(stripInjectionTags(txt));
  }
  if (!collected.length) return null;

  const merged = collected.join("\n\n");
  if (compactSummaryIds.has(msg.id)) {
    return compactionBoundaryTurn(
      "context compacted here; the turns above are still in the ZCode database",
      merged,
    );
  }
  if (isBootstrapTurn(merged, totalRaw)) return null;
  return merged.trim() ? { role: msg.role, text: merged } : null;
}

// ---------- list ----------

export function zcodeListSessions(
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo[] {
  const rows = withSqliteDb(
    ZCODE_DB,
    warnings,
    SQLITE_WARNINGS,
    null as SqliteRow[] | null,
    (db) => {
      const table = findTable(db, "session");
      requireColumns(table, [
        "id",
        "directory",
        "time_created",
        "time_updated",
      ]);
      const scanned = db.scanTable("session");
      requireRowColumns(scanned, "session", [
        "id",
        "directory",
        "time_created",
        "time_updated",
      ]);
      return scanned;
    },
  );
  if (!rows) return [];

  const out: MemSessionInfo[] = [];
  for (const row of rows) {
    // `subagent_child` sessions are sub-agent conversations (Explore/research
    // dispatches). Exclude them from the default list — they are noise for
    // daily-review workflows, which care about the user's interactive sessions.
    // They are excluded across list/search/extract; relax this filter if a
    // future workflow needs to inspect sub-agent runs.
    const taskType = typeof row.task_type === "string" ? row.task_type : "";
    if (taskType === "subagent_child") continue;

    const directory =
      typeof row.directory === "string" ? row.directory : undefined;
    if (f.cwd && !sameProject(directory, f.cwd)) continue;

    const created = toIso(row.time_created);
    const updated = toIso(row.time_updated) ?? created;
    if (!inRangeOverlap(created, updated, f)) continue;

    out.push({
      platform: "zcode",
      id: typeof row.id === "string" ? row.id : "",
      title: typeof row.title === "string" ? row.title : undefined,
      cwd: directory,
      created,
      updated,
      filePath: ZCODE_DB,
    });
  }
  return out;
}

function toIso(epochMs: unknown): string | undefined {
  return typeof epochMs === "number" && epochMs > 0
    ? new Date(epochMs).toISOString()
    : undefined;
}

// ---------- extract ----------

/**
 * Build cleaned dialogue turns from a session's messages + parts. Each message
 * is one turn; its text is the concatenation of its `text`-typed parts after
 * injection-tag stripping. Messages with no surviving text are dropped.
 */
export function zcodeExtractDialogue(
  s: MemSessionInfo,
  warnings: MemWarning[] = [],
): DialogueTurn[] {
  const { messages, partsByMsg } = readSessionMessages(
    s.filePath,
    s.id,
    warnings,
  );
  const summaryIds = compactSummaryMessageIds(messages, partsByMsg);
  const turns: DialogueTurn[] = [];

  for (const msg of messages) {
    const parts = partsByMsg.get(msg.id) ?? [];
    const turn = buildTextTurn(msg, parts, summaryIds);
    if (turn) turns.push(turn);
  }
  return turns;
}

export function zcodeSearch(
  s: MemSessionInfo,
  kw: string,
  warnings: MemWarning[] = [],
): SearchHit {
  return searchInDialogue(zcodeExtractDialogue(s, warnings), kw);
}

// ---------- phase slicing (task.py boundary detection) ----------

/**
 * Single pass over messages + parts. Emits both the cleaned dialogue turns and
 * the list of `task.py create|start` invocations found in `Bash` tool parts
 * (`{type:"tool", tool:"Bash", state:{input:{command:"..."}}}`). `turnIndex`
 * for each event is the turn count at the time the tool ran.
 *
 * Compaction: ZCode writes a summary message with a `compaction` part carrying
 * `tail_start_id` / `compactBoundary`. The summarized messages remain in the
 * database, so they stay in the turn pool and the summary message becomes a
 * boundary marker — `task.py` boundaries from before a compaction keep pointing
 * at turns that are still there.
 *
 * turnIndex note (differs slightly from claude/codex): in ZCode a message's
 * text parts and tool parts are siblings within one message. This loop pushes
 * the message's text turn *before* recording its tool events, so a tool event
 * on message M has turnIndex = (turns including M's text). claude/codex
 * instead record the event before pushing the text, so their turnIndex is one
 * less. Both are internally self-consistent for brainstorm-window slicing
 * (create and start use the same convention within a platform), so phase
 * boundaries compute correctly. The ZCode ordering reflects real time order
 * (the assistant writes, then the tool runs). Do not "align" this without also
 * adjusting the test expectations.
 */
export function collectZcodeTurnsAndEvents(
  s: MemSessionInfo,
  warnings: MemWarning[] = [],
): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
} {
  const { messages, partsByMsg } = readSessionMessages(
    s.filePath,
    s.id,
    warnings,
  );
  const summaryIds = compactSummaryMessageIds(messages, partsByMsg);
  const turns: DialogueTurn[] = [];
  const events: TaskPyEvent[] = [];

  for (const msg of messages) {
    const parts = partsByMsg.get(msg.id) ?? [];
    // First emit any text the message produced (so turnIndex reflects turns
    // accumulated so far before tool events are recorded).
    const turn = buildTextTurn(msg, parts, summaryIds);
    if (turn) turns.push(turn);

    // Then scan for Bash tool parts carrying task.py commands.
    for (const part of parts) {
      const pd = part.data as ZcodeToolPart;
      if (pd.type !== "tool") continue;
      if (pd.tool !== "Bash" && pd.tool !== "bash") continue;
      const cmd = pd.state?.input?.command;
      if (typeof cmd !== "string" || !cmd) continue;
      const parsedAll = parseTaskPyCommandsAll(cmd);
      const ts = toIso(part.time_created) ?? "";
      for (const parsed of parsedAll) {
        const ev: TaskPyEvent = {
          action: parsed.action,
          timestamp: ts,
          turnIndex: turns.length,
          ...(parsed.action === "create"
            ? { slug: parsed.slug }
            : { taskDir: parsed.taskDir }),
        };
        events.push(ev);
      }
    }
  }

  return { turns, events };
}

/** Re-exported so callers needing loose shapes can import from one place. */
export type { ZcodeTextPart, ZcodeToolPart };
