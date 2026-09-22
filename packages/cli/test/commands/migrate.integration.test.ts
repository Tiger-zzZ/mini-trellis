/**
 * `mini-trellis migrate`: switching a project that Trellis set up over to
 * mini-trellis. Trellis is not installed in CI, so the residue is planted by
 * hand using the paths a real `trellis init` writes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "mini-trellis") },
}));
vi.mock("inquirer", () => ({
  default: { prompt: vi.fn() },
}));

import { init } from "../../src/commands/init.js";
import { migrate, collectTrellisResidue } from "../../src/commands/migrate.js";
import { setWriteMode } from "../../src/utils/file-writer.js";
import { resetResolvedPythonCommand } from "../../src/configurators/shared.js";

const noop = (): void => undefined;

/**
 * Roots a real `trellis init` leaves behind, minus anything mini-trellis
 * ships. Directories are named as directories so cleanup removes the whole
 * tree, not just the file inside it.
 */
const TRELLIS_RESIDUE: [string, "file" | "dir"][] = [
  [".claude/agents/trellis-check.md", "file"],
  [".claude/commands/trellis", "dir"],
  [".claude/skills/trellis-brainstorm", "dir"],
  [".claude/hooks/inject-workflow-state.py", "file"],
  [".codex/agents/trellis-implement.toml", "file"],
  [".codex/hooks/inject-workflow-state.py", "file"],
  [".opencode/agents/trellis-check.md", "file"],
  [".opencode/commands/trellis", "dir"],
  [".opencode/skills/trellis-check", "dir"],
  [".opencode/plugins/inject-workflow-state.js", "file"],
  [".pi/agents/trellis-research.md", "file"],
  [".pi/prompts/trellis-continue.md", "file"],
  [".pi/skills/trellis-meta", "dir"],
  [".pi/extensions/trellis", "dir"],
  [".agents/skills/trellis-finish-work", "dir"],
  [".trellis/workflow.md", "file"],
  [".trellis/scripts/task.py", "file"],
  [".trellis/.template-hashes.json", "file"],
  [".trellis/.version", "file"],
];

function plant(root: string, rel: string, body = "trellis\n"): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

function plantAll(root: string): void {
  for (const [rel, kind] of TRELLIS_RESIDUE) {
    if (kind === "dir") {
      fs.mkdirSync(path.join(root, rel), { recursive: true });
      plant(root, `${rel}/SKILL.md`);
    } else {
      plant(root, rel);
    }
  }
}

function removeAll(root: string): void {
  for (const [rel] of TRELLIS_RESIDUE) {
    fs.rmSync(path.join(root, rel), { recursive: true, force: true });
  }
}

function exists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

