/**
 * Cognition Devin CLI persisted-session reader.
 *
 * Devin CLI (the terminal agent at `~/.local/bin/devin`, not Devin Desktop /
 * Cascade and not Factory Droid) stores sessions in a WAL-mode SQLite
 * database at `$XDG_DATA_HOME/devin/cli/sessions.db` (see
 * `internal/paths.ts:devinCliDbPath`). Two tables this adapter reads,
 * confirmed against a live Cognition store:
 *
 *   - `sessions` — id / working_directory (cwd) / created_at /
 *                  last_activity_at (Unix seconds) / title / main_chain_id /
 *                  hidden (`/rm-session` soft-delete)
 *   - `message_nodes` — session_id / node_id / parent_node_id / chat_message
 *                  (JSON) / created_at. This is a forest, not a list: walk
 *                  parent pointers from `main_chain_id` to drop fork/revert
 *                  side branches.
 *
 * `chat_message` JSON: `{role, content: string, tool_calls?, thinking?,
 * metadata}`. Roles are `user` / `assistant` / `tool` / `system`. Real
 * user turns have `metadata.is_user_input === true`. Compaction is a
 * `system` node whose `metadata.extensions["devin-rs/summary"]` is set.
 * `exec` tool_calls feed `task.py` phase slicing.
 *
 * SQLite access is via the zero-dependency parser in
 * `internal/sqlite-readonly.ts`. A live store is hundreds of MB of TEXT;
 * `scanTable`'s predicate is used as a visitor that keeps only slim records
 * and always returns false, so the raw JSON is never retained. No native
 * module, WASM blob, system `sqlite3`, or `better-sqlite3` may come back
 * with this adapter.
 *
 * Everything here is read-only: the database is snapshotted and parsed,
 * never opened for write, locked, checkpointed, or copied over.
 */

import {
  compactionBoundaryTurn,
  stripInjectionTags,
  isBootstrapTurn,
} from "../dialogue.js";
import { inRangeOverlap, sameProject } from "../filter.js";
import { devinCliDbPath } from "../internal/paths.js";
import {
  createSqlitePreparedStore,
  findTable,
  requireColumns,
  requireRowColumns,
  scanAndDiscard,
  withSqliteDb,
  type SqliteWarningCopy,
} from "../internal/sqlite-adapter.js";
import { type SqliteReadOnly, type SqliteRow } from "../internal/sqlite-readonly.js";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDataJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseDialogueRole(v: unknown): DialogueRole | undefined {
  return v === "user" || v === "assistant" ? v : undefined;
}

function isSummaryMessage(msg: Record<string, unknown>): boolean {
  const md = msg.metadata;
  if (!isRecord(md)) return false;
  const ext = md.extensions;
  return isRecord(ext) && "devin-rs/summary" in ext;
}

function isUserInput(msg: Record<string, unknown>): boolean {
  const md = msg.metadata;
  return isRecord(md) && md.is_user_input === true;
}

/** Pull `exec` shell commands from an assistant `tool_calls` array. */
function execCommandsFrom(msg: Record<string, unknown>): string[] {
  const calls = msg.tool_calls;
  if (!Array.isArray(calls)) return [];
  const out: string[] = [];
  for (const call of calls) {
    if (!isRecord(call) || call.name !== "exec") continue;
    const args = call.arguments;
    const obj = typeof args === "string"
      ? parseDataJson(args)
      : isRecord(args)
        ? args
        : null;
    if (!obj) continue;
    const cmd = obj.command;
    if (typeof cmd === "string" && cmd) out.push(cmd);
  }
  return out;
}

// ---------- schema contract ----------

const SESSION_TABLE = "sessions";
const NODE_TABLE = "message_nodes";

