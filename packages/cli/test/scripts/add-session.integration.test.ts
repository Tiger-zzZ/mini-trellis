/**
 * Integration test for `add_session.py` auto-commit scope and for the
 * recording state machine (commit evidence, retry convergence, numbering).
 *
 * The python script lives under
 * `src/templates/trellis/scripts/add_session.py`; this test stamps the real
 * templates into a fresh git repo and exercises the actual `python3
 * add_session.py` paths — no source-string assertions.
 *
 * Scope-creep guard (#303): the session auto-commit must stage ONLY the
 * current developer's journal/index + the CURRENT task dir. Dirty changes in
 * OTHER parallel-window task dirs must NOT be bundled into the session commit.
 * This mirrors `task-archive.integration.test.ts`'s "does not bundle dirty
 * changes from other task dirs" for the session route.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDoctorReport } from "../../src/commands/doctor.js";

const TEMPLATE_SCRIPTS = path.resolve(
  __dirname,
  "../../src/templates/trellis/scripts",
);

const DEVELOPER = "tester";

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (rc=${r.status}): ${r.stderr}`,
    );
  }
  return r.stdout.trim();
}

function setupRepo(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });
  git(tmp, "init", "-q", "-b", "main");
  git(tmp, "config", "user.email", "test@example.com");
  git(tmp, "config", "user.name", "Test");
  stampTrellis(tmp);
}

/** Create the `.trellis/` tree and developer state at `tmp`, without git. */
function stampTrellis(tmp: string): void {
  fs.mkdirSync(tmp, { recursive: true });

  // Stamp the real templates into the test repo.
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  // session_auto_commit must be enabled for the session to commit.
  fs.writeFileSync(
    path.join(tmp, ".trellis", "config.yaml"),
    "session_auto_commit: true\n",
  );

  // Initialize the developer (creates .developer, journal-1.md, index.md with
  // the auto-update markers) via the real init script.
  const r = spawnSync(
    "python3",
    [".trellis/scripts/init_developer.py", DEVELOPER],
    { cwd: tmp, encoding: "utf-8" },
  );
  if (r.status !== 0) {
    throw new Error(`init_developer failed: ${r.stderr}`);
  }
}

function makeTask(
  repo: string,
  name: string,
  prdBody: string,
  branch?: string,
): void {
  const dir = path.join(repo, ".trellis", "tasks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prd.md"), prdBody);
  const taskJson: Record<string, unknown> = {
    id: name,
    name,
    title: name,
    status: "in_progress",
    priority: "P2",
    createdAt: "2026-06-18",
    assignee: DEVELOPER,
    creator: DEVELOPER,
    subtasks: [],
    children: [],
    relatedFiles: [],
    meta: {},
  };
  if (branch) {
    taskJson.branch = branch;
  }
  fs.writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify(taskJson) + "\n",
  );
}

/**
 * Point the active-task resolver at `taskName`. With exactly one session file
 * present, `resolve_active_task` uses the single-session fallback, so
 * `get_current_task` returns this task without needing a platform context.
 */
