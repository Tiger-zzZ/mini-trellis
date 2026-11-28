/**
 * Shared helpers for SQLite adapter fixture tests. Python's stdlib `sqlite3`
 * builds WAL-capable fixture databases; no native addon and no `sqlite3` CLI.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

/** Detect a python launcher with the sqlite3 stdlib module. */
export function findPythonForSqlite(): string[] | null {
  const { execFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:child_process") as typeof import("node:child_process");
  const candidates =
    process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ["-c", "import sqlite3"], { stdio: "ignore" });
      return [cmd];
    } catch {
      /* next */
    }
  }
  return null;
}

/** Run a python program from a temp file (avoids `-c` quoting limits). */
export function runPythonScript(
  fakeHome: string,
  sqlitePy: string[] | null,
  script: string,
): void {
  const pyCmd = sqlitePy?.[0];
  if (!pyCmd) throw new Error("python unavailable");
  const { execFileSync } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:child_process") as typeof import("node:child_process");
  const pyDir = nodeFs.mkdtempSync(nodePath.join(fakeHome, "py-oc-"));
  const pyFile = nodePath.join(pyDir, "fixture.py");
  nodeFs.writeFileSync(pyFile, script);
  try {
    execFileSync(pyCmd, [pyFile], {
      stdio: "ignore",
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    nodeFs.rmSync(pyDir, { recursive: true, force: true });
  }
}

/** Leave committed index rows in the WAL, as an active Antigravity host does. */
export function writeAntigravityIndex(
  root: string,
  rows: readonly (readonly [id: string, workspaces: string[], parent?: string, updated?: string])[],
): void {
  nodeFs.mkdirSync(root, { recursive: true });
  runPythonScript(root, findPythonForSqlite(), `
import json, os, sqlite3
db = sqlite3.connect(${JSON.stringify(nodePath.join(root, "conversation_summaries.db"))})
db.execute("PRAGMA journal_mode=WAL")
db.execute("CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, title TEXT, workspace_uris TEXT, parent_conversation_id TEXT, last_modified_time TEXT)")
db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
for row in json.loads(${JSON.stringify(JSON.stringify(rows))}):
    session, paths, parent, updated = (row + [None, None])[:4]
    db.execute("INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?)", (session, "Title " + session, json.dumps(paths), parent, updated))
db.commit()
os._exit(0)
`);
}