const SQLITE_WARNINGS: SqliteWarningCopy = {
  unreadableCode: "devin-db-unreadable",
  snapshotUnstableCode: "devin-db-snapshot-unstable",
  schemaUnsupportedCode: "devin-db-schema-unsupported",
  writingMessage: (dbPath) =>
    `Devin CLI is writing to its session database; retry in a moment (${dbPath})`,
  unreadableMessage: (dbPath, error) =>
    `cannot read Devin CLI session database (${dbPath}): ${error.message}`,
  unsupportedMessage: (dbPath, error) =>
    `unsupported Devin CLI session schema (${dbPath}): ${error.message}`,
};

const MAIN_CHAIN_MISSING_WARNING_CODE = "devin-main-chain-missing";

// ---------- slim store ----------

/**
 * One message_nodes row, stripped of the raw `chat_message` JSON (thinking,
 * tool payloads, telemetry). Chain-walk still needs every node_id/parent so
 * fork side-branches can be dropped; dialogue fields are filled only for
 * user/assistant/summary nodes.
 */
interface SlimNode {
  nodeId: number;
  parentNodeId: number | null;
  createdAt: number;
  isSummary?: boolean;
  role?: DialogueRole;
  text?: string;
  execCommands?: string[];
}

interface SessionBundle {
  mainChainId?: number;
  nodes: SlimNode[];
}

interface DevinSessionStore {
  bundles: Map<string, SessionBundle>;
}

function emptySessionStore(): DevinSessionStore {
  return { bundles: new Map() };
}

function bundleOf(
  store: DevinSessionStore,
  sessionId: string,
): SessionBundle {
  const existing = store.bundles.get(sessionId);
  if (existing) return existing;
  const created: SessionBundle = { nodes: [] };
  store.bundles.set(sessionId, created);
  return created;
}

function slimFromChatMessage(
  nodeId: number,
  parentNodeId: number | null,
  createdAt: number,
  raw: unknown,
): SlimNode {
  const msg = parseDataJson(raw);
  if (!msg) {
    return { nodeId, parentNodeId, createdAt };
  }
  if (isSummaryMessage(msg)) {
    const text = typeof msg.content === "string" ? msg.content : "";
    return { nodeId, parentNodeId, createdAt, isSummary: true, text };
  }
  const role = parseDialogueRole(msg.role);
  if (role === "user") {
    if (!isUserInput(msg)) return { nodeId, parentNodeId, createdAt };
    const text = typeof msg.content === "string" ? msg.content : "";
    return { nodeId, parentNodeId, createdAt, role, text };
  }
  if (role === "assistant") {
    const text = typeof msg.content === "string" ? msg.content : "";
    const execCommands = execCommandsFrom(msg);
    return {
      nodeId,
      parentNodeId,
      createdAt,
      role,
      text,
      ...(execCommands.length > 0 ? { execCommands } : {}),
    };
  }
  return { nodeId, parentNodeId, createdAt };
}

/**
 * Parse message_nodes inside the scan visitor and never retain a raw row. A
 * live `chat_message` column is ~200 MB of TEXT; holding it next to the
 * parsed copies is what blew RSS on the Cursor adapter.
 */
function scanMessageNodes(
  db: SqliteReadOnly,
  sessionId: string | undefined,
  store: DevinSessionStore,
): void {
  const table = findTable(db, NODE_TABLE);
  requireColumns(table, [
    "session_id",
    "node_id",
    "parent_node_id",
    "chat_message",
  ]);
  let checkedRowShape = false;

  scanAndDiscard(db, NODE_TABLE, (row) => {
    if (!checkedRowShape) {
      checkedRowShape = true;
      requireRowColumns(row, NODE_TABLE, [
        "session_id",
        "node_id",
        "parent_node_id",
        "chat_message",
      ]);
    }
    const sid = typeof row.session_id === "string" ? row.session_id : "";
    if (!sid) return;
    if (sessionId !== undefined && sid !== sessionId) return;

    const nodeId = asFiniteNumber(row.node_id);
    if (nodeId === undefined) return;
    const parentRaw = row.parent_node_id;
    const parentNodeId =
      parentRaw === null || parentRaw === undefined
        ? null
        : (asFiniteNumber(parentRaw) ?? null);
    const createdAt = asFiniteNumber(row.created_at) ?? 0;

    const bundle = bundleOf(store, sid);
    bundle.nodes.push(
      slimFromChatMessage(nodeId, parentNodeId, createdAt, row.chat_message),
    );
  });
}