describe("migrate", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-migrate-")),
    );
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    resetResolvedPythonCommand();
    await init({
      yes: true,
      force: true,
      user: "tester",
      claude: true,
      codex: true,
      opencode: true,
      pi: true,
    });
    plantAll(tmpDir);
    // User content that must survive the migration.
    plant(tmpDir, ".trellis/spec/guides/index.md", "# Thinking Guides\n");
    plant(tmpDir, ".trellis/workspace/tester/journal-1.md", "my notes\n");
    plant(tmpDir, ".trellis/tasks/01-old/task.json", "{}\n");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetResolvedPythonCommand();
    setWriteMode("ask");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds Trellis residue but never mini-trellis's own files", () => {
    const found = collectTrellisResidue(tmpDir);

    expect(found).toContain(".claude/commands/trellis");
    expect(found).toContain(".pi/extensions/trellis");
    expect(found).toContain(".trellis/workflow.md");
    expect(found).toContain(".trellis/scripts/task.py");

    // `.opencode/lib/trellis-context.js` carries the Trellis name but is
    // mini-trellis's own module, imported by the OpenCode SessionStart plugin.
    expect(found).not.toContain(".opencode/lib/trellis-context.js");
    // Trellis's config parser is still imported by mini-trellis's scripts.
    expect(found).not.toContain(".trellis/scripts/common/trellis_config.py");
    // mini-trellis's own surfaces must never match.
    for (const rel of found) {
      expect(rel).not.toContain("mini-trellis");
    }
  });

  it("changes nothing on --dry-run", () => {
    const before = collectTrellisResidue(tmpDir);
    return migrate({ dryRun: true }).then(() => {
      expect(collectTrellisResidue(tmpDir)).toEqual(before);
      expect(exists(tmpDir, ".trellis/.version")).toBe(true);
      expect(exists(tmpDir, ".claude/commands/trellis")).toBe(true);
    });
  });

  it("removes the Trellis surface and keeps the memory data", async () => {
    await migrate({ yes: true });

    expect(collectTrellisResidue(tmpDir)).toEqual([]);
    expect(exists(tmpDir, ".trellis/.version")).toBe(false);

    // Memory data survives untouched.
    expect(
      fs.readFileSync(
        path.join(tmpDir, ".trellis/spec/guides/index.md"),
        "utf-8",
      ),
    ).toBe("# Thinking Guides\n");
    expect(
      fs.readFileSync(
        path.join(tmpDir, ".trellis/workspace/tester/journal-1.md"),
        "utf-8",
      ),
    ).toBe("my notes\n");
    expect(exists(tmpDir, ".trellis/tasks/01-old/task.json")).toBe(true);

    // The hook and its dependencies are mini-trellis's now.
    expect(exists(tmpDir, ".claude/hooks/session-start.py")).toBe(true);
    expect(exists(tmpDir, ".trellis/scripts/common/active_task.py")).toBe(true);
    expect(
      fs.readFileSync(path.join(tmpDir, ".trellis/config.yaml"), "utf-8"),
    ).toContain('session_commit_message: "[mini-trellis] journal"');
  });

  it("leaves the OpenCode SessionStart plugin loadable", async () => {
    await migrate({ yes: true });

    const plugin = path.join(tmpDir, ".opencode/plugins/session-start.js");
    expect(fs.existsSync(plugin)).toBe(true);
    const imported = [
      ...fs.readFileSync(plugin, "utf-8").matchAll(/from\s+"(\.[^"]+)"/g),
    ].map((m) => m[1]);
    for (const rel of imported) {
      expect(fs.existsSync(path.resolve(path.dirname(plugin), rel))).toBe(true);
    }
  });

  it("does nothing when the project has no Trellis install", async () => {
    removeAll(tmpDir);
    expect(collectTrellisResidue(tmpDir)).toEqual([]);
    // A mini-trellis project has `.trellis/.version` too, so its presence
    // alone must not count as something to migrate.
    plant(tmpDir, ".trellis/.version", "0.1.0");

    await migrate({ yes: true });

    expect(exists(tmpDir, ".trellis/.version")).toBe(true);
    expect(exists(tmpDir, ".claude/commands/mini-trellis/remember.md")).toBe(
      true,
    );
  });
});

describe("init warning", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-warn-")),
    );
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    resetResolvedPythonCommand();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetResolvedPythonCommand();
    setWriteMode("ask");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runInit(): Promise<string> {
    const log = vi.spyOn(console, "log").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
    await init({ yes: true, force: true, user: "tester", claude: true });
    return log.mock.calls.map((c) => String(c[0])).join("\n");
  }

  it("warns and points at migrate when Trellis residue is present", async () => {
    plant(tmpDir, ".claude/commands/trellis/finish-work.md");
    plant(tmpDir, ".claude/skills/trellis-brainstorm/SKILL.md");
    const text = await runInit();

    expect(text).toMatch(/still has \d+ Trellis path/);
    expect(text).toContain("mini-trellis migrate --dry-run");
    expect(text).toMatch(/new project/);
  });

  it("stays quiet on a clean project", async () => {
    const text = await runInit();
    expect(text).not.toMatch(/Trellis path/);
  });
});
