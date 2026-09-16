/**
 * Cognition Devin CLI adapter tests. Fixtures are built with the system
 * python sqlite3 module; the block is skipped when no interpreter is
 * available. This is NOT Trellis `--devin` (Desktop / former Windsurf) and
 * NOT Factory Droid.
 *
 * `node:os` is mocked via `vi.hoisted` so `internal/paths.ts` captures a
 * fake HOME at module load — same contract as `adapters.test.ts`.
 */

import {
  describe,
  it,
  expect,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

import type { MemFilter, MemSessionInfo } from "../../src/mem/types.js";
import {
  findPythonForSqlite,
  runPythonScript,
} from "./sqlite-fixture.js";

const { fakeHome, snapshotTestState } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const f = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const o = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("node:path") as typeof import("node:path");
  const fakeHome = f.mkdtempSync(p.join(o.tmpdir(), "trellis-mem-devin-home-"));
  return {
    fakeHome,
    snapshotTestState: {
      unstablePath: null as string | null,
      mainDbStatReads: 0,
    },
  };
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => fakeHome };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    statSync: (...args: Parameters<typeof actual.statSync>) => {
      const stat = actual.statSync(...args);
      if (String(args[0]) !== snapshotTestState.unstablePath) return stat;
      snapshotTestState.mainDbStatReads += 1;
      if (snapshotTestState.mainDbStatReads % 2 !== 0) return stat;

      const changed = Object.create(stat) as typeof stat;
      Object.defineProperty(changed, "mtimeMs", {
        value: stat.mtimeMs + snapshotTestState.mainDbStatReads,
      });
      return changed;
    },
  };
});

const { HOME, devinCliDataDir, devinCliDbPath } =
  await import("../../src/mem/internal/paths.js");
const {
  devinListSessions,
  devinExtractDialogue,
  devinSearch,
  collectDevinTurnsAndEvents,
  prepareDevinSessionStore,
  releaseDevinSessionStore,
} = await import("../../src/mem/adapters/devin.js");

function mkFilter(overrides: Partial<MemFilter> = {}): MemFilter {
  return { platform: "all", limit: 50, cwd: undefined, ...overrides };
}

function rimraf(p: string): void {
  nodeFs.rmSync(p, { recursive: true, force: true });
}

afterAll(() => {
  rimraf(fakeHome);
});

const DEVIN_PY = findPythonForSqlite();

function runPython(script: string): void {
  runPythonScript(fakeHome, DEVIN_PY, script);
}

interface DevinFixture {
  sessions?: {
    id: string;
    working_directory?: string;
    title?: string;
    created_at?: number;
    last_activity_at?: number;
    main_chain_id?: number | null;
    hidden?: number;
  }[];
  nodes?: {
    session_id: string;
    node_id: number;
    parent_node_id?: number | null;
    created_at?: number;
    chat: Record<string, unknown>;
  }[];
  walSessions?: { id: string; working_directory?: string; title?: string }[];
  dbPath?: string;
}