function setCurrentTask(repo: string, taskName: string): void {
  const sessionsDir = path.join(repo, ".trellis", ".runtime", "sessions");
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir, "session.json"),
    JSON.stringify({
      current_task: `.trellis/tasks/${taskName}`,
      platform: "session",
    }) + "\n",
  );
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Run the script and return its outcome without asserting on it. */
function tryAddSession(
  repo: string,
  title: string,
  extraArgs: string[] = [],
): RunResult {
  const r = spawnSync(
    "python3",
    [".trellis/scripts/add_session.py", "--title", title, ...extraArgs],
    { cwd: repo, encoding: "utf-8" },
  );
  return {
    status: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

describe.skipIf(!hasPython())("recording diagnostics", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-record-status-"));
    setupRepo(tmp);
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it.each([
    "missing history",
    "unpaired history",
    "duplicate history",
    "nested blocks",
    "missing table separator",
    "missing active documents",
  ])(
    "reports a checkpoint for %s and retries without duplicating the entry",
    (fault) => {
      const original = readIndex(tmp);
      const start = "<!-- @@@auto:session-history -->";
      const end = "<!-- @@@/auto:session-history -->";
      let broken = original;
      if (fault === "missing history")
        broken = broken.replace(start, "").replace(end, "");
      if (fault === "unpaired history") broken = broken.replace(end, "");
      if (fault === "duplicate history") broken += `\n${start}\n${end}\n`;
      if (fault === "nested blocks")
        broken = broken.replace(
          start,
          start + "\n<!-- @@@auto:current-status -->",
        );
      if (fault === "missing table separator")
        broken = broken.replace("|---|------|-------|---------|--------|", "");
      if (fault === "missing active documents")
        broken = broken.replace("<!-- @@@auto:active-documents -->", "");
      fs.writeFileSync(indexPath(tmp), broken);
      const first = tryAddSession(tmp, "repair me", ["--no-commit"]);
      expect(first.status).toBe(1);
      expect(first.stderr).toContain("[BLOCKED] Checkpoint:");
      expect(first.stderr).not.toContain("and index recorded");
      expect(readIndex(tmp)).toBe(broken);
      expect(sessionNumbers(tmp)).toEqual([1]);
      fs.writeFileSync(indexPath(tmp), original);
      expect(tryAddSession(tmp, "repair me", ["--no-commit"]).status).toBe(0);
      expect(sessionNumbers(tmp)).toEqual([1]);
      expect(readIndex(tmp).match(/^\| 1 \|/gm)).toHaveLength(1);
    },
  );

  it("refuses a same-number row for a different record on retry", () => {
    runAddSession(tmp, "exact identity", ["--no-commit"]);
    fs.writeFileSync(
      indexPath(tmp),
      readIndex(tmp).replace("| exact identity |", "| another record |"),
    );
    const first = tryAddSession(tmp, "exact identity", ["--no-commit"]);
    expect(first.status).toBe(1);
    expect(first.stderr).toMatch(/conflict|different record/i);
    expect(sessionNumbers(tmp)).toEqual([1]);
    fs.writeFileSync(
      indexPath(tmp),
      readIndex(tmp).replace("| another record |", "| exact identity |"),
    );
    expect(tryAddSession(tmp, "exact identity", ["--no-commit"]).status).toBe(
      0,
    );
  });

  it.each(["title", "topic link"])(
    "does not trust a retry marker after its %s was changed",
    (field) => {
      fs.writeFileSync(
        path.join(tmp, "README.md"),
        "# Callback rule\n\nPermanent failures must not retry.\n",
      );
      const args = ["--no-commit", "--topic", "README.md"];
      runAddSession(tmp, "verified identity", args);
      const journal = readJournal(tmp);
      const changed =
        field === "title"
          ? journal.replace(
              "## Session 1: verified identity",
              "## Session 1: unrelated title",
            )
          : journal.replace("../../../README.md", "../../../missing.md");
      expect(changed).not.toBe(journal);
      fs.writeFileSync(journalPath(tmp), changed);
      const result = tryAddSession(tmp, "verified identity", args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("no longer match");
      expect(readJournal(tmp)).toBe(changed);
    },
  );

  it("repairs an older missing row after a later record without rewinding status", () => {
    runAddSession(tmp, "older", ["--no-commit"]);
    runAddSession(tmp, "later", ["--no-commit"]);
    const index = readIndex(tmp);
    fs.writeFileSync(indexPath(tmp), index.replace(/^\| 1 \|.*\n/m, ""));
    expect(tryAddSession(tmp, "older", ["--no-commit"]).status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1, 2]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 2");
    expect(readIndex(tmp)).toContain("| older |");
    expect(readIndex(tmp)).toContain("| later |");
    expect(
      [...readIndex(tmp).matchAll(/^\| (\d+) \|/gm)].map((match) =>
        Number(match[1]),
      ),
    ).toEqual([2, 1]);
  });

  it("records changed topic contents with identical caller prose and keeps an unchanged retry idempotent", () => {
    const topic = path.join(tmp, "README.md");
    fs.writeFileSync(
      topic,
      "# Callbacks\n\nTransient failures allow 2 total attempts.\n",
    );
    const args = [
      "--no-commit",
      "--topic",
      "README.md",
      "--summary",
      "Updated callback policy",
    ];
    runAddSession(tmp, "Callback decision", args);
    const originalMarker = distinctMarkers(tmp)[0];
    runAddSession(tmp, "Callback decision", args);
    expect(sessionNumbers(tmp)).toEqual([1]);
    fs.writeFileSync(
      topic,
      "# Callbacks\n\nOnly idempotent transient failures allow 4 total attempts; permanent failures must not retry.\n",
    );
    runAddSession(tmp, "Callback decision", args);
    runAddSession(tmp, "Callback decision", args);
    expect(sessionNumbers(tmp)).toEqual([1, 2]);
    expect(distinctMarkers(tmp)).toHaveLength(2);
    expect(distinctMarkers(tmp)[0]).toBe(originalMarker);
    expect(distinctMarkers(tmp).every((marker) => marker.includes("v=3"))).toBe(
      true,
    );
    expect(readIndex(tmp).match(/^\| [12] \|/gm)).toHaveLength(2);
  });

  it("rejects duplicate rows and does not trust a missing committed idempotent index", () => {
    seedTask(tmp);
    const args = ["--idempotency-key", "stable"];
    runAddSession(tmp, "committed", args);
    const original = readIndex(tmp);
    const row = original.match(/^\| 1 \|.*$/m)?.[0];
    if (!row) throw new Error("seeded session row is missing");
    fs.writeFileSync(indexPath(tmp), original.replace(row, row + "\n" + row));
    expect(tryAddSession(tmp, "committed", args).status).toBe(1);
    fs.writeFileSync(indexPath(tmp), original.replace(row, ""));
    expect(tryAddSession(tmp, "committed", args).status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(readIndex(tmp).match(/^\| 1 \|/gm)).toHaveLength(1);
  });

  it("detects an index replacement that reports success without persisting its row", () => {
    const result = spawnSync(
      "python3",
      [
        "-c",
        `
import sys
sys.path.insert(0, '.trellis/scripts')
import add_session as m
original = m.write_text_atomic
m.write_text_atomic = lambda path, text: True if path.name == 'index.md' else original(path, text)
sys.exit(m.add_session('verify actual files', auto_commit=False))
`,
      ],
      { cwd: tmp, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("post-write verification");
    expect(result.stderr).toContain("[BLOCKED] Checkpoint:");
    expect(sessionNumbers(tmp)).toEqual([1]);
  });

  it("stops on merged duplicate session numbers even when one index side looks valid", () => {
    runAddSession(tmp, "first worktree", ["--no-commit"]);
    const journal = readJournal(tmp);
    const entry = journal.slice(journal.indexOf("## Session 1:"));
    fs.writeFileSync(
      journalPath(tmp),
      journal +
        "\n" +
        entry
          .replace("first worktree", "second worktree")
          .replace(/fp=[0-9a-f]+/, "fp=0123456789abcdef"),
    );
    const before = readJournal(tmp);
    const result = tryAddSession(tmp, "next record", ["--no-commit"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("duplicate journal session number 1");
    expect(readJournal(tmp)).toBe(before);
  });

  it("does not create a lock or diagnostics through an escaping runtime symlink", () => {
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "trellis-runtime-outside-"),
    );
    try {
      fs.symlinkSync(outside, path.join(tmp, ".trellis/.runtime"), "dir");
      const journal = readJournal(tmp);
      const result = tryAddSession(tmp, "must stay local", ["--no-commit"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("escapes the project");
      expect(fs.readdirSync(outside)).toEqual([]);
      expect(readJournal(tmp)).toBe(journal);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it.each(["index.md", "journal-1.md"])("does not read or replace a symlinked %s", (name) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-record-outside-"));
    const destination = path.join(outside, "private.md");
    try {
      fs.writeFileSync(destination, "Private external content must stay outside.\n");
      const state = path.join(tmp, ".trellis/workspace", DEVELOPER, name);
      fs.unlinkSync(state);
      fs.symlinkSync(destination, state);
      const result = tryAddSession(tmp, "must stay in project", ["--no-commit"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("not a symlink");
      expect(fs.lstatSync(state).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(destination, "utf8")).toBe("Private external content must stay outside.\n");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("bounds lock waiting and releases a killed writer's lock without deleting its file", () => {
    const holder = [
      "import sys,time",
      "from pathlib import Path",
      "sys.path.insert(0, '.trellis/scripts')",
      "from common.recording_lock import recording_lock",
      "with recording_lock(Path.cwd()):",
      "    print('ready', flush=True)",
      "    time.sleep(20)",
    ].join("\n");
    const result = spawnSync(
      "python3",
      [
        "-c",
        `
import subprocess, sys
from pathlib import Path
sys.path.insert(0, '.trellis/scripts')
from common.recording_lock import recording_lock
child = subprocess.Popen([sys.executable, '-c', ${JSON.stringify(holder)}], stdout=subprocess.PIPE, text=True)
try:
    assert child.stdout.readline().strip() == 'ready'
    try:
        with recording_lock(Path.cwd(), timeout=0.1):
            raise AssertionError('lock admitted a second writer')
    except TimeoutError as error:
        assert 'do not delete' in str(error)
finally:
    child.kill()
    child.wait(timeout=5)
with recording_lock(Path.cwd(), timeout=0.5):
    assert (Path('.trellis/.runtime/session-recording.lock')).exists()
`,
      ],
      { cwd: tmp, encoding: "utf8", timeout: 10000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(tryAddSession(tmp, "after kill", ["--no-commit"]).status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1]);
  });

  it.each([
    { sameRetry: false, commit: false },
    { sameRetry: true, commit: false },
    { sameRetry: false, commit: true },
    { sameRetry: true, commit: true },
  ])(
    "serializes overlapping writers ($sameRetry retry, $commit commit)",
    ({ sameRetry, commit }) => {
      if (commit) seedTask(tmp);
      // Start B while A is paused immediately before its journal replacement.
      // Without an operation lock B succeeds first and A silently overwrites it.
      const result = spawnSync(
        "python3",
        [
          "-c",
          `
import json, subprocess, sys, threading
sys.path.insert(0, '.trellis/scripts')
import add_session as m
ready = threading.Event()
release = threading.Event()
original = m.write_text_atomic
def paused(path, text):
    if path.name.startswith('journal-'):
        ready.set()
        if not release.wait(10):
            raise RuntimeError('writer coordination timed out')
    return original(path, text)
m.write_text_atomic = paused
outcomes = []
t = threading.Thread(target=lambda: outcomes.append(m.add_session('writer A', auto_commit=${commit ? "True" : "False"}, branch='main', idempotency_key=${commit ? "'overlap'" : "None"})))
t.start()
if not ready.wait(10):
    raise RuntimeError('first writer did not reach append')
b = subprocess.Popen([sys.executable, '.trellis/scripts/add_session.py', '--title', ${JSON.stringify(sameRetry ? "writer A" : "writer B")}, ${commit ? "'--idempotency-key', 'overlap'" : "'--no-commit'"}], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    stdout, stderr = b.communicate(timeout=0.5)
except subprocess.TimeoutExpired:
    release.set()
    stdout, stderr = b.communicate(timeout=15)
finally:
    release.set()
    t.join(10)
print('OUTCOMES=' + json.dumps([outcomes, b.returncode, stderr]))
`,
        ],
        { cwd: tmp, encoding: "utf8", timeout: 30000 },
      );
      expect(result.status, result.stderr).toBe(0);
      const outcomes = JSON.parse(result.stdout.split("OUTCOMES=")[1]);
      expect(outcomes[0]).toEqual([0]);
      expect(outcomes[1], outcomes[2]).toBe(0);
      expect(sessionNumbers(tmp)).toEqual(sameRetry ? [1] : [1, 2]);
      expect(readIndex(tmp)).toContain("| writer A |");
      if (!sameRetry) {
        expect(readJournal(tmp)).toContain("writer B");
        expect(readIndex(tmp)).toContain("| writer B |");
      }
    },
  );

  it("retries historical recording without duplicating links and accepts a later correction in the same topic", () => {
    const relative = "docs/callbacks.md";
    const topic = path.join(tmp, relative);
    fs.mkdirSync(path.dirname(topic), { recursive: true });
    const original =
      "# Callback policy\n\nTransient failures: 2 attempts; permanent: 1.\nSource: supplied export A, messages 1–3.\n";
    fs.writeFileSync(topic, original);
    // --no-commit must also work in a migrated project with auto-commit enabled.
    fs.writeFileSync(
      path.join(tmp, ".trellis/config.yaml"),
      "session_auto_commit: true\n",
    );
    git(tmp, "add", ".");
    git(tmp, "-c", "commit.gpgsign=false", "commit", "-qm", "synthetic baseline");
    const head = git(tmp, "rev-parse", "HEAD");
    const args = [
      "--no-commit",
      "--summary",
      "Organized export A",
      "--topic",
      relative,
    ];
    expect(tryAddSession(tmp, "Callback history", args).status).toBe(0);
    const journal = readJournal(tmp);
    const index = readIndex(tmp);
    expect(tryAddSession(tmp, "Callback history", args).status).toBe(0);
    expect(readJournal(tmp)).toBe(journal);
    expect(readIndex(tmp)).toBe(index);
    expect(fs.readFileSync(topic, "utf8")).toBe(original);

    const corrected = original
      .replace("2 attempts", "4 attempts")
      .replace("1–3", "1–5");
    fs.writeFileSync(topic, corrected);
    expect(
      tryAddSession(tmp, "Callback correction", [
        "--no-commit",
        "--summary",
        "Export A message 5 corrects transient attempts to 4",
        "--topic",
        relative,
      ]).status,
    ).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1, 2]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 2");
    expect(readJournal(tmp).match(/\[docs\/callbacks.md\]\(/g)).toHaveLength(2);
    expect(fs.readFileSync(topic, "utf8")).toBe(corrected);
    expect(git(tmp, "rev-parse", "HEAD")).toBe(head);
  });

  it("reports actual failure and recovery without saving note content", () => {
    const before = fs.readFileSync(indexPath(tmp), "utf8");
    fs.writeFileSync(
      indexPath(tmp),
      before.replace("@@@auto:current-status", "BROKEN"),
    );
    const args = ["--no-commit", "--summary", "private-note-sentinel"];
    expect(tryAddSession(tmp, "private-title-sentinel", args).status).toBe(1);
    const check = () =>
      buildDoctorReport(tmp).checks.find((c) => c.name === "recording-runtime");
    expect(check()?.level).toBe("warn");
    expect(check()?.detail).toContain("partial checkpoint");
    const file = path.join(tmp, ".trellis/.runtime/writes/latest.json");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).last_exit_code).toBe(1);
    fs.writeFileSync(indexPath(tmp), before);
    expect(tryAddSession(tmp, "private-title-sentinel", args).status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(check()?.level).toBe("ok");
    const metadata = fs.readFileSync(file, "utf8");
    expect(metadata).not.toContain("sentinel");
    expect(metadata).not.toContain(DEVELOPER);
    expect(JSON.parse(metadata).last_exit_code).toBe(0);
  });

  it("does not turn a successful note write into a failure when diagnostics are unwritable", () => {
    fs.mkdirSync(path.join(tmp, ".trellis/.runtime"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".trellis/.runtime/writes"), "blocked");
    const result = tryAddSession(tmp, "saved note", ["--no-commit"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("recording diagnostic write failed");
    expect(readJournal(tmp)).toContain("saved note");
  });

  it("does not count --help or argument errors as a recording attempt", () => {
    for (const args of [["--help"], ["--unknown-argument"]]) {
      spawnSync("python3", [".trellis/scripts/add_session.py", ...args], {
        cwd: tmp,
        encoding: "utf8",
      });
    }
    expect(
      fs.existsSync(path.join(tmp, ".trellis/.runtime/writes/latest.json")),
    ).toBe(false);
  });

  it("validates an existing topic before linking it from the journal", () => {
    const topic = path.join(tmp, ".trellis/research/payment.md");
    fs.mkdirSync(path.dirname(topic), { recursive: true });
    fs.writeFileSync(topic, "# Payment policy\n\nConfirmed: one attempt.\n");
    const saved = tryAddSession(tmp, "linked topic", [
      "--no-commit",
      "--summary",
      "verified topic",
      "--topic",
      ".trellis/research/payment.md",
    ]);
    expect(saved.status).toBe(0);
    expect(readJournal(tmp)).toContain(".trellis/research/payment.md");
    const journalFile = journalPath(tmp);
    const journal = readJournal(tmp);
    const topicHref = journal.match(
      /\[\.trellis\/research\/payment\.md\]\(([^)]+)\)/,
    )?.[1];
    expect(topicHref).toBeDefined();
    expect(
      path.resolve(path.dirname(journalFile), topicHref ?? ""),
    ).toBe(topic);
    expect(saved.stderr).toContain("topic content must be verified separately");
    expect(saved.stderr).toContain(
      `.trellis/workspace/${DEVELOPER}/journal-1.md`,
    );
    expect(saved.stderr).toContain(`.trellis/workspace/${DEVELOPER}/index.md`);

    const before = readJournal(tmp);
    const rejected = tryAddSession(tmp, "missing topic", [
      "--no-commit",
      "--topic",
      ".trellis/research/missing.md",
    ]);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("journal not written");
    expect(readJournal(tmp)).toBe(before);

    fs.writeFileSync(
      path.join(tmp, "README.md"),
      "# Pay\n\nRetry at most 4 times.\n",
    );
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "docs/status.md"),
      "# Status\n\nImplemented delivery.\n",
    );
    const readme = tryAddSession(tmp, "readme home", [
      "--no-commit",
      "--summary",
      "updated the readme",
      "--topic",
      "README.md",
    ]);
    expect(readme.status).toBe(0);
    expect(readJournal(tmp)).toContain("README.md");
    const docs = tryAddSession(tmp, "docs home", [
      "--no-commit",
      "--summary",
      "updated the docs page",
      "--topic",
      "docs/status.md",
    ]);
    expect(docs.status).toBe(0);
    expect(readJournal(tmp)).toContain("docs/status.md");

    const outside = readJournal(tmp);
    const blocked = tryAddSession(tmp, "agents is not a description", [
      "--no-commit",
      "--topic",
      "AGENTS.md",
    ]);
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain("journal not written");
    expect(readJournal(tmp)).toBe(outside);
  });

  it.each([
    "README_CN.md",
    "docs/status.md",
    "doc/项目现状.md",
    "docs/status with spaces.md",
  ])(
    "links a project description without changing its contents: %s",
    (relative) => {
      const topic = path.join(tmp, relative);
      const content =
        "# Project status\n\nCurrent rule: at most four attempts.\n";
      fs.mkdirSync(path.dirname(topic), { recursive: true });
      fs.writeFileSync(topic, content);
      const result = tryAddSession(tmp, "project description", [
        "--no-commit",
        "--topic",
        relative,
      ]);
      expect(result.status).toBe(0);
      expect(fs.readFileSync(topic, "utf8")).toBe(content);
      const link = [
        ...readJournal(tmp).matchAll(/\[([^\]]+)\]\(([^)]+)\)/g),
      ].find((match) => match[1] === relative);
      expect(link).toBeDefined();
      expect(
        path.resolve(
          path.dirname(journalPath(tmp)),
          decodeURIComponent(link?.[2] ?? ""),
        ),
      ).toBe(topic);
    },
  );

  it("rejects invalid description topics before changing the journal or index", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "mt-topic-outside-"));
    try {
      const foreign = path.join(outside, "status.md");
      fs.writeFileSync(foreign, "# Outside the project\n");
      fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "README.md"), "# Current description\n");
      fs.writeFileSync(path.join(tmp, "docs/empty.md"), " \n");
      fs.writeFileSync(
        path.join(tmp, "docs/status.txt"),
        "# Wrong extension\n",
      );
      fs.symlinkSync(foreign, path.join(tmp, "docs/outside.md"));
      const journal = readJournal(tmp);
      const index = fs.readFileSync(indexPath(tmp), "utf8");
      for (const invalid of [
        "docs/empty.md",
        "docs/status.txt",
        "docs/missing.md",
        "docs/outside.md",
        foreign,
      ]) {
        const result = tryAddSession(tmp, "invalid topic", [
          "--no-commit",
          "--topic",
          "README.md",
          "--topic",
          invalid,
        ]);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("journal not written");
        expect(readJournal(tmp)).toBe(journal);
        expect(fs.readFileSync(indexPath(tmp), "utf8")).toBe(index);
      }
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("keeps topic links usable after journal rotation and a retry", () => {
    const topicRelative = ".trellis/research/payment rules (v2)#中文.md";
    const topic = path.join(tmp, topicRelative);
    fs.mkdirSync(path.dirname(topic), { recursive: true });
    fs.writeFileSync(topic, "# Payment policy\n\nConfirmed: one attempt.\n");
    fs.writeFileSync(
      path.join(tmp, ".trellis/config.yaml"),
      "session_auto_commit: false\nmax_journal_lines: 12\n",
    );
    const args = ["--no-commit", "--topic", topicRelative];
    expect(tryAddSession(tmp, "rotated topic", args).status).toBe(0);
    const journal = readJournal(tmp, 2);
    const href = journal.match(/Topics: \[[^\n]+\]\(([^)]+)\)/)?.[1];
    expect(href).toBeDefined();
    expect(
      path.resolve(path.dirname(journalPath(tmp, 2)), decodeURIComponent(href ?? "")),
    ).toBe(topic);
    const retry = tryAddSession(tmp, "rotated topic", args);
    expect(retry.status).toBe(0);
    expect(retry.stderr).toContain("[RESUME]");
    expect(readJournal(tmp, 2)).toBe(journal);
    expect(fs.existsSync(journalPath(tmp, 3))).toBe(false);
  });

  it("keeps concurrent diagnostic updates atomic and bounded", () => {
    execFileSync(
      "python3",
      [
        "-c",
        `
import sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, '.trellis/scripts')
from add_session import _write_recording_status
with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(_write_recording_status, [0, 1] * 20))
`,
      ],
      { cwd: tmp },
    );
    const dir = path.join(tmp, ".trellis/.runtime/writes");
    expect(fs.readdirSync(dir)).toEqual(["latest.json"]);
    const value = JSON.parse(
      fs.readFileSync(path.join(dir, "latest.json"), "utf8"),
    );
    expect(value.last_status).toBe(value.last_exit_code === 0 ? "ok" : "error");
  });
});

function runAddSession(repo: string, title: string, extraArgs: string[] = []): void {
  const r = tryAddSession(repo, title, extraArgs);
  if (r.status !== 0) {
    throw new Error(`add_session failed: ${r.stderr}`);
  }
}

function journalPath(repo: string, num = 1): string {
  return path.join(repo, ".trellis", "workspace", DEVELOPER, `journal-${num}.md`);
}

function indexPath(repo: string): string {
  return path.join(repo, ".trellis", "workspace", DEVELOPER, "index.md");
}

function readJournal(repo: string, num = 1): string {
  return fs.readFileSync(journalPath(repo, num), "utf-8");
}

function readIndex(repo: string): string {
  return fs.readFileSync(indexPath(repo), "utf-8");
}

/** Session numbers recorded as `## Session N:` headings, in file order. */
function sessionNumbers(repo: string, num = 1): number[] {
  return [...readJournal(repo, num).matchAll(/^## Session (\d+):/gm)].map((m) =>
    Number(m[1]),
  );
}

function countMarkers(repo: string, num = 1): number {
  return readJournal(repo, num).split("<!-- trellis-session:").length - 1;
}

/** Every distinct record marker present in a journal, in order of appearance. */
function distinctMarkers(repo: string, num = 1): string[] {
  const seen = readJournal(repo, num).match(/<!-- trellis-session:[^>]*-->/g) ?? [];
  return [...new Set(seen)];
}

/** Seed a task + initial commit so HEAD and a current task both exist. */
function seedTask(repo: string, name = "task-a"): void {
  makeTask(repo, name, `${name} prd\n`);
  setCurrentTask(repo, name);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "initial");
}

/** Install a pre-commit hook that always fails, to break the commit step. */
function breakCommits(repo: string): void {
  const hook = path.join(repo, ".git", "hooks", "pre-commit");
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
}

function repairCommits(repo: string): void {
  fs.rmSync(path.join(repo, ".git", "hooks", "pre-commit"), { force: true });
}

describe.skipIf(!hasPython())("add_session.py auto-commit", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-test-"));
    setupRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not bundle dirty changes from other task dirs (scope-creep fix)", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    makeTask(tmp, "task-b", "task B prd v1\n");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    // Dirty edit in task-b BEFORE recording a session in task-a's context.
    fs.appendFileSync(
      path.join(tmp, ".trellis", "tasks", "task-b", "prd.md"),
      "DIRTY EDIT IN TASK-B SHOULD NOT BE COMMITTED\n",
    );

    runAddSession(tmp, "task-a work");

    // Last commit is the session auto-commit; inspect its files.
    const lastFiles = git(
      tmp,
      "show",
      "HEAD",
      "--name-only",
      "--pretty=format:",
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // task-b paths must NOT appear in the session commit.
    const leaked = lastFiles.filter((f) => f.includes("/task-b/"));
    expect(leaked).toEqual([]);

    // task-b dirty change still in working tree.
    const status = git(tmp, "status", "--porcelain");
    expect(status).toMatch(/\.trellis\/tasks\/task-b\/prd\.md/);
  });

  it("does not sweep pre-staged unrelated files into the session commit (#579)", () => {
    seedTask(tmp);

    // The developer stages an unrelated file BEFORE the script runs.
    fs.writeFileSync(path.join(tmp, "README.md"), "unrelated staged work\n");
    git(tmp, "add", "README.md");

    runAddSession(tmp, "scoped session commit");

    const lastFiles = git(
      tmp,
      "show",
      "HEAD",
      "--name-only",
      "--pretty=format:",
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // The chore commit contains only Trellis-owned paths.
    expect(lastFiles).not.toContain("README.md");
    expect(lastFiles.every((f) => f.startsWith(".trellis/"))).toBe(true);

    // The developer's file is still staged, ready for their own commit.
    const status = git(tmp, "status", "--porcelain");
    expect(status).toMatch(/^A\s+README\.md/m);
  });

  it("omits Main Changes/Testing/Next Steps sections for a legacy call (#394)", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    runAddSession(tmp, "placeholder-free work");

    const journal = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "journal-1.md"),
      "utf-8",
    );

    expect(journal).toContain("### Summary");
    expect(journal).toContain("### Git Commits");
    expect(journal).not.toContain("**Completed**");
    expect(journal).not.toContain("### Main Changes");
    expect(journal).not.toContain("### Testing");
    expect(journal).not.toContain("### Next Steps");
    expect(journal).not.toContain("(Add details)");
    expect(journal).not.toContain("(Add test results)");
    expect(journal).not.toContain("(Add summary)");
  });

  it("renders supplied test outcomes without inferring completion or success", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    runAddSession(tmp, "structured work", [
      "--change",
      "Added feature X",
      "--change",
      "Fixed bug Y",
      "--test",
      "Ran unit tests",
      "--test",
      "未运行集成测试",
      "--test",
      "lint failed; build partially complete",
      "--next-step",
      "Ship it",
    ]);

    const journal = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "journal-1.md"),
      "utf-8",
    );

    expect(journal).toContain("### Main Changes");
    expect(journal).toContain("- Added feature X");
    expect(journal).toContain("- Fixed bug Y");
    expect(journal).toContain("### Testing");
    expect(journal).toContain("- Ran unit tests");
    expect(journal).toContain("- 未运行集成测试");
    expect(journal).toContain("- lint failed; build partially complete");
    expect(journal).not.toContain("[OK]");
    expect(journal).not.toContain("**Completed**");
    expect(journal).not.toContain("planning session");
    expect(journal).toContain("### Next Steps");
    expect(journal).toContain("- Ship it");
  });

  it("falls back to the current checkout branch when task.json branch is stale", () => {
    makeTask(tmp, "task-a", "task A prd\n", "deleted-task-branch");
    setCurrentTask(tmp, "task-a");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    runAddSession(tmp, "stale branch work");

    const journal = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "journal-1.md"),
      "utf-8",
    );
    const index = fs.readFileSync(
      path.join(tmp, ".trellis", "workspace", DEVELOPER, "index.md"),
      "utf-8",
    );

    expect(journal).toContain("**Branch**: `main`");
    expect(index).toContain("| 1 |");
    expect(index).toContain("| `main` |");
    expect(journal).not.toContain("deleted-task-branch");
    expect(index).not.toContain("deleted-task-branch");
  });

  it("does not wide-scan task dirs when the current task is unresolvable (>=2 sessions)", () => {
    makeTask(tmp, "task-a", "task A prd\n");
    makeTask(tmp, "task-b", "task B prd v1\n");
    // TWO session files → resolve_active_task refuses to guess and returns
    // None. The guard must stage only journal/index, never the wide scan.
    setCurrentTask(tmp, "task-a");
    const sessionsDir = path.join(tmp, ".trellis", ".runtime", "sessions");
    fs.writeFileSync(
      path.join(sessionsDir, "session2.json"),
      JSON.stringify({
        current_task: ".trellis/tasks/task-b",
        platform: "session",
      }) + "\n",
    );
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "initial");

    // Both task dirs dirty.
    fs.appendFileSync(
      path.join(tmp, ".trellis", "tasks", "task-a", "prd.md"),
      "DIRTY A\n",
    );
    fs.appendFileSync(
      path.join(tmp, ".trellis", "tasks", "task-b", "prd.md"),
      "DIRTY B\n",
    );

    runAddSession(tmp, "ambiguous-session work");

    const lastFiles = git(
      tmp,
      "show",
      "HEAD",
      "--name-only",
      "--pretty=format:",
    )
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // No task dir at all in the session commit when the task is unresolvable.
    const taskFiles = lastFiles.filter((f) => f.includes("/tasks/"));
    expect(taskFiles).toEqual([]);

    // Both task dirty edits remain in the working tree.
    const status = git(tmp, "status", "--porcelain");
    expect(status).toMatch(/\.trellis\/tasks\/task-a\/prd\.md/);
    expect(status).toMatch(/\.trellis\/tasks\/task-b\/prd\.md/);
  });

  it("stages only Trellis-owned paths in the session auto-commit", () => {
    seedTask(tmp);
    fs.writeFileSync(path.join(tmp, "unrelated.txt"), "user work in progress\n");

    runAddSession(tmp, "scoped staging");

    const lastFiles = git(tmp, "show", "HEAD", "--name-only", "--pretty=format:")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    expect(lastFiles.length).toBeGreaterThan(0);
    for (const f of lastFiles) {
      expect(f.startsWith(".trellis/"), `unexpected path in commit: ${f}`).toBe(
        true,
      );
    }
    expect(git(tmp, "status", "--porcelain")).toContain("unrelated.txt");
  });
});

