/**
 * Phase 6: fresh `mini-trellis init` writes a four-host memory skeleton.
 * No task.py / workflow.md / tasks/ / start-continue-finish-work.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
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
import { setWriteMode } from "../../src/utils/file-writer.js";
import { resetResolvedPythonCommand } from "../../src/configurators/shared.js";

function has(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const canRun = has("git", ["--version"]) && has("python3", ["--version"]);

const noop = () => {};

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

function exists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(abs);
      } else {
        out.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  }
  if (fs.existsSync(root)) walk(root);
  return out.sort();
}

describe.skipIf(!canRun)("init memory-layer skeleton", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-init-")),
    );
    git(tmpDir, "init", "-q", "-b", "main");
    git(tmpDir, "config", "user.email", "t@example.com");
    git(tmpDir, "config", "user.name", "Test");
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetResolvedPythonCommand();
    setWriteMode("ask");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes research/, short spec, remember, and four-host SessionStart", () => {
    expect(exists(tmpDir, ".trellis/research/README.md")).toBe(true);
    expect(exists(tmpDir, ".trellis/research/archive")).toBe(true);
    expect(exists(tmpDir, ".trellis/spec/guides/mini-memory.md")).toBe(true);
    expect(exists(tmpDir, ".trellis/spec/guides/index.md")).toBe(true);
    expect(exists(tmpDir, ".trellis/scripts/add_session.py")).toBe(true);
    expect(exists(tmpDir, ".trellis/config.yaml")).toBe(true);
    expect(exists(tmpDir, "AGENTS.md")).toBe(true);

    expect(exists(tmpDir, ".claude/commands/mini-trellis/remember.md")).toBe(
      true,
    );
    expect(exists(tmpDir, ".claude/hooks/session-start.py")).toBe(true);
    expect(
      exists(tmpDir, ".claude/skills/mini-trellis-session-insight/SKILL.md"),
    ).toBe(true);
    expect(
      exists(tmpDir, ".claude/skills/mini-trellis-update-spec/SKILL.md"),
    ).toBe(true);

    expect(exists(tmpDir, ".agents/skills/mini-trellis-remember/SKILL.md")).toBe(
      true,
    );
    expect(exists(tmpDir, ".codex/hooks.json")).toBe(true);
    expect(exists(tmpDir, ".codex/hooks/session-start.py")).toBe(true);

    expect(exists(tmpDir, ".opencode/commands/mini-trellis/remember.md")).toBe(
      true,
    );
    expect(exists(tmpDir, ".opencode/plugins/session-start.js")).toBe(true);

    expect(exists(tmpDir, ".pi/extensions/mini-trellis/index.ts")).toBe(true);
    expect(exists(tmpDir, ".pi/prompts/mini-trellis-remember.md")).toBe(true);

    const config = fs.readFileSync(
      path.join(tmpDir, ".trellis/config.yaml"),
      "utf-8",
    );
    expect(config).toContain('session_commit_message: "[mini-trellis] journal"');

    const agents = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
    expect(agents).toMatch(/mini-trellis/);
    expect(agents).not.toMatch(/finish-work|continue-work|\/trellis:start/);
  });

  it("does not write task.py, workflow.md, tasks/, or start/finish-work", () => {
    expect(exists(tmpDir, ".trellis/scripts/task.py")).toBe(false);
    expect(exists(tmpDir, ".trellis/workflow.md")).toBe(false);
    expect(exists(tmpDir, ".trellis/tasks")).toBe(false);

    const files = walkFiles(tmpDir);
    const forbidden = files.filter((rel) => {
      const base = rel.split("/").pop() ?? rel;
      return (
        base === "start.md" ||
        base === "continue.md" ||
        base === "finish-work.md" ||
        base === "task.py" ||
        base === "workflow.md" ||
        rel.includes("/commands/trellis/") ||
        rel.includes("/extensions/trellis/")
      );
    });
    expect(forbidden).toEqual([]);
  });
});
