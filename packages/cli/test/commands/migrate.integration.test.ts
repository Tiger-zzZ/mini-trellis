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

import inquirer from "inquirer";

import { init } from "../../src/commands/init.js";
import { migrate, collectTrellisResidue } from "../../src/commands/migrate.js";
import { buildTasksConvergePlan } from "../../src/commands/migrate-tasks.js";
import { setWriteMode } from "../../src/utils/file-writer.js";
import { resetResolvedPythonCommand } from "../../src/configurators/shared.js";

const noop = (): void => undefined;

/** `migrate()` refuses to prompt without a TTY, and the test runner has none. */
function interactiveTty(): void {
  vi.spyOn(process, "stdin", "get").mockReturnValue({
    isTTY: true,
  } as unknown as typeof process.stdin);
}

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

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (rel: string): void => {
    for (const entry of fs.readdirSync(path.join(root, rel), {
      withFileTypes: true,
    })) {
      const child = path.join(rel, entry.name);
      const abs = path.join(root, child);
      if (entry.isDirectory()) {
        files[child] = "directory";
        visit(child);
      } else if (entry.isSymbolicLink()) {
        files[child] = `link:${fs.readlinkSync(abs)}`;
      } else {
        files[child] = fs.readFileSync(abs).toString("base64");
      }
    }
  };
  visit("");
  return files;
}

