/**
 * Phase 6 surface checks that do not need a fresh git repo:
 * four-host flags, remember-only commands, and template maps.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_TOOLS } from "../../src/types/ai-tools.js";
import {
  collectPlatformTemplates,
  getInitToolChoices,
} from "../../src/configurators/index.js";
import {
  getBundledSkillTemplates,
  getCommandTemplates,
  getSkillTemplates,
} from "../../src/templates/common/index.js";
import { runMem } from "../../src/commands/mem.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const FORBIDDEN_BASENAMES = new Set([
  "start.md",
  "continue.md",
  "finish-work.md",
]);

function posixKeys(files: Map<string, string> | undefined): string[] {
  return [...(files?.keys() ?? [])].sort();
}

describe("four-host CLI surface", () => {
  it("exposes only claude, codex, opencode, and pi", () => {
    expect(Object.keys(AI_TOOLS).sort()).toEqual([
      "claude-code",
      "codex",
      "opencode",
      "pi",
    ]);
    expect(getInitToolChoices().map((t) => t.key).sort()).toEqual([
      "claude",
      "codex",
      "opencode",
      "pi",
    ]);
  });

  it("does not register extra host flags on the init command", () => {
    const src = readFileSync(join(ROOT, "src/cli/index.ts"), "utf-8");
    expect(src).toMatch(/\.option\("--claude"/);
    expect(src).toMatch(/\.option\("--codex"/);
    expect(src).toMatch(/\.option\("--opencode"/);
    expect(src).toMatch(/\.option\("--pi"/);
    expect(src).not.toMatch(/--cursor|--gemini|--omp|--droid|--kimi|--copilot/);
  });
});

describe("remember-only command templates", () => {
  it("ships remember, update-spec, and session-insight only", () => {
    expect(getCommandTemplates().map((t) => t.name)).toEqual(["remember"]);
    expect(getSkillTemplates().map((t) => t.name)).toEqual(["update-spec"]);
    expect(getBundledSkillTemplates().map((t) => t.name)).toEqual([
      "mini-trellis-session-insight",
    ]);
  });
});

describe("platform template maps", () => {
  it("writes mini-trellis remember/session-insight and no start/finish-work", () => {
    const claude = posixKeys(collectPlatformTemplates("claude-code"));
    const codex = posixKeys(collectPlatformTemplates("codex"));
    const opencode = posixKeys(collectPlatformTemplates("opencode"));
    const pi = posixKeys(collectPlatformTemplates("pi"));
    const all = [...claude, ...codex, ...opencode, ...pi];

    expect(claude).toContain(".claude/commands/mini-trellis/remember.md");
    expect(claude).toContain(".claude/hooks/session-start.py");
    expect(claude).toContain(
      ".claude/skills/mini-trellis-session-insight/SKILL.md",
    );
    expect(claude).toContain(".claude/skills/mini-trellis-update-spec/SKILL.md");

    expect(codex).toContain(".agents/skills/mini-trellis-remember/SKILL.md");
    expect(codex).toContain(".codex/hooks.json");
    expect(codex).toContain(".codex/hooks/session-start.py");

    expect(opencode).toContain(".opencode/commands/mini-trellis/remember.md");
    expect(opencode).not.toContain(
      ".opencode/plugins/inject-workflow-state.js",
    );
    expect(opencode).not.toContain(
      ".opencode/plugins/inject-subagent-context.js",
    );

    expect(pi).toContain(".pi/extensions/mini-trellis/index.ts");
    expect(pi).toContain(".pi/prompts/mini-trellis-remember.md");
    expect(pi).not.toContain(".pi/extensions/trellis/index.ts");

    for (const rel of all) {
      const base = rel.split("/").pop() ?? rel;
      expect(FORBIDDEN_BASENAMES.has(base)).toBe(false);
    }
  });
});

describe("mem help", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not teach --phase or task.py", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    runMem(["help"]);
    const text = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(text).toMatch(/mini-trellis mem/);
    expect(text).not.toMatch(/--phase/);
    expect(text).not.toMatch(/task\.py/);
    expect(text).not.toMatch(/brainstorm|finish-work/);
  });
});

describe("session_context has no update probe", () => {
  it("never spawns a version check or teaches trellis update", () => {
    const src = readFileSync(
      join(ROOT, "src/templates/trellis/scripts/common/session_context.py"),
      "utf-8",
    );
    const hook = readFileSync(
      join(ROOT, "src/templates/shared-hooks/session-start.py"),
      "utf-8",
    );
    for (const text of [src, hook]) {
      expect(text).not.toMatch(/get_update_hint|update available/);
      expect(text).not.toMatch(/run trellis update|@mindfoldhq\/trellis/);
    }
  });
});