function attachMainChainIds(db: SqliteReadOnly, store: DevinSessionStore): void {
  const table = findTable(db, SESSION_TABLE);
  requireColumns(table, ["id", "main_chain_id"]);
  scanAndDiscard(db, SESSION_TABLE, (row) => {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return;
    const bundle = store.bundles.get(id);
    if (bundle) bundle.mainChainId = asFiniteNumber(row.main_chain_id);
  });
}

function loadStore(
  dbPath: string,
  warnings: MemWarning[],
  sessionId?: string,
): DevinSessionStore {
  return withSqliteDb(
    dbPath,
    warnings,
    SQLITE_WARNINGS,
    emptySessionStore(),
    (db) => {
      const store = emptySessionStore();
      scanMessageNodes(db, sessionId, store);
      attachMainChainIds(db, store);
      return store;
    },
  );
}

const preparedStore = createSqlitePreparedStore<DevinSessionStore>();

export function prepareDevinSessionStore(
  dbPath: string,
  warnings: MemWarning[] = [],
): void {
  preparedStore.prepare(dbPath, () => loadStore(dbPath, warnings));
}

export function releaseDevinSessionStore(): void {
  preparedStore.release();
}

function readSessionBundle(
  dbPath: string,
  sessionId: string,
  warnings: MemWarning[],
): SessionBundle {
  const prepared = preparedStore.get(dbPath);
  if (prepared) {
    return prepared.bundles.get(sessionId) ?? { nodes: [] };
  }
  return loadStore(dbPath, warnings, sessionId).bundles.get(sessionId) ?? {
    nodes: [],
  };
}

/**
 * Follow `parent_node_id` from `main_chain_id` back to the root, then reverse
 * so the result is chronological. Missing / unknown tip is not guessed via
 * max(node_id) — that is often an abandoned fork.
 */
function walkMainChain(bundle: SessionBundle): SlimNode[] | "missing-tip" {
  const { nodes } = bundle;
  if (nodes.length === 0) return [];
  const byId = new Map<number, SlimNode>();
  for (const node of nodes) byId.set(node.nodeId, node);
  const tip = bundle.mainChainId;
  if (tip === undefined || !byId.has(tip)) return "missing-tip";

  const chain: SlimNode[] = [];
  const seen = new Set<number>();
  let cur: SlimNode | undefined = byId.get(tip);
  while (cur && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    chain.push(cur);
    if (cur.parentNodeId === null) break;
    cur = byId.get(cur.parentNodeId);
  }
  chain.reverse();
  return chain;
}

// ---------- timestamps ----------

/** Largest absolute time value an ECMAScript Date can represent. */
const MAX_TIME_VALUE = 8.64e15;
/** Epoch values below this are treated as Unix seconds (Devin's unit);
 * larger values are already milliseconds. */
const UNIX_SECONDS_CUTOFF = 1e12;

function toIsoUnix(epoch: unknown): string | undefined {
  if (typeof epoch !== "number" || !Number.isFinite(epoch)) return undefined;
  if (epoch <= 0) return undefined;
  const ms = epoch < UNIX_SECONDS_CUTOFF ? epoch * 1000 : epoch;
  if (ms > MAX_TIME_VALUE) return undefined;
  return new Date(ms).toISOString();
}

// ---------- list ----------

