import { execFileSync, spawnSync } from "node:child_process";
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
import { hashContent } from "../../src/utils/managed-manifest.js";

const config = ".agents/hooks.json";
const hook = ".agents/hooks/mini-trellis/session-start.py";
const skill = ".agents/skills/mini-trellis-remember/SKILL.md";
const runtime = ".trellis/.runtime/hooks/antigravity.json";
const group = "mini-trellis-session-start";
let temporary: string;
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
  return init({ antigravity: true, user: "AGY Test", yes: true });
}

function invoke(payload: object, env: NodeJS.ProcessEnv = {}): string {
  const command = JSON.parse(read(config))[group].SessionStart[0]
    .command as string;
  const result = spawnSync(command, {
    shell: true,
    cwd: path.join(cwd, ".agents"),
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

beforeEach(() => {
  temporary = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mt-agy-")),
  );
  cwd = path.join(temporary, "项目 space");
  fs.mkdirSync(cwd);
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetResolvedPythonCommand();
  setWriteMode("ask");
  fs.rmSync(temporary, { recursive: true, force: true });
});

describe("Antigravity project integration", () => {
  it("shares skills and owns only its named hook across init, refresh and uninstall", async () => {
    await init({ codex: true, user: "AGY Test", yes: true });
    const shared = read(skill);
    const userHooks = { lint: { Stop: [{ command: "./lint.sh" }] } };
    write(config, "\uFEFF" + JSON.stringify(userHooks));
    write(".agent/skills/custom/SKILL.md", "legacy user skill\n");
    expect([...getConfiguredPlatforms(cwd)]).toEqual(["codex"]);
    expect(runRefresh({ cwd, dryRun: true }).platforms).toEqual(["codex"]);

    await install();
    expect(read(skill)).toBe(shared);
    const installed = JSON.parse(read(config));
    expect(installed.lint).toEqual(userHooks.lint);
    expect(installed[group].SessionStart).toHaveLength(1);
    expect(
      exists(
        ".agents/skills/mini-trellis-session-insight/references/organize-history.md",
      ),
    ).toBe(true);
    expect(buildDoctorReport(cwd).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "antigravity-config", level: "ok" }),
        expect.objectContaining({
          name: "antigravity-runtime",
          level: "unknown",
        }),
      ]),
    );
    installed[group].enabled = false;
    const disabled = JSON.stringify(installed);
    write(config, disabled);
    write(".trellis/research/decision.md", "keep this project rule");
    fs.unlinkSync(path.join(cwd, hook));
    expect(getConfiguredPlatforms(cwd).has("antigravity")).toBe(true);
    expect(runRefresh({ cwd }).ok).toBe(true);
    expect(exists(hook)).toBe(true);
    expect(read(config)).toBe(disabled);
    expect(read(".trellis/research/decision.md")).toBe(
      "keep this project rule",
    );
    expect(buildDoctorReport(cwd).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "antigravity-config", level: "warn" }),
      ]),
    );

    await uninstall({ yes: true });
    expect(JSON.parse(read(config))).toEqual(userHooks);
    expect(exists(hook)).toBe(false);
    expect(read(".agent/skills/custom/SKILL.md")).toBe("legacy user skill\n");
  });

  it("maps both startup payloads to the owning project and returns native context", async () => {
    await install();
    const subdir = path.join(cwd, "src");
    const other = path.join(temporary, "other");
    fs.mkdirSync(subdir);
    fs.mkdirSync(path.join(other, ".trellis"), { recursive: true });
    write(".trellis/.developer", "name=专属项目\n");
    const payloads = [
      { conversationId: "legacy", workspacePaths: [subdir] },
      {
        conversationId: "current",
        workspacePaths: [other, cwd],
        cwd: subdir,
        hookEventName: "SessionStart",
      },
    ];
    for (const payload of payloads) {
      const found = JSON.parse(invoke(payload, { CLAUDE_PROJECT_DIR: other }));
      expect(found).toEqual({
        injectSteps: [
          {
            systemMessage: {
              systemMessage: expect.stringContaining("Developer: 专属项目"),
            },
          },
        ],
      });
      expect(found.injectSteps[0].systemMessage.systemMessage).toContain(
        "/mini-trellis-remember",
      );
    }
    expect(JSON.parse(read(runtime))).toMatchObject({
      platform: "antigravity",
      last_status: "ok",
      last_source: "startup",
    });
    expect(fs.existsSync(path.join(other, ".trellis/.runtime"))).toBe(false);
  });

  it("skips ambiguous workspaces and an independent nested Git repository", async () => {
    await install();
    const nested = path.join(cwd, "independent");
    fs.mkdirSync(nested);
    execFileSync("git", ["init", "-q"], { cwd: nested });
    for (const payload of [
      { workspacePaths: [cwd, nested] },
      { workspacePaths: [cwd], cwd: nested },
      { workspacePaths: [cwd], cwd: temporary },
      { workspacePaths: ["relative"] },
    ]) {
      expect(JSON.parse(invoke(payload))).toEqual({});
    }
    expect(exists(runtime)).toBe(false);
    expect(exists("independent/.trellis")).toBe(false);
  });

  it("keeps malformed files, conflicting groups, and legacy duplicate skills intact", async () => {
    for (const content of [
      "{",
      "[]",
      JSON.stringify({ [group]: { SessionStart: [{ command: "./user.sh" }] } }),
    ]) {
      write(config, content);
      await expect(install()).rejects.toThrow(/\.agents\/hooks\.json/);
      expect(runRefresh({ cwd, antigravity: true }).ok).toBe(false);
      expect(read(config)).toBe(content);
      expect(exists(".trellis")).toBe(false);
    }
    write(config, "{}");
    const legacy = skill.replace(".agents/", ".agent/");
    write(legacy, "existing customization");
    await expect(install()).rejects.toThrow(/duplicate Antigravity skill/);
    expect(read(legacy)).toBe("existing customization");
    expect(exists(skill)).toBe(false);
  });

  it("migrates matching legacy Trellis files and keeps edited workflows", async () => {
    const start = ".agent/workflows/start.md";
    const finish = ".agent/workflows/finish-work.md";
    const oldSkill = ".agent/skills/trellis-update-spec/SKILL.md";
    write(start, "original workflow\r\n");
    write(finish, "customized workflow\n");
    write(oldSkill, "original skill\n");
    write(".agent/hooks.json", "{}\n");
    write(".trellis/research/decision.md", "keep this decision\n");
    write(
      ".trellis/.template-hashes.json",
      JSON.stringify({
        __version: 2,
        hashes: {
          [start]: hashContent("original workflow\n"),
          [finish]: hashContent("original workflow\n"),
          [oldSkill]: hashContent("original skill\n"),
        },
      }),
    );
    const plan = buildMigratePlan(cwd);
    expect(plan.reconfigure).toEqual(["antigravity"]);
    expect(plan.deletions).toEqual(expect.arrayContaining([start, oldSkill]));
    expect(plan.deletions).not.toContain(finish);
    await migrate({ dryRun: true });
    expect(exists(start)).toBe(true);
    expect(exists(hook)).toBe(false);
    await migrate({ yes: true });
    expect(exists(start)).toBe(false);
    expect(exists(oldSkill)).toBe(false);
    expect(read(finish)).toBe("customized workflow\n");
    expect(read(".agent/hooks.json")).toBe("{}\n");
    expect(read(".trellis/research/decision.md")).toBe("keep this decision\n");
    expect(read("AGENTS.md")).toContain("mini-trellis");
    expect(buildDoctorReport(cwd).ok).toBe(true);
  });
});
