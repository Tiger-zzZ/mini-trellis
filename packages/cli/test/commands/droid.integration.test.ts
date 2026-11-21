import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDoctorReport } from "../../src/commands/doctor.js";
import { init } from "../../src/commands/init.js";
import { buildMigratePlan, migrate } from "../../src/commands/migrate.js";
import { runRefresh } from "../../src/commands/refresh.js";
import { uninstall } from "../../src/commands/uninstall.js";
import { getConfiguredPlatforms } from "../../src/configurators/index.js";
import { resetResolvedPythonCommand } from "../../src/configurators/shared.js";
import { setWriteMode } from "../../src/utils/file-writer.js";

const config = ".factory/hooks.json";
const settings = ".factory/settings.json";
const oldConfig = ".factory/hooks/hooks.json";
const hook = ".factory/hooks/session-start.py";
const skill = ".factory/skills/mini-trellis-remember/SKILL.md";
const runtime = ".trellis/.runtime/hooks/droid.json";
let cwd: string;

function write(relative: string, content: string): void {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(relative: string): string {
  return fs.readFileSync(path.join(cwd, relative), "utf8");
}

function exists(relative: string): boolean {
  return fs.existsSync(path.join(cwd, relative));
}

function install(): Promise<void> {
  return init({ droid: true, user: "Droid Test", yes: true });
}

function managedCommand(): string {
  const groups = JSON.parse(read(config)).SessionStart as {
    hooks: { command: string }[];
  }[];
  const command = groups
    .flatMap((group) => group.hooks)
    .map((h) => h.command)
    .find((c) => c.includes(hook));
  if (!command) throw new Error("managed SessionStart missing");
  return command;
}

function invoke(source: string): {
  hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
  additional_context?: string;
  suppressOutput?: boolean;
} {
  const result = spawnSync(managedCommand(), {
    shell: true,
    cwd,
    input: JSON.stringify({
      hook_event_name: "SessionStart",
      session_id: "droid-session-1",
      source,
      cwd,
    }),
    encoding: "utf8",
    env: { ...process.env, FACTORY_PROJECT_DIR: cwd, CLAUDE_PROJECT_DIR: "" },
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

beforeEach(() => {
  cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mt-droid-")));
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  resetResolvedPythonCommand();
  setWriteMode("skip");
});

afterEach(() => {
  vi.restoreAllMocks();
  resetResolvedPythonCommand();
  setWriteMode("ask");
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe("Factory Droid project integration", () => {
  it("merges SessionStart into user hooks and keeps them across refresh and uninstall", async () => {
    const userHooks = {
      PreToolUse: [
        { matcher: "Execute", hooks: [{ type: "command", command: "./guard.sh" }] },
      ],
      SessionStart: [
        { matcher: "startup", hooks: [{ type: "command", command: "./hello.sh" }] },
      ],
    };
    write(config, JSON.stringify(userHooks));
    write(".factory/settings.json", '{"model":"user"}\n');
    write(".factory/skills/custom/SKILL.md", "user skill\n");

    await install();
    expect([...getConfiguredPlatforms(cwd)]).toEqual(["droid"]);
    expect(fs.readdirSync(path.join(cwd, ".factory/skills")).sort()).toEqual([
      "custom",
      "mini-trellis-remember",
      "mini-trellis-session-insight",
      "mini-trellis-update-spec",
    ]);
    expect(read(skill)).toContain("remember");
    const installed = JSON.parse(read(config));
    expect(installed.PreToolUse).toEqual(userHooks.PreToolUse);
    expect(installed.SessionStart).toEqual(
      expect.arrayContaining([
        userHooks.SessionStart[0],
        expect.objectContaining({ matcher: "startup|resume|clear|compact" }),
      ]),
    );
    expect(managedCommand()).toContain(hook);
    expect(read(".factory/settings.json")).toBe('{"model":"user"}\n');
    expect(read("AGENTS.md")).toContain("Droid");
    expect(buildDoctorReport(cwd).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "droid-runtime", level: "unknown" }),
      ]),
    );

    write(".trellis/research/decision.md", "keep this project rule");
    fs.unlinkSync(path.join(cwd, hook));
    const before = read(config);
    expect(runRefresh({ cwd }).ok).toBe(true);
    expect(exists(hook)).toBe(true);
    expect(read(config)).toBe(before);
    expect(runRefresh({ cwd }).items.every((i) => i.action === "unchanged")).toBe(
      true,
    );

    await uninstall({ yes: true });
    expect(JSON.parse(read(config))).toEqual(userHooks);
    expect(exists(hook)).toBe(false);
    expect(exists(skill)).toBe(false);
    expect(read(".factory/skills/custom/SKILL.md")).toBe("user skill\n");
    expect(read(".factory/settings.json")).toBe('{"model":"user"}\n');
  });

  it("returns Droid-shaped startup context and a compact hint for the Droid reader", async () => {
    await install();
    const startup = invoke("startup");
    expect(startup.additional_context).toBeUndefined();
    expect(startup.suppressOutput).toBe(true);
    expect(startup.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    const context = startup.hookSpecificOutput?.additionalContext ?? "";
    expect(context).toContain("<session-context>");
    expect(context).toContain("/mini-trellis-remember");
    expect(JSON.parse(read(runtime))).toMatchObject({
      platform: "droid",
      last_status: "ok",
    });
    const doctor = buildDoctorReport(cwd);
    expect(doctor.platforms).toEqual(["droid"]);
    expect(doctor.ok).toBe(true);

    const compact = invoke("compact").hookSpecificOutput?.additionalContext;
    expect(compact).toContain(
      "mini-trellis mem context droid-session-1 --platform droid",
    );
  });

  it("reports a missing registration and leaves invalid hooks.json untouched", async () => {
    await install();
    write(config, '{"PreToolUse": []}\n');
    expect(buildDoctorReport(cwd).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "droid-config", level: "error" }),
      ]),
    );
    expect(runRefresh({ cwd }).ok).toBe(true);
    expect(managedCommand()).toContain(hook);

    for (const content of ["{", "[]", '{"SessionStart": {}}']) {
      write(config, content);
      expect(runRefresh({ cwd, droid: true }).ok).toBe(false);
      expect(read(config)).toBe(content);
    }
  });

  it("replaces Trellis hooks in settings and leaves user hooks active", async () => {
    const legacy = [
      ".factory/droids/trellis-implement.md",
      ".factory/commands/trellis/start.md",
      ".factory/skills/trellis-brainstorm/SKILL.md",
      ".factory/hooks/inject-workflow-state.py",
      ".factory/hooks/inject-subagent-context.py",
    ];
    for (const relative of legacy) write(relative, "legacy\n");
    write(hook, "# legacy session start\n");
    write(".factory/droids/reviewer.md", "user droid\n");
    write(".factory/hooks/inject-company-context.py", "company hook\n");
    write(".factory/hooks/statusline.py", "user status\n");
    write(".factory/commands/trellis/team.md", "team command\n");
    write(".factory/skills/trellis-team/SKILL.md", "team skill\n");
    write(".factory/droids/trellis-team.md", "team droid\n");
    write(
      ".factory/settings.json",
      JSON.stringify({
        model: "user",
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [
                {
                  type: "command",
                  command: "python3 .factory/hooks/session-start.py",
                },
                { type: "command", command: "./hello.sh" },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: "Task",
              hooks: [
                {
                  type: "command",
                  command: "python3 .factory/hooks/inject-subagent-context.py",
                },
              ],
            },
            {
              matcher: "Execute",
              hooks: [{ type: "command", command: "./guard.sh" }],
            },
          ],
        },
      }),
    );
    write(".trellis/research/decision.md", "keep this decision\n");

    const plan = buildMigratePlan(cwd);
    expect(plan.reconfigure).toEqual(["droid"]);
    expect(plan.deletions).toEqual([
      ".factory/commands/trellis/start.md",
      ".factory/droids/trellis-implement.md",
      ".factory/hooks/inject-subagent-context.py",
      ".factory/hooks/inject-workflow-state.py",
      ".factory/skills/trellis-brainstorm",
    ]);
    await migrate({ yes: true });

    for (const relative of legacy) expect(exists(relative)).toBe(false);
    expect(read(".factory/droids/reviewer.md")).toBe("user droid\n");
    expect(read(hook)).not.toBe("# legacy session start\n");
    expect(read(".factory/hooks/inject-company-context.py")).toBe(
      "company hook\n",
    );
    expect(read(".factory/hooks/statusline.py")).toBe("user status\n");
    expect(read(".factory/commands/trellis/team.md")).toBe("team command\n");
    expect(read(".factory/skills/trellis-team/SKILL.md")).toBe("team skill\n");
    expect(read(".factory/droids/trellis-team.md")).toBe("team droid\n");
    const migrated = JSON.parse(read(settings));
    expect(migrated.model).toBe("user");
    expect(migrated.hooks.PreToolUse).toEqual([
      {
        matcher: "Execute",
        hooks: [{ type: "command", command: "./guard.sh" }],
      },
    ]);
    expect(migrated.hooks.SessionStart).toEqual([
      {
        matcher: "startup",
        hooks: [{ type: "command", command: "./hello.sh" }],
      },
      expect.objectContaining({ matcher: "startup|resume|clear|compact" }),
    ]);
    expect(exists(config)).toBe(false);
    expect(buildMigratePlan(cwd).reconfigure).toEqual([]);
    expect(read(".trellis/research/decision.md")).toBe("keep this decision\n");
    expect(buildDoctorReport(cwd).ok).toBe(true);
  });

  it("keeps the legacy standalone file active and respects its event overrides", async () => {
    write(oldConfig, '{"Stop":[],"PreToolUse":[],"SessionStart":[]}');
    const userSettings =
      '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"./inherited.sh"}]}]}}';
    write(settings, userSettings);
    await install();
    expect(exists(config)).toBe(false);
    expect(read(settings)).toBe(userSettings);
    const hooks = JSON.parse(read(oldConfig));
    expect(hooks.Stop).toEqual([]);
    expect(hooks.SessionStart).toHaveLength(1);
    hooks.SessionStart[0].matcher = "compact";
    write(oldConfig, JSON.stringify(hooks));
    expect(buildDoctorReport(cwd).checks).toContainEqual(
      expect.objectContaining({ name: "droid-config", level: "error" }),
    );
    expect(runRefresh({ cwd, dryRun: true }).items).toContainEqual(
      expect.objectContaining({ path: oldConfig, action: "merge" }),
    );
    expect(runRefresh({ cwd }).ok).toBe(true);
    expect(JSON.parse(read(oldConfig)).SessionStart).toHaveLength(1);
    expect(buildDoctorReport(cwd).ok).toBe(true);
    expect(runRefresh({ cwd, dryRun: true }).items).toContainEqual(
      expect.objectContaining({ path: oldConfig, action: "unchanged" }),
    );
  });

  it("repairs stale registrations in both project files before deleting scripts", async () => {
    const injector = ".factory/hooks/inject-workflow-state.py";
    const oldEvent = `[{"hooks":[{"type":"command","command":"python3 ${injector}"},\n// team event handler\n{"type":"command","command":"./team.sh"}]}]`;
    write(
      settings,
      `\uFEFF{\n// team model\n"model":"team", "hooks":{"UserPromptSubmit":${oldEvent}}\n}`,
    );
    fs.chmodSync(path.join(cwd, settings), 0o600);
    write(
      config,
      `{\n// keep team defaults\n"Stop": [], "PreToolUse":${oldEvent}, "SessionStart":[]\n}`,
    );
    expect(buildMigratePlan(cwd).reconfigure).toEqual(["droid"]);
    await migrate({ yes: true });
    expect(read(settings)).toContain("// team model");
    expect(read(settings).startsWith("\uFEFF")).toBe(true);
    if (process.platform !== "win32")
      expect(fs.statSync(path.join(cwd, settings)).mode & 0o777).toBe(0o600);
    expect(read(settings)).not.toContain(injector);
    expect(read(settings)).toContain("// team event handler");
    expect(read(config)).toContain("// keep team defaults");
    expect(read(config)).not.toContain(injector);
    expect(read(config)).toContain(hook);
    expect(buildMigratePlan(cwd).reconfigure).toEqual([]);
    expect(buildDoctorReport(cwd).ok).toBe(true);

    write(injector, "old hook\n");
    write(settings, "{");
    await expect(migrate({ yes: true })).rejects.toThrow(
      /\.factory\/settings\.json/,
    );
    expect(read(injector)).toBe("old hook\n");
  });
});