describe.skipIf(!hasPython())("add_session.py commit evidence (R1)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-evidence-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("renders the real local commit subject, never a (see git log) placeholder", () => {
    const head = git(tmp, "rev-parse", "HEAD");

    runAddSession(tmp, "evidence work", ["--commit", head]);

    const journal = readJournal(tmp);
    expect(journal).toContain(`| \`${head}\` | initial |`);
    expect(journal).not.toContain("(see git log)");
    expect(journal).not.toContain("(Add details)");
    expect(journal).not.toContain("(Add test results)");
  });

  it("resolves each of several commits to its own subject", () => {
    fs.writeFileSync(path.join(tmp, "a.txt"), "a\n");
    git(tmp, "add", "a.txt");
    git(tmp, "commit", "-q", "-m", "feat: add a");
    const first = git(tmp, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(tmp, "b.txt"), "b\n");
    git(tmp, "add", "b.txt");
    git(tmp, "commit", "-q", "-m", "fix: correct b");
    const second = git(tmp, "rev-parse", "HEAD");

    runAddSession(tmp, "two commits", ["--commit", `${first},${second}`]);

    const journal = readJournal(tmp);
    expect(journal).toContain(`| \`${first}\` | feat: add a |`);
    expect(journal).toContain(`| \`${second}\` | fix: correct b |`);
  });

  it("fails before any journal or index write when an OID cannot be resolved", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));
    const indexBefore = fs.readFileSync(indexPath(tmp));
    const logBefore = git(tmp, "log", "--oneline");

    const r = tryAddSession(tmp, "unresolvable", ["--commit", "deadbeef"]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("cannot resolve commit evidence for: deadbeef");
    expect(r.stderr).toContain("--commit-subject");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
    expect(fs.readFileSync(indexPath(tmp)).equals(indexBefore)).toBe(true);
    expect(git(tmp, "log", "--oneline")).toBe(logBefore);
  });

  it("rejects a --commit token that is not a bounded hex OID", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));

    const r = tryAddSession(tmp, "bad token", ["--commit", "HEAD~1"]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid --commit token 'HEAD~1'");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
  });

  it("accepts an explicit one-to-one subject mapping and escapes it for the table", () => {
    const r = tryAddSession(tmp, "mapped evidence", [
      "--commit",
      "deadbeef",
      "--commit-subject",
      "deadbeef=feat: pipe | and \\ in the subject",
    ]);

    expect(r.status).toBe(0);
    const journal = readJournal(tmp);
    // The cell keeps one row: `|` and `\` are escaped rather than splitting it.
    expect(journal).toContain(
      "| `deadbeef` | feat: pipe \\| and \\\\ in the subject |",
    );
    expect(readIndex(tmp)).toContain("`deadbeef`");
  });

  it("refuses a --commit-subject that is not one-to-one with --commit", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));

    const r = tryAddSession(tmp, "extra mapping", [
      "--commit",
      "deadbeef",
      "--commit-subject",
      "deadbeef=real subject",
      "--commit-subject",
      "cafebabe=subject for an OID nobody asked about",
    ]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not in --commit");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
  });

  it("describes missing commit evidence without inferring a planning session", () => {
    runAddSession(tmp, "planning work", ["--commit", "-"]);

    const journal = readJournal(tmp);
    expect(journal).toContain("(No associated commits)");
    expect(journal).not.toContain("| Hash | Message |");
    expect(readIndex(tmp)).toMatch(/\|\s*1\s*\|.*\|\s*-\s*\|/);
  });

  it("rejects an out-of-shape --idempotency-key before writing", () => {
    const journalBefore = fs.readFileSync(journalPath(tmp));

    const r = tryAddSession(tmp, "bad key", ["--idempotency-key", "not ok!"]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("invalid --idempotency-key");
    expect(fs.readFileSync(journalPath(tmp)).equals(journalBefore)).toBe(true);
  });
});

