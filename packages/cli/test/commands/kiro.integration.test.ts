import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "../../src/commands/init.js";
import { uninstall } from "../../src/commands/uninstall.js";
import { migrate } from "../../src/commands/migrate.js";
import { runRefresh } from "../../src/commands/refresh.js";
import { buildDoctorReport } from "../../src/commands/doctor.js";
import { resetResolvedPythonCommand } from "../../src/configurators/shared.js";
import { setWriteMode } from "../../src/utils/file-writer.js";

let cwd: string;
const config = ".kiro/hooks/mini-trellis.json";
function write(relative: string, content: string) {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(relative: string) {
  return fs.readFileSync(path.join(cwd, relative), "utf8");
}
async function install() {
  await init({ kiro: true, yes: true, user: "tester" });
}
beforeEach(() => {
  cwd = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-kiro-")),
  );
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

describe("Kiro project lifecycle", () => {
  it("installs three skills and emits plain SessionStart context with the Kiro skill command", async () => {
    await install();
    expect(fs.readdirSync(path.join(cwd, ".kiro/skills")).sort()).toEqual([
      "mini-trellis-remember",
      "mini-trellis-session-insight",
      "mini-trellis-update-spec",
    ]);
    expect(JSON.parse(read(config))).toMatchObject({
      version: "v1",
      hooks: [{ trigger: "SessionStart", action: { type: "command" } }],
    });
    const hook = spawnSync("python3", [".kiro/hooks/session-start.py"], {
      cwd,
      input: JSON.stringify({
        hook_event_name: "SessionStart",
        cwd,
        session_id: "kiro-test",
      }),
      encoding: "utf8",
    });
    expect(hook.status, hook.stderr).toBe(0);
    expect(hook.stdout).toContain("<session-context>");
    expect(hook.stdout).toContain("/mini-trellis-remember");
    expect(hook.stdout).not.toContain('"hookSpecificOutput"');
    expect(JSON.parse(read(".trellis/.runtime/hooks/kiro.json"))).toMatchObject(
      { last_status: "ok" },
    );
    const doctor = buildDoctorReport(cwd);
    expect(doctor.platforms).toEqual(["kiro"]);
    expect(doctor.ok).toBe(true);
  });

  it("refreshes missing assets, retains knowledge, and reports edited-hook conflicts", async () => {
    await install();
    write(".trellis/research/decision.md", "confirmed rule");
    fs.unlinkSync(
      path.join(cwd, ".kiro/skills/mini-trellis-remember/SKILL.md"),
    );
    expect(runRefresh({ cwd }).ok).toBe(true);
    expect(read(".kiro/skills/mini-trellis-remember/SKILL.md")).toContain(
      "remember",
    );
    write(config, JSON.stringify({ version: "v1", hooks: [] }));
    expect(runRefresh({ cwd }).ok).toBe(false);
    expect(JSON.parse(read(config)).hooks).toEqual([]);
    expect(read(".trellis/research/decision.md")).toBe("confirmed rule");
    expect(buildDoctorReport(cwd).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "kiro-config", level: "error" }),
      ]),
    );
  });

  it("rejects malformed hook files and linked host directories before writing", async () => {
    write(config, "{");
    await expect(install()).rejects.toThrow(/Kiro hooks/);
    expect(fs.existsSync(path.join(cwd, ".trellis"))).toBe(false);
    fs.rmSync(path.join(cwd, ".kiro"), { recursive: true });
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "kiro-external-"));
    try {
      fs.symlinkSync(external, path.join(cwd, ".kiro"));
      await expect(install()).rejects.toThrow(/escapes project root/);
      expect(fs.readdirSync(external)).toEqual([]);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it("migrates Trellis Kiro assets and retains custom agents, hooks and project knowledge", async () => {
    write(".kiro/agents/trellis.json", '{"hooks":{"agentSpawn":[]}}');
    write(".kiro/agents/custom.json", '{"name":"custom"}');
    write(".kiro/hooks/trellis-workflow-state.kiro.hook", "{}");
    write(".kiro/hooks/inject-workflow-state.py", "legacy");
    write(".kiro/hooks/user.json", '{"version":"v1","hooks":[]}');
    write(".kiro/skills/trellis-start/SKILL.md", "legacy");
    write(".trellis/research/decision.md", "confirmed rule");
    await migrate({ yes: true });
    expect(fs.existsSync(path.join(cwd, ".kiro/agents/trellis.json"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(cwd, ".kiro/skills/trellis-start"))).toBe(
      false,
    );
    expect(JSON.parse(read(config)).hooks[0].trigger).toBe("SessionStart");
    expect(read(".kiro/agents/custom.json")).toBe('{"name":"custom"}');
    expect(read(".kiro/hooks/user.json")).toBe('{"version":"v1","hooks":[]}');
    expect(read(".trellis/research/decision.md")).toBe("confirmed rule");
  });

  it("uninstalls its hook while retaining user hooks, skills and agent settings", async () => {
    await install();
    const value = JSON.parse(read(config));
    value.hooks[0].name = "renamed-project-entry";
    const userHook = {
      name: "user",
      trigger: "SessionStart",
      action: { type: "command", command: "echo hello" },
    };
    value.hooks.push(userHook);
    write(config, JSON.stringify(value));
    write(".kiro/hooks/user.json", "{}");
    write(".kiro/skills/user/SKILL.md", "user skill");
    write(".kiro/agents/custom.json", "{}");
    await uninstall({ yes: true });
    expect(JSON.parse(read(config)).hooks).toEqual([userHook]);
    expect(read(".kiro/skills/user/SKILL.md")).toBe("user skill");
    expect(read(".kiro/agents/custom.json")).toBe("{}");
    expect(read(".kiro/hooks/user.json")).toBe("{}");
    expect(fs.existsSync(path.join(cwd, ".kiro/hooks/session-start.py"))).toBe(
      false,
    );
  });
});