describe("migrate", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-migrate-")),
    );
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    // The failure paths call process.exit; throw instead so the assertions run
    // rather than the worker dying.
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
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
    // One active and one archived Trellis task: memory-layer content plus the
    // workflow files that leave the topic.
    plant(tmpDir, ".trellis/tasks/01-old/task.json", "{}\n");
    plant(tmpDir, ".trellis/tasks/01-old/prd.md", "# PRD\n");
    plant(tmpDir, ".trellis/tasks/01-old/design.md", "# Design\n");
    plant(tmpDir, ".trellis/tasks/01-old/research/other.md", "# Other\n");
    plant(
      tmpDir,
      ".trellis/tasks/01-old/research/note.md",
      "see `.trellis/tasks/01-old/research/other.md`, `.trellis/tasks/01-old/prd.md`\n",
    );
    plant(tmpDir, ".trellis/tasks/archive/2026-09/02-old/task.json", "{}\n");
    plant(
      tmpDir,
      ".trellis/tasks/archive/2026-09/02-old/research/cold.md",
      "# Cold\n",
    );
    plant(
      tmpDir,
      ".trellis/.runtime/sessions/s.json",
      `${JSON.stringify(
        {
          platform: "claude",
          current_task: ".trellis/tasks/01-old",
          current_run: null,
        },
        null,
        2,
      )}\n`,
    );
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
      expect(exists(tmpDir, ".trellis/tasks/01-old/task.json")).toBe(true);
      expect(exists(tmpDir, ".trellis/research/01-old")).toBe(false);
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

    // The hook and its dependencies are mini-trellis's now.
    expect(exists(tmpDir, ".claude/hooks/session-start.py")).toBe(true);
    expect(exists(tmpDir, ".trellis/scripts/common/active_task.py")).toBe(true);
    expect(
      fs.readFileSync(path.join(tmpDir, ".trellis/config.yaml"), "utf-8"),
    ).toContain('session_commit_message: "[mini-trellis] journal"');
  });

  it("converges task directories into research topics", async () => {
    await migrate({ yes: true });

    expect(exists(tmpDir, ".trellis/tasks")).toBe(false);

    // Active and archived tasks keep their names, date prefixes included.
    expect(exists(tmpDir, ".trellis/research/01-old/research/other.md")).toBe(
      true,
    );
    expect(exists(tmpDir, ".trellis/research/01-old/design.md")).toBe(true);
    expect(
      exists(
        tmpDir,
        ".trellis/research/archive/2026-09/02-old/research/cold.md",
      ),
    ).toBe(true);

    // Workflow files leave the topic; `--yes` archives them rather than
    // deleting, so nothing the user might want back is gone.
    expect(exists(tmpDir, ".trellis/research/01-old/legacy/task.json")).toBe(
      true,
    );
    expect(exists(tmpDir, ".trellis/research/01-old/legacy/prd.md")).toBe(true);
    expect(exists(tmpDir, ".trellis/research/01-old/task.json")).toBe(false);
    expect(exists(tmpDir, ".trellis/research/01-old/prd.md")).toBe(false);
    expect(
      exists(
        tmpDir,
        ".trellis/research/archive/2026-09/02-old/legacy/task.json",
      ),
    ).toBe(true);
  });

  it("repoints repo-relative task mentions, and only those", async () => {
    await migrate({ yes: true });

    const note = fs.readFileSync(
      path.join(tmpDir, ".trellis/research/01-old/research/note.md"),
      "utf-8",
    );
    // Content that stays inside the topic moves with it.
    expect(note).toContain(".trellis/research/01-old/research/other.md");
    expect(note).not.toContain(".trellis/tasks/01-old/research/other.md");
    // `prd.md` now sits under legacy/, so the pointer is left dangling rather
    // than turned into a second wrong path.
    expect(note).toContain(".trellis/tasks/01-old/prd.md");
  });

  it("drops the active-task pointer with the tasks tree", async () => {
    await migrate({ yes: true });

    const session = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, ".trellis/.runtime/sessions/s.json"),
        "utf-8",
      ),
    ) as { current_task: unknown; platform: string };
    expect(session.current_task).toBeNull();
    expect(session.platform).toBe("claude");
  });

  it("deletes the workflow files when the user asks for it", async () => {
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ proceed: true })
      .mockResolvedValueOnce({ disposition: "delete" });
    interactiveTty();

    await migrate();

    expect(exists(tmpDir, ".trellis/tasks")).toBe(false);
    expect(exists(tmpDir, ".trellis/research/01-old/legacy")).toBe(false);
    expect(exists(tmpDir, ".trellis/research/01-old/task.json")).toBe(false);
    expect(exists(tmpDir, ".trellis/research/01-old/design.md")).toBe(true);
  });

  it("stops instead of merging into a topic the user already has", async () => {
    plant(tmpDir, ".trellis/research/01-old/mine.md", "my own note\n");

    await expect(migrate({ yes: true })).rejects.toThrow("exit 1");

    expect(exists(tmpDir, ".trellis/tasks/01-old/task.json")).toBe(true);
    expect(exists(tmpDir, ".trellis/research/01-old/mine.md")).toBe(true);
    // Nothing else ran either: the Trellis surface is still in place.
    expect(exists(tmpDir, ".trellis/workflow.md")).toBe(true);
  });

  it("converges leftover tasks on a project with no Trellis surface", async () => {
    // What a project migrated by an older release looks like: the instruction
    // files are gone, the task directories are not. Nothing but the tasks tree
    // triggers the run, which is what the gate has to accept.
    removeAll(tmpDir);
    expect(collectTrellisResidue(tmpDir)).toEqual([]);

    await migrate({ yes: true });

    expect(exists(tmpDir, ".trellis/tasks")).toBe(false);
    expect(exists(tmpDir, ".trellis/research/01-old/legacy/task.json")).toBe(
      true,
    );
    // The rest of the pass still ran: seeds and the refreshed scripts are here.
    expect(exists(tmpDir, ".trellis/research/README.md")).toBe(true);
    expect(exists(tmpDir, ".trellis/scripts/common/active_task.py")).toBe(true);
  });

  it.each(["file", "directory"])(
    "rejects an existing legacy %s before changing any files",
    async (kind) => {
      plant(
        tmpDir,
        kind === "file"
          ? ".trellis/tasks/01-old/legacy"
          : ".trellis/tasks/01-old/legacy/notes.md",
        "keep me\n",
      );
      const before = snapshot(tmpDir);
      await expect(migrate({ dryRun: true })).rejects.toThrow("exit 1");
      await expect(migrate({ yes: true })).rejects.toThrow("exit 1");
      expect(snapshot(tmpDir)).toEqual(before);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("legacy"),
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "preserves dangling and directory symlinks left under tasks",
    async () => {
      plant(tmpDir, "evidence/data.csv", "original\n");
      const directoryLink = path.join(tmpDir, ".trellis/tasks/evidence-link");
      const danglingLink = path.join(tmpDir, ".trellis/tasks/missing-link");
      fs.symlinkSync(path.join(tmpDir, "evidence"), directoryLink);
      fs.symlinkSync(path.join(tmpDir, "missing"), danglingLink);
      const before = snapshot(tmpDir);
      await migrate({ dryRun: true });
      expect(snapshot(tmpDir)).toEqual(before);
      await migrate({ yes: true });
      expect(fs.lstatSync(directoryLink).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(danglingLink).isSymbolicLink()).toBe(true);
      expect(
        fs.readFileSync(path.join(tmpDir, "evidence/data.csv"), "utf-8"),
      ).toBe("original\n");
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("kept as-is"),
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "does not follow task symlinks while counting or rewriting notes",
    async () => {
      const original = ".trellis/tasks/01-old/research/other.md\n";
      plant(tmpDir, "external.md", original);
      fs.rmSync(path.join(tmpDir, ".trellis/tasks/01-old/design.md"));
      fs.symlinkSync(
        path.join(tmpDir, "external.md"),
        path.join(tmpDir, ".trellis/tasks/01-old/design.md"),
      );
      fs.symlinkSync(".", path.join(tmpDir, ".trellis/tasks/01-old/cycle"));
      await migrate({ yes: true });
      expect(fs.readFileSync(path.join(tmpDir, "external.md"), "utf-8")).toBe(
        original,
      );
      expect(
        fs
          .lstatSync(path.join(tmpDir, ".trellis/research/01-old/design.md"))
          .isSymbolicLink(),
      ).toBe(true);
      expect(
        fs
          .lstatSync(path.join(tmpDir, ".trellis/research/01-old/legacy/cycle"))
          .isSymbolicLink(),
      ).toBe(true);
    },
  );

  it.skipIf(process.platform === "win32")(
    "treats a dangling topic destination as a conflict",
    async () => {
      fs.symlinkSync(
        path.join(tmpDir, "missing"),
        path.join(tmpDir, ".trellis/research/01-old"),
      );
      const before = snapshot(tmpDir);
      await expect(migrate({ yes: true })).rejects.toThrow("exit 1");
      expect(snapshot(tmpDir)).toEqual(before);
    },
  );

  it
    .skipIf(process.platform === "win32")
    .each([
      ".trellis/tasks",
      ".trellis/tasks/archive",
      ".trellis/research/archive/2026-09",
    ])(
    "rejects a symlink at migration directory %s before mutation",
    async (rel) => {
      const link = path.join(tmpDir, rel);
      const target = path.join(tmpDir, "external-directory");
      fs.mkdirSync(path.dirname(link), { recursive: true });
      if (fs.existsSync(link)) fs.renameSync(link, target);
      else fs.mkdirSync(target);
      fs.symlinkSync(target, link);
      const before = snapshot(tmpDir);
      await expect(migrate({ yes: true })).rejects.toThrow(
        "Cannot converge through a symlink",
      );
      expect(snapshot(tmpDir)).toEqual(before);
    },
  );

  it("fails before mutation when a task directory cannot be read", async () => {
    const before = snapshot(tmpDir);
    const read = fs.readdirSync;
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(((
      abs: fs.PathLike,
      options: unknown,
    ) => {
      if (String(abs) === path.join(tmpDir, ".trellis/tasks/01-old")) {
        throw Object.assign(new Error("unreadable task"), { code: "EACCES" });
      }
      return Reflect.apply(read, fs, [abs, options]);
    }) as typeof fs.readdirSync);
    await expect(migrate({ yes: true })).rejects.toThrow("unreadable task");
    spy.mockRestore();
    expect(snapshot(tmpDir)).toEqual(before);
  });

  it("repoints exact task paths before using only unambiguous archived-name fallbacks", async () => {
    plant(
      tmpDir,
      ".trellis/tasks/archive/2026-08/01-old/research/other.md",
      "archived\n",
    );
    plant(
      tmpDir,
      ".trellis/tasks/archive/2026-08/02-old/research/cold.md",
      "older archive\n",
    );
    plant(
      tmpDir,
      ".trellis/tasks/archive/2026-09/03-only/research/cold.md",
      "unique archive\n",
    );
    plant(
      tmpDir,
      ".trellis/tasks/01-old/research/refs.md",
      [
        ".trellis/tasks/01-old/research/other.md",
        ".trellis/tasks/archive/2026-08/01-old/research/other.md",
        ".trellis/tasks/archive/2026-09/02-old/research/cold.md",
        ".trellis/tasks/archive/2026-08/02-old/research/cold.md",
        ".trellis/tasks/02-old/research/cold.md",
        ".trellis/tasks/03-only/research/cold.md",
      ].join("\n"),
    );
    const plan = buildTasksConvergePlan(tmpDir);
    await migrate({ yes: true });
    expect(
      fs.readFileSync(
        path.join(tmpDir, ".trellis/research/01-old/research/refs.md"),
        "utf-8",
      ),
    ).toBe(
      [
        ".trellis/research/01-old/research/other.md",
        ".trellis/research/archive/2026-08/01-old/research/other.md",
        ".trellis/research/archive/2026-09/02-old/research/cold.md",
        ".trellis/research/archive/2026-08/02-old/research/cold.md",
        ".trellis/tasks/02-old/research/cold.md",
        ".trellis/research/archive/2026-09/03-only/research/cold.md",
      ].join("\n"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `${plan.mentions.repoint} reference(s) repointed`,
      ),
    );
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

  it("replaces the Trellis block in AGENTS.md and keeps the user's text", async () => {
    // What a real `trellis init` leaves at the top, plus the user's own notes.
    plant(
      tmpDir,
      "AGENTS.md",
      [
        "<!-- TRELLIS:START -->",
        "# Trellis Instructions",
        "",
        "- `.trellis/workflow.md` — development phases, when to create tasks",
        "- `.trellis/tasks/` — active and archived tasks",
        "",
        "Prefer `/trellis:finish-work` and `/trellis:continue`.",
        "<!-- TRELLIS:END -->",
        "",
        "# House rules",
        "",
        "Run the linter before every commit.",
        "",
      ].join("\n"),
    );

    await migrate({ yes: true });

    const agents = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
    expect(agents).toMatch(/^<!-- TRELLIS:START -->\n# mini-trellis/);
    expect(agents).toContain("Run the linter before every commit.");
    expect(agents).not.toMatch(
      /workflow\.md|\.trellis\/tasks|finish-work|\/trellis:continue/,
    );
    expect(agents).not.toMatch(/\{\{/);
    // Exactly one managed block.
    expect(agents.match(/<!-- TRELLIS:START -->/g)).toHaveLength(1);
  });

  it("does nothing when the project has no Trellis install", async () => {
    removeAll(tmpDir);
    fs.rmSync(path.join(tmpDir, ".trellis/tasks"), {
      recursive: true,
      force: true,
    });
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