/**
 * Marker as the two schemes render it, for the same record inputs.
 *
 * Reconstructs the fingerprint payload the way `cmd_add_session` builds it,
 * by importing the real module — so the v1 form is produced by the shipped
 * `compute_legacy_fingerprint`, not by a copy of it here. The caller asserts
 * that `v2` matches what is actually in the journal before trusting `v1`; if
 * this reconstruction ever drifts from the command, that check fails loudly
 * instead of the test quietly passing on a marker nothing would have written.
 */
function markersFor(
  repo: string,
  title: string,
  summary: string,
  branch: string,
  legacyDate: string,
): { v2: string; v1: string } {
  const harness = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(".trellis/scripts")})`,
    "import add_session as a",
    "payload = a._fingerprint_payload(",
    `    ${JSON.stringify(DEVELOPER)}, ${JSON.stringify(title)},`,
    `    ${JSON.stringify(summary)}, None, ${JSON.stringify(branch)},`,
    "    [], None, None, None, None, None,",
    ")",
    "print(json.dumps({",
    "  'v2': a.render_marker(a.compute_record_fingerprint(payload)),",
    `  'v1': a.render_legacy_marker(a.compute_legacy_fingerprint(payload, ${JSON.stringify(legacyDate)})),`,
    "}))",
  ].join("\n");
  const r = spawnSync("python3", ["-c", harness], {
    cwd: repo,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    throw new Error(`marker harness failed: ${r.stderr}`);
  }
  return JSON.parse(r.stdout);
}

/** Rewrite the pending entry into the pre-versioning marker scheme. */
function downgradeToLegacyMarker(
  repo: string,
  v2Marker: string,
  v1Marker: string,
  legacyDate: string,
): void {
  const before = readJournal(repo);
  expect(before).toContain(v2Marker);
  fs.writeFileSync(
    journalPath(repo),
    before
      .replace(v2Marker, v1Marker)
      .replace(/^\*\*Date\*\*: \d{4}-\d{2}-\d{2}$/m, `**Date**: ${legacyDate}`),
  );
  // Both files came from the same earlier-day write, not just the journal.
  fs.writeFileSync(
    indexPath(repo),
    readIndex(repo).replace(
      /^(\|\s*\d+\s*\|)\s*\d{4}-\d{2}-\d{2}\s*\|/gm,
      `$1 ${legacyDate} |`,
    ),
  );
}

describe.skipIf(!hasPython())(
  "add_session.py fingerprint date rollover",
  () => {
    let tmp: string;
    const TITLE = "rollover run";
    const SUMMARY = "interrupted before the commit";
    const BRANCH = "main";
    const ARGS = ["--summary", SUMMARY, "--branch", BRANCH];

    beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-rollover-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

    afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

    it("resumes a record written yesterday under the pre-versioning scheme", () => {
    // Interrupt after the journal and index writes, before the commit.
    breakCommits(tmp);
    const first = tryAddSession(tmp, TITLE, ARGS);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain("Auto-commit failed");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // Stage what a pre-change run would have left behind on an earlier day.
    const { v2, v1 } = markersFor(tmp, TITLE, SUMMARY, BRANCH, "2020-01-01");
    downgradeToLegacyMarker(tmp, v2, v1, "2020-01-01");

    repairCommits(tmp);
    const second = tryAddSession(tmp, TITLE, ARGS);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    // The record was found and finished — not appended a second time.
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
    // Its marker is left as written; an in-flight entry is not rewritten.
    expect(readJournal(tmp)).toContain(v1);
  });

    it("resolves a same-day legacy marker too, not just one across a rollover", () => {
    breakCommits(tmp);
    expect(tryAddSession(tmp, TITLE, ARGS).status).toBe(1);

    const today = readJournal(tmp).match(/^\*\*Date\*\*: (\d{4}-\d{2}-\d{2})$/m);
    if (!today) throw new Error("journal entry carries no **Date** line");
    const date = today[1];
    const { v2, v1 } = markersFor(tmp, TITLE, SUMMARY, BRANCH, date);
    downgradeToLegacyMarker(tmp, v2, v1, date);

    repairCommits(tmp);
    const second = tryAddSession(tmp, TITLE, ARGS);
    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);
  });

    it("does not adopt a legacy entry whose inputs differ", () => {
    breakCommits(tmp);
    expect(tryAddSession(tmp, TITLE, ARGS).status).toBe(1);
    const { v2, v1 } = markersFor(tmp, TITLE, SUMMARY, BRANCH, "2020-01-01");
    downgradeToLegacyMarker(tmp, v2, v1, "2020-01-01");
    repairCommits(tmp);

    // A different summary is a different record; resuming it would be wrong.
    const other = tryAddSession(tmp, TITLE, [
      "--summary",
      "a genuinely different session",
      "--branch",
      BRANCH,
    ]);
    expect(other.status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1, 2]);
    expect(countMarkers(tmp)).toBe(2);
  });

    it("keeps two same-day sessions distinct now that the date is not an input", () => {
    runAddSession(tmp, "first session", ["--summary", "one", "--branch", BRANCH]);
    runAddSession(tmp, "second session", ["--summary", "two", "--branch", BRANCH]);
    expect(sessionNumbers(tmp)).toEqual([1, 2]);
    expect(countMarkers(tmp)).toBe(2);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 2");
  });

    it("writes the versioned marker form", () => {
    runAddSession(tmp, TITLE, ARGS);
    expect(readJournal(tmp)).toMatch(
      /^<!-- trellis-session: v=2 fp=[0-9a-f]{16} -->$/m,
    );
  });
  },
);

describe.skipIf(!hasPython())(
  "add_session.py retry convergence (R2-R5)",
  () => {
    let tmp: string;

    beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-retry-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

    afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

    it("repairs the index row on retry when the index update failed after the append", () => {
    const indexBefore = fs.readFileSync(indexPath(tmp), "utf-8");
    // Break the auto-update markers so update_index refuses, after the journal
    // append has already landed.
    fs.writeFileSync(
      indexPath(tmp),
      indexBefore.replace("@@@auto:current-status", "BROKEN-MARKER"),
    );

    const first = tryAddSession(tmp, "index fault", ["--summary", "fault run"]);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain("Markers not found in index.md");
    expect(first.stderr).toContain("[BLOCKED] Checkpoint:");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // Repair the index and re-run the identical command.
    fs.writeFileSync(indexPath(tmp), indexBefore);
    const second = tryAddSession(tmp, "index fault", ["--summary", "fault run"]);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    expect(second.stderr).toContain("journal-recorded");
    // No second entry, and the row for session 1 is now present.
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);
    expect(readIndex(tmp)).toMatch(/^\|\s*1\s*\|/m);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
  });

    it("exits non-zero with a checkpoint when the auto-commit fails, then resumes at the commit step", () => {
    breakCommits(tmp);

    const first = tryAddSession(tmp, "commit fault", ["--summary", "fault run"]);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain("Auto-commit failed");
    expect(first.stderr).toContain("[BLOCKED] Checkpoint:");
    expect(first.stderr).toContain("resumes at the commit step");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // A retry while the commit is still broken must not duplicate anything.
    const second = tryAddSession(tmp, "commit fault", ["--summary", "fault run"]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("[RESUME]");
    expect(second.stderr).toContain("index-recorded");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");

    // With the commit repaired, the same command finishes the operation.
    repairCommits(tmp);
    const third = tryAddSession(tmp, "commit fault", ["--summary", "fault run"]);
    expect(third.status).toBe(0);
    expect(third.stderr).toContain("[RESUME]");
    expect(third.stderr).toContain("Auto-committed");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(countMarkers(tmp)).toBe(1);

    const committed = git(
      tmp,
      "show",
      `HEAD:.trellis/workspace/${DEVELOPER}/journal-1.md`,
    );
    expect(committed).toContain("## Session 1: commit fault");
  });

    it("treats an identical request as a new session once the earlier one is committed", () => {
    runAddSession(tmp, "same prose", ["--summary", "identical summary"]);
    runAddSession(tmp, "same prose", ["--summary", "identical summary"]);
    // A third identical run has to keep working. It would not if the new
    // entries reused the committed record's marker: classify_record refuses
    // to resume once a marker matches more than one entry.
    runAddSession(tmp, "same prose", ["--summary", "identical summary"]);

    expect(sessionNumbers(tmp)).toEqual([1, 2, 3]);
    expect(countMarkers(tmp)).toBe(3);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 3");
    // Each generation carries its own marker; duplicates would make every
    // later run ambiguous.
    expect(distinctMarkers(tmp).length).toBe(3);
  });

    it("makes a committed record a no-op when the caller supplies an idempotency key", () => {
    runAddSession(tmp, "keyed work", [
      "--summary",
      "keyed summary",
      "--idempotency-key",
      "retry-001",
    ]);
    expect(sessionNumbers(tmp)).toEqual([1]);

    const second = tryAddSession(tmp, "keyed work", [
      "--summary",
      "keyed summary",
      "--idempotency-key",
      "retry-001",
    ]);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("already recorded and committed");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
  });

    it("refuses to resume when two entries carry the same record marker", () => {
    runAddSession(tmp, "dup work", ["--summary", "dup summary", "--no-commit"]);

    // Duplicate the pending entry — the retry must not pick one at random.
    const journal = readJournal(tmp);
    const entry = journal.slice(journal.indexOf("## Session 1:"));
    fs.writeFileSync(journalPath(tmp), journal + "\n\n" + entry);

    const r = tryAddSession(tmp, "dup work", [
      "--summary",
      "dup summary",
      "--no-commit",
    ]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("journal entries carrying this record's marker");
    expect(countMarkers(tmp)).toBe(2);
  });

    it("refuses to resume from a marker with no session heading above it", () => {
    runAddSession(tmp, "orphan work", [
      "--summary",
      "orphan summary",
      "--no-commit",
    ]);

    fs.writeFileSync(
      journalPath(tmp),
      readJournal(tmp).replace("## Session 1: orphan work", "## Notes"),
    );

    const r = tryAddSession(tmp, "orphan work", [
      "--summary",
      "orphan summary",
      "--no-commit",
    ]);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("without a '## Session N:' heading");
  });

    it("stops after a verified journal + index when auto-commit is disabled", () => {
    fs.writeFileSync(
      path.join(tmp, ".trellis", "config.yaml"),
      "session_auto_commit: false\n",
    );
    const logBefore = git(tmp, "log", "--oneline");

    const r = tryAddSession(tmp, "no auto commit", ["--summary", "local only"]);

    expect(r.status).toBe(0);
    expect(r.stderr).toContain("session_auto_commit: false");
    expect(r.stderr).not.toContain("Auto-committed");
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(readIndex(tmp)).toContain("**Total Sessions**: 1");
    expect(git(tmp, "log", "--oneline")).toBe(logBefore);
  });

    it("writes journal and index but skips git for --no-commit", () => {
    const logBefore = git(tmp, "log", "--oneline");

    const r = tryAddSession(tmp, "manual commit", ["--no-commit"]);

    expect(r.status).toBe(0);
    expect(sessionNumbers(tmp)).toEqual([1]);
    expect(git(tmp, "log", "--oneline")).toBe(logBefore);
    expect(git(tmp, "status", "--porcelain")).toContain("journal-1.md");
  });

    it("rotates to a new journal file and records the entry there", () => {
    fs.writeFileSync(
      path.join(tmp, ".trellis", "config.yaml"),
      "session_auto_commit: true\nmax_journal_lines: 12\n",
    );

    const r = tryAddSession(tmp, "rotating work", ["--summary", "rotate"]);

    expect(r.status).toBe(0);
    expect(r.stderr).toContain("Exceeds 12 lines");
    expect(fs.existsSync(journalPath(tmp, 2))).toBe(true);
    expect(sessionNumbers(tmp, 2)).toEqual([1]);
    expect(readJournal(tmp, 1)).not.toContain("rotating work");
    expect(readIndex(tmp)).toContain("**Active File**: `journal-2.md`");
  });

    it("resumes a rotated entry without appending a second one", () => {
    fs.writeFileSync(
      path.join(tmp, ".trellis", "config.yaml"),
      "session_auto_commit: true\nmax_journal_lines: 12\n",
    );
    breakCommits(tmp);

    const first = tryAddSession(tmp, "rotated retry", ["--summary", "rotate"]);
    expect(first.status).toBe(1);

    repairCommits(tmp);
    const second = tryAddSession(tmp, "rotated retry", ["--summary", "rotate"]);

    expect(second.status).toBe(0);
    expect(second.stderr).toContain("[RESUME]");
    expect(sessionNumbers(tmp, 2)).toEqual([1]);
    expect(countMarkers(tmp, 2)).toBe(1);
    expect(fs.existsSync(journalPath(tmp, 3))).toBe(false);
  });
  },
);

describe.skipIf(!hasPython())("add_session.py session numbering", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-number-"));
    setupRepo(tmp);
    seedTask(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not reuse a number already claimed on a concurrent branch", () => {
    runAddSession(tmp, "base work");
    expect(sessionNumbers(tmp)).toEqual([1]);

    // Branch A records (and auto-commits) session 2.
    git(tmp, "checkout", "-q", "-b", "branch-a");
    runAddSession(tmp, "branch A work");
    expect(sessionNumbers(tmp)).toEqual([1, 2]);

    // Branch B forks from main, so its working tree only knows about
    // session 1. Deriving from the working tree alone would claim 2 again.
    git(tmp, "checkout", "-q", "main");
    git(tmp, "checkout", "-q", "-b", "branch-b");
    expect(sessionNumbers(tmp)).toEqual([1]);

    runAddSession(tmp, "branch B work");

    const numbers = sessionNumbers(tmp);
    expect(numbers).toEqual([1, 3]);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("keeps numbering monotonic when the index counter is behind the journal", () => {
    runAddSession(tmp, "first");
    // Simulate a merge that kept both journal entries (merge=union) while
    // index.md resolved to the lower counter.
    fs.writeFileSync(
      indexPath(tmp),
      readIndex(tmp).replace("**Total Sessions**: 1", "**Total Sessions**: 0"),
    );

    runAddSession(tmp, "second");

    expect(sessionNumbers(tmp)).toEqual([1, 2]);
  });
});

/**
 * `get_repo_root` returns the nearest directory holding `.trellis/`, which is
 * not necessarily the git toplevel. Every git path the recorder builds has to
 * be interpreted relative to the Trellis root, not the git root.
 */
describe.skipIf(!hasPython())(
  "add_session.py with .trellis below the git root",
  () => {
    let outer: string;
    let project: string;

    beforeEach(() => {
    outer = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-nested-"));
    git(outer, "init", "-q", "-b", "main");
    git(outer, "config", "user.email", "test@example.com");
    git(outer, "config", "user.name", "Test");
    project = path.join(outer, "project");
    stampTrellis(project);
    seedTask(project);
  });

    afterEach(() => {
    fs.rmSync(outer, { recursive: true, force: true });
  });

    it("verifies the committed record and still numbers a repeat as a new session", () => {
    const first = tryAddSession(project, "nested layout", [
      "--summary",
      "nested run",
    ]);
    expect(first.status).toBe(0);
    expect(first.stderr).toContain("Auto-committed");
    // The post-commit check re-reads the marker from `HEAD:<journal>`. A
    // git-root-relative lookup finds nothing here and reports a false block.
    expect(first.stderr).not.toContain("[BLOCKED] Checkpoint:");

    // The record is committed, so an identical request is a new session
    // rather than a "pending" one adopted for repair.
    const second = tryAddSession(project, "nested layout", [
      "--summary",
      "nested run",
    ]);
    expect(second.status).toBe(0);
    expect(second.stderr).not.toContain("[RESUME]");
    expect(sessionNumbers(project)).toEqual([1, 2]);
  });
  },
);

describe.skipIf(!hasPython())(
  "add_session.py outside any git repository",
  () => {
    let project: string;

    beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-session-nogit-"));
    stampTrellis(project);
    // seedTask() commits via git; there is no repo here by design.
    makeTask(project, "task-a", "task-a prd\n");
    setCurrentTask(project, "task-a");
  });

    afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

    it("records the session and exits 0 — a configured skip, not a retry loop", () => {
    // No git here means auto-commit can never succeed; that must be
    // COMMIT_BLOCKED (exit 0, like a gitignored .trellis/), not the
    // COMMIT_FAILED checkpoint whose "fix the git error" advice never applies.
    const result = tryAddSession(project, "no git", ["--summary", "no repo"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Not a git repository");
    expect(result.stderr).not.toContain("[BLOCKED] Checkpoint:");
    expect(sessionNumbers(project)).toEqual([1]);
  });
  },
);