export function devinListSessions(
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo[] {
  const dbPath = devinCliDbPath();
  if (dbPath === undefined) return [];

  const rows = withSqliteDb(
    dbPath,
    warnings,
    SQLITE_WARNINGS,
    null as SqliteRow[] | null,
    (db) => {
      const table = findTable(db, SESSION_TABLE);
      requireColumns(table, ["id", "working_directory", "created_at"]);
      const scanned = db.scanTable(SESSION_TABLE);
      if (scanned[0]) {
        requireRowColumns(scanned[0], SESSION_TABLE, [
          "id",
          "working_directory",
          "created_at",
        ]);
      }
      return scanned;
    },
  );
  if (!rows) return [];

  const out: MemSessionInfo[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const hidden = asFiniteNumber(row.hidden);
    if (hidden !== undefined && hidden !== 0) continue;

    const directory =
      typeof row.working_directory === "string"
        ? row.working_directory
        : undefined;
    if (f.cwd && !sameProject(directory, f.cwd)) continue;

    const created = toIsoUnix(row.created_at);
    const updated = toIsoUnix(row.last_activity_at) ?? created;
    if (!inRangeOverlap(created, updated, f)) continue;

    out.push({
      platform: "devin",
      id,
      title: typeof row.title === "string" ? row.title : undefined,
      cwd: directory,
      created,
      updated,
      filePath: dbPath,
    });
  }
  return out;
}

// ---------- extract / search / phase ----------

function buildTurn(node: SlimNode): DialogueTurn | null {
  if (node.isSummary) {
    return compactionBoundaryTurn(
      "context compacted here; the turns above are still in the Devin CLI database",
      node.text,
    );
  }
  if (!node.role) return null;
  const raw = node.text ?? "";
  if (!raw) return null;
  const cleaned = stripInjectionTags(raw);
  if (!cleaned) return null;
  if (node.role === "user" && isBootstrapTurn(cleaned, raw.length)) return null;
  return { role: node.role, text: cleaned };
}

/**
 * Single pass over the main chain: cleaned dialogue plus `task.py`
 * create/start events from assistant `exec` tool_calls. `turnIndex` is the
 * turn count *before* this node's own text is pushed (Claude/Codex
 * convention: the tool ran as part of producing the next assistant turn).
 */
export function collectDevinTurnsAndEvents(
  s: MemSessionInfo,
  warnings: MemWarning[] = [],
): { turns: DialogueTurn[]; events: TaskPyEvent[] } {
  const bundle = readSessionBundle(s.filePath, s.id, warnings);
  const chain = walkMainChain(bundle);
  if (chain === "missing-tip") {
    if (!warnings.some((w) => w.code === MAIN_CHAIN_MISSING_WARNING_CODE)) {
      warnings.push({
        code: MAIN_CHAIN_MISSING_WARNING_CODE,
        message: `Devin CLI session ${s.id} has no usable main_chain_id; refusing to walk a fork (${s.filePath})`,
      });
    }
    return { turns: [], events: [] };
  }
  const turns: DialogueTurn[] = [];
  const events: TaskPyEvent[] = [];

  for (const node of chain) {
    if (node.execCommands) {
      const ts = toIsoUnix(node.createdAt) ?? "";
      for (const cmd of node.execCommands) {
        for (const parsed of parseTaskPyCommandsAll(cmd)) {
          events.push({
            action: parsed.action,
            timestamp: ts,
            turnIndex: turns.length,
            ...(parsed.action === "create"
              ? { slug: parsed.slug }
              : { taskDir: parsed.taskDir }),
          });
        }
      }
    }
    const turn = buildTurn(node);
    if (turn) turns.push(turn);
  }
  return { turns, events };
}

export function devinExtractDialogue(
  s: MemSessionInfo,
  warnings: MemWarning[] = [],
): DialogueTurn[] {
  return collectDevinTurnsAndEvents(s, warnings).turns;
}

export function devinSearch(
  s: MemSessionInfo,
  kw: string,
  warnings: MemWarning[] = [],
): SearchHit {
  return searchInDialogue(devinExtractDialogue(s, warnings), kw);
}