function buildDevinDb(spec: DevinFixture): void {
  const dbPath = spec.dbPath ?? devinCliDbPath();
  if (!dbPath) throw new Error("devin db path unresolved");
  nodeFs.mkdirSync(nodePath.dirname(dbPath), { recursive: true });
  const useWal = (spec.walSessions?.length ?? 0) > 0;
  runPython(`
import sqlite3, json, os
db_path = ${JSON.stringify(dbPath)}
for suffix in ("", "-wal", "-shm"):
    if os.path.exists(db_path + suffix):
        os.remove(db_path + suffix)
db = sqlite3.connect(db_path)
${useWal ? 'db.execute("PRAGMA journal_mode=WAL")\ndb.execute("PRAGMA wal_autocheckpoint=0")' : ""}
db.execute("""CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  working_directory TEXT NOT NULL,
  backend_type TEXT NOT NULL DEFAULT 'windsurf',
  model TEXT NOT NULL DEFAULT '',
  agent_mode TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  title TEXT,
  main_chain_id INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0
)""")
db.execute("""CREATE TABLE message_nodes (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  node_id INTEGER NOT NULL,           -- node_id within this session's forest
  parent_node_id INTEGER,             -- NULL for root nodes
  chat_message TEXT NOT NULL,
  created_at INTEGER NOT NULL
)""")
spec = json.loads(${JSON.stringify(JSON.stringify(spec))})
for s in spec.get("sessions", []):
    db.execute(
        "INSERT INTO sessions (id,working_directory,created_at,last_activity_at,title,main_chain_id,hidden) VALUES (?,?,?,?,?,?,?)",
        (s["id"], s.get("working_directory", "/p"),
         s.get("created_at", 1700000000), s.get("last_activity_at", 1700000100),
         s.get("title"), s.get("main_chain_id"), s.get("hidden", 0)))
for n in spec.get("nodes", []):
    db.execute(
        "INSERT INTO message_nodes (session_id,node_id,parent_node_id,chat_message,created_at) VALUES (?,?,?,?,?)",
        (n["session_id"], n["node_id"], n.get("parent_node_id"),
         json.dumps(n["chat"]), n.get("created_at", 1700000000)))
db.commit()
for s in spec.get("walSessions", []):
    db.execute(
        "INSERT INTO sessions (id,working_directory,created_at,last_activity_at,title,main_chain_id,hidden) VALUES (?,?,?,?,?,?,?)",
        (s["id"], s.get("working_directory", "/p"), 1700000200, 1700000300,
         s.get("title"), None, 0))
db.commit()
${
  useWal
    ? "# Skip db.close(): python checkpoints the WAL on close.\nos._exit(0)"
    : "db.close()"
}
`);
}

