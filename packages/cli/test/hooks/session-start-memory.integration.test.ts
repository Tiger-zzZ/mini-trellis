/**
 * Phase 6 SessionStart contract: journal / spec index / hot research paths.
 * Cold research under research/archive/ is not listed. No task workflow.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSessionContext } from "../../src/templates/opencode/lib/session-utils.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE_SCRIPTS = path.join(
  CLI_ROOT,
  "src/templates/trellis/scripts",
);
const SHARED_HOOK = path.join(
  CLI_ROOT,
  "src/templates/shared-hooks/session-start.py",
);

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function stampMemorySkeleton(tmp: string): void {
  const scriptsDest = path.join(tmp, ".trellis", "scripts");
  fs.mkdirSync(scriptsDest, { recursive: true });
  fs.cpSync(TEMPLATE_SCRIPTS, scriptsDest, { recursive: true });

  fs.writeFileSync(
    path.join(tmp, ".trellis", "config.yaml"),
    'session_commit_message: "[mini-trellis] journal"\n',
  );

  const guides = path.join(tmp, ".trellis", "spec", "guides");
  fs.mkdirSync(guides, { recursive: true });
  fs.writeFileSync(path.join(guides, "index.md"), "# Guides\n");
  fs.writeFileSync(path.join(guides, "mini-memory.md"), "# Mini\n");

  const research = path.join(tmp, ".trellis", "research");
  fs.mkdirSync(path.join(research, "archive"), { recursive: true });
  fs.writeFileSync(path.join(research, "README.md"), "# Research\n");
  fs.writeFileSync(path.join(research, "hot-topic.md"), "# Hot\n");
  fs.writeFileSync(
    path.join(research, "archive", "cold-topic.md"),
    "# Cold\n",
  );
}

function assertMemoryPayload(text: string): void {
  expect(text).toContain(".trellis/research/hot-topic.md");
  expect(text).toContain(".trellis/spec/guides/index.md");
  expect(text).not.toContain("archive/cold-topic.md");
  expect(text).not.toContain("workflow.md");
  expect(text).not.toContain("task.py");
  expect(text).not.toContain("finish-work");
  expect(text).not.toContain("trellis-brainstorm");
  expect(text).toMatch(/mini-trellis mem/);
}

describe.skipIf(!hasPython())("session-start memory contract", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-ss-")),
    );
    stampMemorySkeleton(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("python hook lists hot research and skips archive/", () => {
    const hookDest = path.join(tmpDir, ".claude", "hooks");
    fs.mkdirSync(hookDest, { recursive: true });
    const hookPath = path.join(hookDest, "session-start.py");
    fs.copyFileSync(SHARED_HOOK, hookPath);

    const result = spawnSync("python3", [hookPath], {
      cwd: tmpDir,
      encoding: "utf-8",
      input: JSON.stringify({ cwd: tmpDir, source: "startup" }),
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: tmpDir,
      },
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput?: { additionalContext?: string };
      additional_context?: string;
    };
    const text =
      parsed.hookSpecificOutput?.additionalContext ??
      parsed.additional_context ??
      "";
    expect(text.length).toBeGreaterThan(0);
    assertMemoryPayload(text);
  });

  it("OpenCode session-utils matches the same listing contract", () => {
    const text = buildSessionContext({ directory: tmpDir });
    assertMemoryPayload(text);
  });
});
