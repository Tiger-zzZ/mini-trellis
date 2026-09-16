/**
 * Shared SQLite adapter kit for mem readers (OpenCode, ZCode, Devin CLI).
 *
 * Schema contract, structured warnings, one-slot prepare/release, and a
 * scan visitor that never retains raw rows. Platform files own path, table
 * mapping, and dialogue cleaning — not another copy of these helpers.
 *
 * Access is always through `sqlite-readonly.ts`. No native module, WASM
 * blob, system `sqlite3`, or `better-sqlite3`.
 */

import * as fs from "node:fs";

import type { MemWarning } from "../types.js";
import {
  openSqliteReadOnly,
  SqliteParseError,
  SqliteSnapshotUnstableError,
  stripSqlLineComments,
  type SqliteReadOnly,
  type SqliteRow,
  type SqliteTableInfo,
} from "./sqlite-readonly.js";

/** Schema mismatch (missing table / column). Distinct from a truncated file. */
export class SqliteSchemaError extends SqliteParseError {
  constructor(message: string) {
    super(message);
    this.name = "SqliteSchemaError";
  }
}

export interface SqliteWarningCopy {
  unreadableCode: string;
  snapshotUnstableCode: string;
  /** Omit for ZCode: schema errors degrade to `unreadableCode`. */
  schemaUnsupportedCode?: string;
  writingMessage: (dbPath: string) => string;
  unreadableMessage: (dbPath: string, error: SqliteParseError) => string;
  unsupportedMessage?: (dbPath: string, error: SqliteParseError) => string;
}

/** Record one degradation per condition per command. */
export function pushSqliteWarning(
  warnings: MemWarning[],
  dbPath: string,
  error: SqliteParseError,
  copy: SqliteWarningCopy,
): void {
  const code =
    error instanceof SqliteSnapshotUnstableError
      ? copy.snapshotUnstableCode
      : error instanceof SqliteSchemaError && copy.schemaUnsupportedCode
        ? copy.schemaUnsupportedCode
        : copy.unreadableCode;
  if (warnings.some((warning) => warning.code === code)) return;

  const message =
    code === copy.snapshotUnstableCode
      ? copy.writingMessage(dbPath)
      : code === copy.schemaUnsupportedCode
        ? (copy.unsupportedMessage?.(dbPath, error) ??
          copy.unreadableMessage(dbPath, error))
        : copy.unreadableMessage(dbPath, error);
  warnings.push({ code, message });
}

export function findTable(db: SqliteReadOnly, name: string): SqliteTableInfo {
  const table = db.listTables().find((item) => item.name === name);
  if (!table) {
    throw new SqliteSchemaError(`missing table: ${name}`);
  }
  return table;
}

/** True when `CREATE TABLE` sql declares a column of this exact name.
 * Line comments (`-- ...`) sit between columns in some live schemas (Devin
 * CLI) and must not hide the next name. */
export function declaresColumn(table: SqliteTableInfo, name: string): boolean {
  const sql = stripSqlLineComments(table.sql);
  const pattern = new RegExp(
    `(?:\\(|,)\\s*["\`\\[]?${name}(?:["\`\\]]|\\b)`,
    "i",
  );
  return pattern.test(sql);
}

export function requireColumns(
  table: SqliteTableInfo,
  names: readonly string[],
): void {
  const missing = names.filter((name) => !declaresColumn(table, name));
  if (missing.length > 0) {
    throw new SqliteSchemaError(
      `table ${table.name} is missing column(s): ${missing.join(", ")}`,
    );
  }
}

export function requireOneOfColumns(
  table: SqliteTableInfo,
  candidates: readonly string[],
): string {
  const found = candidates.find((name) => declaresColumn(table, name));
  if (!found) {
    throw new SqliteSchemaError(
      `table ${table.name} has none of the expected column(s): ${candidates.join(" / ")}`,
    );
  }
  return found;
}

/** Re-check the first decoded row; CREATE TABLE parse and rows can disagree. */
export function requireRowColumns(
  rows: readonly SqliteRow[] | SqliteRow,
  tableName: string,
  names: readonly string[],
): void {
  const first = Array.isArray(rows) ? rows[0] : rows;
  if (!first) return;
  const missing = names.filter((name) => !(name in first));
  if (missing.length > 0) {
    throw new SqliteSchemaError(
      `table ${tableName} is missing column(s): ${missing.join(", ")}`,
    );
  }
}

/** Visit every row and always return false so `scanTable` retains nothing. */
export function scanAndDiscard(
  db: SqliteReadOnly,
  tableName: string,
  visit: (row: SqliteRow) => void,
): void {
  db.scanTable(tableName, (row) => {
    visit(row);
    return false;
  });
}

export function withSqliteDb<T>(
  dbPath: string,
  warnings: MemWarning[],
  copy: SqliteWarningCopy,
  fallback: T,
  run: (db: SqliteReadOnly) => T,
): T {
  if (!fs.existsSync(dbPath)) return fallback;
  try {
    const db = openSqliteReadOnly(dbPath);
    try {
      return run(db);
    } finally {
      db.close();
    }
  } catch (error) {
    if (!(error instanceof SqliteParseError)) throw error;
    pushSqliteWarning(warnings, dbPath, error, copy);
    return fallback;
  }
}

/** One-slot search-scoped store. Extract reuses it when the path matches. */
export function createSqlitePreparedStore<T>(): {
  prepare: (dbPath: string, load: () => T) => void;
  release: () => void;
  get: (dbPath: string) => T | undefined;
} {
  let slot: { dbPath: string; store: T } | null = null;
  return {
    prepare(dbPath, load) {
      slot = { dbPath, store: load() };
    },
    release() {
      slot = null;
    },
    get(dbPath) {
      return slot?.dbPath === dbPath ? slot.store : undefined;
    },
  };
}