function rimrafDevinDb(): void {
  const dbPath = devinCliDbPath();
  if (dbPath) {
    for (const ext of ["", "-wal", "-shm"]) {
      try {
        nodeFs.rmSync(dbPath + ext, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  nodeFs.rmSync(nodePath.join(fakeHome, ".local"), {
    recursive: true,
    force: true,
  });
}

function userChat(content: string): Record<string, unknown> {
  return {
    role: "user",
    content,
    metadata: { is_user_input: true },
  };
}

function asstChat(
  content: string,
  toolCalls?: { name: string; arguments: Record<string, unknown> }[],
): Record<string, unknown> {
  return {
    role: "assistant",
    content,
    thinking: { text: "secret chain of thought" },
    ...(toolCalls ? { tool_calls: toolCalls } : {}),
  };
}

function dvSession(
  id: string,
  overrides: Partial<MemSessionInfo> = {},
): MemSessionInfo {
  const dbPath = devinCliDbPath();
  if (!dbPath) throw new Error("devin db path unresolved");
  return { platform: "devin", id, filePath: dbPath, ...overrides };
}

describe.skipIf(!DEVIN_PY)("devin adapter", () => {
  const savedEnv = {
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    DEVIN_DB_PATH: process.env.DEVIN_DB_PATH,
    APPDATA: process.env.APPDATA,
  };

  beforeEach(() => {
    delete process.env.XDG_DATA_HOME;
    delete process.env.DEVIN_DB_PATH;
    process.env.APPDATA = nodePath.join(fakeHome, "AppData", "Roaming");
    rimrafDevinDb();
  });

  afterEach(() => {
    releaseDevinSessionStore();
    rimrafDevinDb();
    if (savedEnv.XDG_DATA_HOME === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = savedEnv.XDG_DATA_HOME;
    if (savedEnv.DEVIN_DB_PATH === undefined) delete process.env.DEVIN_DB_PATH;
    else process.env.DEVIN_DB_PATH = savedEnv.DEVIN_DB_PATH;
    if (savedEnv.APPDATA === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = savedEnv.APPDATA;
  });

  it("defaults the data dir to <home>/.local/share/devin/cli on unix", () => {
    if (process.platform === "win32") return;
    expect(devinCliDataDir()).toBe(
      nodePath.join(fakeHome, ".local", "share", "devin", "cli"),
    );
    expect(devinCliDbPath()).toBe(
      nodePath.join(devinCliDataDir(), "sessions.db"),
    );
  });

  it("honours XDG_DATA_HOME", () => {
    if (process.platform === "win32") return;
    process.env.XDG_DATA_HOME = nodePath.join(fakeHome, "xdg-data");
    expect(devinCliDataDir()).toBe(
      nodePath.join(fakeHome, "xdg-data", "devin", "cli"),
    );
  });

  it("resolves nothing when DEVIN_DB_PATH is :memory: and expands ~ / relative names", () => {
    process.env.DEVIN_DB_PATH = ":memory:";
    expect(devinCliDbPath()).toBeUndefined();
    expect(devinListSessions(mkFilter())).toEqual([]);

    const absolute = nodePath.join(fakeHome, "elsewhere", "custom.db");
    process.env.DEVIN_DB_PATH = absolute;
    expect(devinCliDbPath()).toBe(absolute);

    process.env.DEVIN_DB_PATH = "custom.db";
    expect(devinCliDbPath()).toBe(nodePath.join(devinCliDataDir(), "custom.db"));

    process.env.DEVIN_DB_PATH = "~/elsewhere/custom.db";
    expect(devinCliDbPath()).toBe(
      nodePath.join(HOME, "elsewhere", "custom.db"),
    );
  });

  it("returns [] with no warning when this machine has no Devin store", () => {
    const warnings: { code: string; message: string }[] = [];
    expect(devinListSessions(mkFilter(), warnings)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("lists sessions with id/title/cwd/unix-second timestamps/db path and skips hidden", () => {
    buildDevinDb({
      sessions: [
        {
          id: "glimmer-dish",
          working_directory: "/proj/a",
          title: "parent chat",
          created_at: 1700000000,
          last_activity_at: 1700000100,
          main_chain_id: 1,
        },
        {
          id: "hidden-one",
          working_directory: "/proj/a",
          title: "removed",
          hidden: 1,
        },
      ],
    });
    const rows = devinListSessions(mkFilter({ cwd: undefined }));
    expect(rows.map((r) => r.id)).toEqual(["glimmer-dish"]);
    expect(rows[0]).toEqual({
      platform: "devin",
      id: "glimmer-dish",
      title: "parent chat",
      cwd: "/proj/a",
      created: new Date(1700000000 * 1000).toISOString(),
      updated: new Date(1700000100 * 1000).toISOString(),
      filePath: devinCliDbPath(),
    });
  });

  it("filters by --cwd", () => {
    buildDevinDb({
      sessions: [
        { id: "s1", working_directory: "/proj/a" },
        { id: "s2", working_directory: "/proj/b" },
      ],
    });
    expect(
      devinListSessions(mkFilter({ cwd: "/proj/a" })).map((r) => r.id),
    ).toEqual(["s1"]);
  });

  it("sees sessions committed only to the WAL", () => {
    buildDevinDb({
      sessions: [{ id: "in_main", working_directory: "/proj/a" }],
      walSessions: [{ id: "in_wal", working_directory: "/proj/a" }],
    });
    const dbPath = devinCliDbPath();
    expect(dbPath && nodeFs.existsSync(dbPath + "-wal")).toBe(true);
    const ids = devinListSessions(mkFilter({ cwd: undefined }))
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual(["in_main", "in_wal"]);
  });

  it("never writes to the database it reads", () => {
    const dbPath = devinCliDbPath();
    if (!dbPath) throw new Error("devin db path unresolved");
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 1 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("hi"),
        },
      ],
    });
    const before = nodeFs.readFileSync(dbPath);
    devinListSessions(mkFilter({ cwd: undefined }));
    devinExtractDialogue(dvSession("s1"));
    devinSearch(dvSession("s1"), "hi");
    expect(nodeFs.readFileSync(dbPath).equals(before)).toBe(true);
  });

  it("extracts user/assistant text, dropping tool/system/thinking and non-user-input", () => {
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 5 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 0,
          parent_node_id: null,
          chat: { role: "system", content: "<system_info>env</system_info>" },
        },
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: 0,
          chat: userChat("why is the hook failing"),
        },
        {
          session_id: "s1",
          node_id: 2,
          parent_node_id: 1,
          chat: asstChat("the hook times out", [
            { name: "read", arguments: { path: "a.ts" } },
          ]),
        },
        {
          session_id: "s1",
          node_id: 3,
          parent_node_id: 2,
          chat: { role: "tool", content: "file contents should vanish" },
        },
        {
          session_id: "s1",
          node_id: 4,
          parent_node_id: 3,
          chat: {
            role: "user",
            content: "Conversation to summarize: ...",
            metadata: {},
          },
        },
        {
          session_id: "s1",
          node_id: 5,
          parent_node_id: 4,
          chat: asstChat("still here"),
        },
      ],
    });
    const turns = devinExtractDialogue(dvSession("s1"));
    expect(turns).toEqual([
      { role: "user", text: "why is the hook failing" },
      { role: "assistant", text: "the hook times out" },
      { role: "assistant", text: "still here" },
    ]);
    expect(turns.some((t) => t.text.includes("secret chain"))).toBe(false);
    expect(turns.some((t) => t.text.includes("vanish"))).toBe(false);
  });

  it("walks main_chain_id and drops fork side branches", () => {
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 6 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 0,
          parent_node_id: null,
          chat: { role: "system", content: "boot" },
        },
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: 0,
          chat: userChat("hello"),
        },
        {
          session_id: "s1",
          node_id: 2,
          parent_node_id: 1,
          chat: asstChat("hi"),
        },
        {
          session_id: "s1",
          node_id: 3,
          parent_node_id: 2,
          chat: userChat("fork A should disappear"),
        },
        {
          session_id: "s1",
          node_id: 4,
          parent_node_id: 3,
          chat: asstChat("on A"),
        },
        {
          session_id: "s1",
          node_id: 5,
          parent_node_id: 2,
          chat: userChat("fork B kept"),
        },
        {
          session_id: "s1",
          node_id: 6,
          parent_node_id: 5,
          chat: asstChat("on B"),
        },
      ],
    });
    const turns = devinExtractDialogue(dvSession("s1"));
    expect(turns.map((t) => t.text)).toEqual([
      "hello",
      "hi",
      "fork B kept",
      "on B",
    ]);
  });

  it("returns empty + warning when main_chain_id is null instead of walking max(node_id)", () => {
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: null }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("would be kept if guessed"),
        },
        {
          session_id: "s1",
          node_id: 99,
          parent_node_id: 1,
          chat: userChat("abandoned fork at max id"),
        },
      ],
    });
    const warnings: { code: string; message: string }[] = [];
    expect(devinExtractDialogue(dvSession("s1"), warnings)).toEqual([]);
    expect(warnings[0]?.code).toBe("devin-main-chain-missing");
    expect(warnings[0]?.message).toContain("s1");
  });

  it("warns schema-unsupported when parent_node_id is missing from message_nodes", () => {
    const dbPath = devinCliDbPath();
    if (!dbPath) throw new Error("devin db path unresolved");
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 1 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("hi"),
        },
      ],
    });
    runPython(
      `import sqlite3\ndb = sqlite3.connect(${JSON.stringify(dbPath)})\ndb.execute("ALTER TABLE message_nodes RENAME COLUMN parent_node_id TO parent")\ndb.commit()\ndb.close()\n`,
    );
    const warnings: { code: string; message: string }[] = [];
    expect(devinExtractDialogue(dvSession("s1"), warnings)).toEqual([]);
    expect(warnings[0]?.code).toBe("devin-db-schema-unsupported");
    expect(warnings[0]?.message).toContain("parent_node_id");
  });

  it("warns schema-unsupported when main_chain_id is missing from sessions on extract", () => {
    const dbPath = devinCliDbPath();
    if (!dbPath) throw new Error("devin db path unresolved");
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 1 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("hi"),
        },
      ],
    });
    runPython(
      `import sqlite3\ndb = sqlite3.connect(${JSON.stringify(dbPath)})\ndb.execute("ALTER TABLE sessions RENAME COLUMN main_chain_id TO tip")\ndb.commit()\ndb.close()\n`,
    );
    const warnings: { code: string; message: string }[] = [];
    expect(devinListSessions(mkFilter({ cwd: undefined }), warnings)).toHaveLength(
      1,
    );
    expect(warnings).toEqual([]);
    expect(devinExtractDialogue(dvSession("s1"), warnings)).toEqual([]);
    expect(warnings[0]?.code).toBe("devin-db-schema-unsupported");
    expect(warnings[0]?.message).toContain("main_chain_id");
  });

  it("returns only the requested session's turns", () => {
    buildDevinDb({
      sessions: [
        { id: "s1", working_directory: "/p", main_chain_id: 1 },
        { id: "s2", working_directory: "/p", main_chain_id: 1 },
      ],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("alpha only"),
        },
        {
          session_id: "s2",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("beta leak"),
        },
      ],
    });
    expect(devinExtractDialogue(dvSession("s1")).map((t) => t.text)).toEqual([
      "alpha only",
    ]);
  });

  it("keeps pre-compaction turns and marks the summary node", () => {
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 4 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("old-secret should remain"),
        },
        {
          session_id: "s1",
          node_id: 2,
          parent_node_id: 1,
          chat: asstChat("old reply"),
        },
        {
          session_id: "s1",
          node_id: 3,
          parent_node_id: 2,
          chat: {
            role: "system",
            content: "summary of earlier work",
            metadata: {
              extensions: {
                "devin-rs/summary": { source: "async_file_compactor" },
              },
            },
          },
        },
        {
          session_id: "s1",
          node_id: 4,
          parent_node_id: 3,
          chat: userChat("after compact retained"),
        },
      ],
    });
    const session = dvSession("s1");
    const extracted = devinExtractDialogue(session);
    expect(extracted.map((t) => t.text)).toEqual([
      "old-secret should remain",
      "old reply",
      extracted[2]?.text ?? "",
      "after compact retained",
    ]);
    expect(extracted[2]?.kind).toBe("marker");
    expect(extracted[2]?.text).toContain("[compaction boundary]");
    expect(extracted[2]?.text).toContain("summary of earlier work");
    expect(devinSearch(session, "old-secret").count).toBe(1);
    expect(devinSearch(session, "old-secret").totalTurns).toBe(3);
  });

  it("collects task.py events from exec tool_calls", () => {
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 2 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("go"),
        },
        {
          session_id: "s1",
          node_id: 2,
          parent_node_id: 1,
          created_at: 1700000002,
          chat: asstChat("working", [
            {
              name: "exec",
              arguments: {
                command:
                  'py ./.trellis/scripts/task.py create "my task" --slug my-task',
              },
            },
            {
              name: "exec",
              arguments: {
                command:
                  "py ./.trellis/scripts/task.py start .trellis/tasks/01-01-my-task",
              },
            },
          ]),
        },
      ],
    });
    const { events, turns } = collectDevinTurnsAndEvents(dvSession("s1"));
    expect(turns).toEqual([
      { role: "user", text: "go" },
      { role: "assistant", text: "working" },
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]?.action).toBe("create");
    expect(events[0]?.slug).toBe("my-task");
    expect(events[0]?.turnIndex).toBe(1);
    expect(events[1]?.action).toBe("start");
    expect(events[1]?.taskDir).toContain("my-task");
    expect(events[1]?.turnIndex).toBe(1);
  });

  it("drops bootstrap turns (large INSTRUCTIONS block)", () => {
    const huge = "<INSTRUCTIONS>" + "x".repeat(4500);
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 2 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat(huge),
        },
        {
          session_id: "s1",
          node_id: 2,
          parent_node_id: 1,
          chat: asstChat("real reply"),
        },
      ],
    });
    expect(devinExtractDialogue(dvSession("s1"))).toEqual([
      { role: "assistant", text: "real reply" },
    ]);
  });

  it("degrades an out-of-range timestamp to no timestamp instead of throwing", () => {
    buildDevinDb({
      sessions: [
        {
          id: "s_bad",
          working_directory: "/p",
          created_at: 9e15,
          last_activity_at: 9e15,
        },
        {
          id: "s_ok",
          working_directory: "/p",
          created_at: 1700000000,
          last_activity_at: 1700000100,
        },
      ],
    });
    const rows = devinListSessions(mkFilter({ cwd: undefined }));
    expect(rows.map((r) => r.id).sort()).toEqual(["s_bad", "s_ok"]);
    expect(rows.find((r) => r.id === "s_bad")?.created).toBeUndefined();
  });

  it("degrades to [] when the db file is corrupt", () => {
    const dbPath = devinCliDbPath();
    if (!dbPath) throw new Error("devin db path unresolved");
    nodeFs.mkdirSync(nodePath.dirname(dbPath), { recursive: true });
    nodeFs.writeFileSync(dbPath, "not a sqlite file");
    const warnings: { code: string; message: string }[] = [];
    expect(devinListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
      [],
    );
    expect(devinExtractDialogue(dvSession("anything"), warnings)).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("devin-db-unreadable");
  });

  it("warns with devin-db-schema-unsupported when a required table is gone", () => {
    const dbPath = devinCliDbPath();
    if (!dbPath) throw new Error("devin db path unresolved");
    buildDevinDb({ sessions: [{ id: "s1", working_directory: "/p" }] });
    runPython(
      `import sqlite3\ndb = sqlite3.connect(${JSON.stringify(dbPath)})\ndb.execute("DROP TABLE sessions")\ndb.commit()\ndb.close()\n`,
    );
    const warnings: { code: string; message: string }[] = [];
    expect(devinListSessions(mkFilter({ cwd: undefined }), warnings)).toEqual(
      [],
    );
    expect(warnings[0]?.code).toBe("devin-db-schema-unsupported");
    expect(warnings[0]?.message).toContain("sessions");
  });

  it("fails closed with a retry warning when the snapshot stays unstable", () => {
    const dbPath = devinCliDbPath();
    if (!dbPath) throw new Error("devin db path unresolved");
    buildDevinDb({ sessions: [{ id: "s1", working_directory: "/p" }] });
    try {
      snapshotTestState.unstablePath = dbPath;
      snapshotTestState.mainDbStatReads = 0;
      const warnings: { code: string; message: string }[] = [];
      expect(
        devinListSessions(mkFilter({ cwd: undefined }), warnings),
      ).toEqual([]);
      expect(warnings[0]?.code).toBe("devin-db-snapshot-unstable");
    } finally {
      snapshotTestState.unstablePath = null;
      snapshotTestState.mainDbStatReads = 0;
    }
  });

  it("search hits user/assistant turns via the prepared store", () => {
    const dbPath = devinCliDbPath();
    if (!dbPath) throw new Error("devin db path unresolved");
    buildDevinDb({
      sessions: [{ id: "s1", working_directory: "/p", main_chain_id: 2 }],
      nodes: [
        {
          session_id: "s1",
          node_id: 1,
          parent_node_id: null,
          chat: userChat("find the hook bug"),
        },
        {
          session_id: "s1",
          node_id: 2,
          parent_node_id: 1,
          chat: asstChat("the hook is here"),
        },
      ],
    });
    const warnings: { code: string; message: string }[] = [];
    prepareDevinSessionStore(dbPath, warnings);
    try {
      const hit = devinSearch(dvSession("s1"), "hook", warnings);
      expect(hit.count).toBeGreaterThanOrEqual(2);
      expect(hit.userCount).toBe(1);
      expect(hit.asstCount).toBe(1);
    } finally {
      releaseDevinSessionStore();
    }
  });
});
