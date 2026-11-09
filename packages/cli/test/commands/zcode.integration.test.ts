/** Synthetic projects exercise lifecycle contracts, not model delivery. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recallMem, readMemRefs } from "mini-trellis-core/mem";
import { init } from "../../src/commands/init.js";
import { uninstall } from "../../src/commands/uninstall.js";
import {
  migrate,
  buildMigratePlan,
  legacyHostPlatforms,
} from "../../src/commands/migrate.js";
import { buildDoctorReport } from "../../src/commands/doctor.js";
import { runRefresh } from "../../src/commands/refresh.js";
import {
  configurePlatform,
  collectPlatformTemplates,
  getConfiguredPlatforms,
} from "../../src/configurators/index.js";
import {
  resetResolvedPythonCommand,
  setResolvedPythonCommand,
} from "../../src/configurators/shared.js";
import { setWriteMode } from "../../src/utils/file-writer.js";
import {
  buildManagedRemovalPlan,
  executeManagedRemovalPlan,
} from "../../src/utils/managed-removal.js";
import {
  mergeZCodeConfig,
  readZCodeConfigIssue,
  scrubZCodeConfig,
} from "../../src/utils/zcode-config.js";

let cwd: string;
const CONFIG = ".zcode/config.json";
const HOOK = ".zcode/hooks/session-start.py";
const command = 'python3 "${ZCODE_PROJECT_DIR}/.zcode/hooks/session-start.py"';
function write(relative: string, content: string): void {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(relative: string): string {
  return fs.readFileSync(path.join(cwd, relative), "utf8");
}
function config() {
  return JSON.parse(read(CONFIG));
}
function snapshot(): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.name === ".git") continue;
      if (entry.isDirectory()) walk(file);
      else if (!entry.isSymbolicLink())
        files[path.relative(cwd, file)] = fs.readFileSync(file, "utf8");
    }
  }
  walk(cwd);
  return files;
}
function templates(): Map<string, string> {
  const value = collectPlatformTemplates("zcode");
  if (!value) throw new Error("missing ZCode templates");
  return value;
}
async function install() {
  await init({ zcode: true, yes: true, user: "tester" });
}
beforeEach(() => {
  cwd = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-zcode-")),
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

describe("ZCode project assets", () => {
  it("shares byte-identical Agent Skills with Codex without a second discoverable copy", async () => {
    const codex = collectPlatformTemplates("codex");
    if (!codex) throw new Error("missing Codex templates");
    for (const [relative, content] of templates()) {
      if (relative.startsWith(".agents/skills/"))
        expect(content).toBe(codex.get(relative));
    }
    await init({ codex: true, zcode: true, yes: true, user: "tester" });
    expect(fs.existsSync(path.join(cwd, ".zcode/skills"))).toBe(false);
    expect(fs.readdirSync(path.join(cwd, ".agents/skills")).sort()).toEqual([
      "mini-trellis-remember",
      "mini-trellis-session-insight",
      "mini-trellis-update-spec",
    ]);
    expect(buildDoctorReport(cwd).platforms.sort()).toEqual(["codex", "zcode"]);
  });

  it("does not diagnose ZCode from a Codex-only shared skill installation", async () => {
    await init({ codex: true, yes: true, user: "tester" });
    const report = buildDoctorReport(cwd);
    expect(report.platforms).toEqual(["codex"]);
    expect(report.checks.some((item) => item.name.startsWith("zcode"))).toBe(
      false,
    );
  });

  it("rejects an existing ZCode-local skill source before adding a shared copy", async () => {
    const local = ".zcode/skills/mini-trellis-remember/SKILL.md";
    write(local, "# User-owned ZCode skill\n");
    const before = snapshot();
    await expect(install()).rejects.toThrow(/duplicate ZCode skill source/);
    expect(runRefresh({ cwd, zcode: true }).ok).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(
      buildDoctorReport(cwd).checks.find((item) => item.name === "zcode-skills")
        ?.level,
    ).toBe("error");
  });

  it("does not follow shared skills into a user-level directory", async () => {
    const external = fs.mkdtempSync(
      path.join(os.tmpdir(), "mini-trellis-shared-user-"),
    );
    try {
      fs.mkdirSync(path.join(cwd, ".agents"));
      fs.symlinkSync(external, path.join(cwd, ".agents/skills"));
      await expect(install()).rejects.toThrow(/escapes project/);
      expect(fs.readdirSync(external)).toEqual([]);
      expect(fs.existsSync(path.join(cwd, ".trellis"))).toBe(false);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it("keeps user config, hooks, skills and knowledge through repeated init and refresh", async () => {
    const userHook = {
      type: "process",
      command: "node",
      args: ["./user-hook.mjs"],
    };
    write(
      CONFIG,
      JSON.stringify({
        mcp: { servers: { user: { command: "user-server" } } },
        hooks: {
          timeoutMs: 5000,
          events: {
            SessionStart: [
              {
                matcher: "startup|clear|compact",
                hooks: [{ type: "command", command }, userHook],
              },
            ],
            Stop: [{ hooks: [userHook] }],
          },
        },
      }),
    );
    write(".zcode/skills/user/SKILL.md", "# User skill\n");
    await install();
    write(".trellis/research/keep.md", "# 原有知识\n");
    const before = snapshot();
    await install();
    expect(runRefresh({ cwd, zcode: true }).ok).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(
      runRefresh({ cwd, zcode: true }).items.every(
        (item) => item.action === "unchanged",
      ),
    ).toBe(true);
    const value = config();
    expect(value.hooks.events.SessionStart).toHaveLength(1);
    expect(value.hooks.events.SessionStart[0].hooks).toHaveLength(2);
    expect(value.hooks.timeoutMs).toBe(5000);
    expect(value.hooks.events.Stop[0].hooks).toEqual([userHook]);
    expect(value.mcp.servers.user.command).toBe("user-server");
    expect(getConfiguredPlatforms(cwd).has("zcode")).toBe(true);
    const paths = [...templates().keys()];
    expect(
      paths.some(
        (file) =>
          file.startsWith(".zcode/skills/") ||
          file.includes("/agents/") ||
          file.includes("/commands/") ||
          file.includes("inject-"),
      ),
    ).toBe(false);
    expect(Object.keys(value.hooks.events).sort()).toEqual([
      "SessionStart",
      "Stop",
    ]);
    expect(
      read(
        ".agents/skills/mini-trellis-session-insight/references/organize-history.md",
      ),
    ).toContain("--no-commit");
  });

  it("adds only missing sources around an existing process hook", async () => {
    write(
      CONFIG,
      JSON.stringify({
        hooks: {
          events: {
            SessionStart: [
              {
                matcher: "startup",
                hooks: [{ type: "process", command: "python3", args: [HOOK] }],
              },
            ],
          },
        },
      }),
    );
    await configurePlatform("zcode", cwd);
    await configurePlatform("zcode", cwd);
    const groups = config().hooks.events.SessionStart;
    expect(groups.map((group: { matcher: string }) => group.matcher)).toEqual([
      "startup",
      "clear|compact",
    ]);
    expect(readZCodeConfigIssue(path.join(cwd, CONFIG), true)).toBeNull();
  });

  it("retains disabled hook choices and diagnoses them without granting trust", async () => {
    write(
      CONFIG,
      JSON.stringify({
        hooks: {
          enabled: false,
          events: {
            SessionStart: [
              {
                matcher: "startup|clear|compact",
                hooks: [{ type: "command", command, enabled: false }],
              },
            ],
          },
        },
      }),
    );
    await install();
    expect(config().hooks.enabled).toBe(false);
    expect(config().hooks.events.SessionStart).toHaveLength(1);
    const checks = buildDoctorReport(cwd).checks;
    expect(checks.find((item) => item.name === "zcode-config")?.level).toBe(
      "warn",
    );
    expect(checks.find((item) => item.name === "zcode-trust")?.level).toBe(
      "unknown",
    );
    expect(checks.find((item) => item.name === "zcode-runtime")?.level).toBe(
      "unknown",
    );
  });

  it.each([
    "{",
    "null",
    "[]",
    '{"hooks":[]}',
    '{"hooks":{"enabled":"yes"}}',
    '{"hooks":{"events":[]}}',
    '{"hooks":{"events":{"SessionStart":{}}}}',
    '{"hooks":{"events":{"SessionStart":[{"matcher":"[","hooks":[]}]}}}',
    '{"hooks":{"events":{"SessionStart":[{"hooks":[{"type":"process","command":"python3","args":[1]}]}]}}}',
  ])(
    "rejects malformed config before any installation or refresh write: %s",
    async (content) => {
      write(CONFIG, content);
      const before = snapshot();
      await expect(install()).rejects.toThrow(/ZCode/);
      await expect(configurePlatform("zcode", cwd)).rejects.toThrow(/ZCode/);
      expect(runRefresh({ cwd, zcode: true }).ok).toBe(false);
      expect(snapshot()).toEqual(before);
      expect(
        buildDoctorReport(cwd).checks.find(
          (item) => item.name === "zcode-config",
        )?.level,
      ).toBe("error");
    },
  );

  it.each([
    "echo .zcode/hooks/session-start.py",
    "python3 .zcode/hooks/session-start.py.disabled",
  ])(
    "does not diagnose a mere path mention as a registration: %s",
    async (fake) => {
      await install();
      const value = config();
      value.hooks.events.SessionStart[0].hooks[0].command = fake;
      write(CONFIG, JSON.stringify(value));
      expect(
        buildDoctorReport(cwd).checks.find(
          (item) => item.name === "zcode-config",
        )?.level,
      ).toBe("error");
      expect(scrubZCodeConfig(read(CONFIG), [HOOK]).content).toBe(read(CONFIG));
    },
  );

  it("keeps modified managed files and user name collisions during refresh", async () => {
    await install();
    write(
      ".agents/skills/mini-trellis-remember/SKILL.md",
      "# User customization\n",
    );
    const before = snapshot();
    const result = runRefresh({ cwd, zcode: true });
    expect(result.ok).toBe(false);
    expect(
      result.items.some(
        (item) =>
          item.path.includes("mini-trellis-remember") &&
          item.action === "conflict",
      ),
    ).toBe(true);
    expect(snapshot()).toEqual(before);
    fs.rmSync(path.join(cwd, ".trellis/.mini-trellis-manifest.json"));
    expect(runRefresh({ cwd, zcode: true }).ok).toBe(false);
    expect(read(".agents/skills/mini-trellis-remember/SKILL.md")).toBe(
      "# User customization\n",
    );
  });

  it("preflights directories and external config symlinks without writing", async () => {
    fs.mkdirSync(path.join(cwd, CONFIG), { recursive: true });
    await expect(install()).rejects.toThrow(/regular file/);
    expect(fs.existsSync(path.join(cwd, ".trellis"))).toBe(false);
    fs.rmdirSync(path.join(cwd, CONFIG));
    const external = fs.mkdtempSync(
      path.join(os.tmpdir(), "mini-trellis-zcode-user-"),
    );
    try {
      const file = path.join(external, "config.json");
      fs.writeFileSync(file, "{}\n");
      fs.symlinkSync(file, path.join(cwd, CONFIG));
      await expect(install()).rejects.toThrow(/escapes project/);
      expect(runRefresh({ cwd, zcode: true }).ok).toBe(false);
      expect(fs.readFileSync(file, "utf8")).toBe("{}\n");
      expect(fs.existsSync(path.join(cwd, HOOK))).toBe(false);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it("renders the platform's Python launcher consistently", () => {
    setResolvedPythonCommand("py -3");
    const value = JSON.parse(templates().get(CONFIG) ?? "{}");
    expect(value.hooks.events.SessionStart[0].hooks[0]).toEqual({
      type: "process",
      command: "py",
      args: ["-3", "${ZCODE_PROJECT_DIR}/.zcode/hooks/session-start.py"],
      timeoutMs: 30000,
    });
  });
});

describe("ZCode migration and removal", () => {
  it("does not follow a replaced project config into user settings on uninstall", async () => {
    await install();
    const external = fs.mkdtempSync(
      path.join(os.tmpdir(), "mini-trellis-zcode-user-"),
    );
    try {
      const target = path.join(external, "config.json");
      fs.writeFileSync(target, read(CONFIG));
      fs.unlinkSync(path.join(cwd, CONFIG));
      fs.symlinkSync(target, path.join(cwd, CONFIG));
      const before = fs.readFileSync(target, "utf8");
      await expect(uninstall({ yes: true })).rejects.toThrow(/escapes project/);
      expect(fs.readFileSync(target, "utf8")).toBe(before);
      expect(fs.existsSync(path.join(cwd, HOOK))).toBe(true);
      expect(
        fs.existsSync(path.join(cwd, ".trellis/scripts/add_session.py")),
      ).toBe(true);
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });

  it("migrates stale commands and process args, preserving same-event user hooks and knowledge", async () => {
    const old = ".zcode/hooks/inject-workflow-state.py";
    write(
      CONFIG,
      JSON.stringify({
        hooks: {
          events: {
            UserPromptSubmit: [
              {
                hooks: [
                  { type: "command", command: `python3 ${old}` },
                  { type: "process", command: "python3", args: [old] },
                  { type: "process", command: old },
                  { type: "command", command: `echo ${old}` },
                ],
              },
            ],
          },
        },
        mcp: { servers: {} },
      }),
    );
    write(".zcode/commands/trellis/start.md", "# Legacy\n");
    write(".zcode/skills/user/SKILL.md", "# User\n");
    write(".zcode/hooks/inject-user.py", "# User hook\n");
    write(".trellis/research/keep.md", "# 原有知识\n");
    expect(legacyHostPlatforms(cwd)).toContain("zcode");
    expect(buildMigratePlan(cwd).reconfigure).toContain("zcode");
    await migrate({ yes: true });
    expect(config().hooks.events.UserPromptSubmit[0].hooks).toEqual([
      { type: "command", command: `echo ${old}` },
    ]);
    expect(legacyHostPlatforms(cwd)).not.toContain("zcode");
    expect(read(".trellis/research/keep.md")).toBe("# 原有知识\n");
    expect(read(".zcode/skills/user/SKILL.md")).toBe("# User\n");
    expect(read(".zcode/hooks/inject-user.py")).toBe("# User hook\n");
    const before = snapshot();
    await migrate({ yes: true });
    expect(snapshot()).toEqual(before);
  });

  it("rejects invalid migration config before deleting legacy assets", async () => {
    write(CONFIG, "[]\n");
    write(".zcode/hooks/inject-workflow-state.py", "# Legacy\n");
    const before = snapshot();
    await expect(migrate({ yes: true })).rejects.toThrow(/ZCode/);
    expect(snapshot()).toEqual(before);
  });

  it("removes only managed registrations and skills, leaving user config and skills", async () => {
    await install();
    const value = config();
    value.hooks.timeoutMs = 7000;
    value.hooks.events.Stop = [
      { hooks: [{ type: "command", command: "echo user" }] },
    ];
    value.hooks.events.SessionStart[0].hooks.push(
      { type: "process", command: "python3", args: [HOOK] },
      { type: "command", command: "echo user" },
    );
    write(CONFIG, JSON.stringify(value));
    write(".zcode/skills/user/SKILL.md", "# User\n");
    const owned = Object.fromEntries(
      [...templates().keys()].map((file) => [file, ""]),
    );
    executeManagedRemovalPlan(cwd, buildManagedRemovalPlan(cwd, owned));
    expect(config().hooks.timeoutMs).toBe(7000);
    expect(config().hooks.events.SessionStart[0].hooks).toEqual([
      { type: "command", command: "echo user" },
    ]);
    expect(config().hooks.events.Stop[0].hooks[0].command).toBe("echo user");
    expect(fs.existsSync(path.join(cwd, HOOK))).toBe(false);
    expect(read(".zcode/skills/user/SKILL.md")).toBe("# User\n");
  });

  it("removes an otherwise empty managed config", async () => {
    await configurePlatform("zcode", cwd);
    expect(scrubZCodeConfig(read(CONFIG), [HOOK]).fullyEmpty).toBe(true);
    const desired = JSON.parse(templates().get(CONFIG) ?? "{}");
    expect(mergeZCodeConfig(desired, desired)).toEqual(desired);
  });
});

describe("ZCode shared memory contract", () => {
  it("uses the native session identity for hooks and shell children without a Claude collision", async () => {
    await install();
    const result = execFileSync(
      "python3",
      [
        "-c",
        `
import json, sys
sys.path.insert(0, '.trellis/scripts')
from common.active_task import resolve_context_key
print(json.dumps([
    resolve_context_key({'sessionId': 'native'}, platform='zcode'),
    resolve_context_key(),
    resolve_context_key({'session_id': 'native'}, platform='claude', allow_environment_context=False),
]))
`,
      ],
      {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          ZCODE_SESSION_ID: "native",
          CLAUDE_CODE_SESSION_ID: "compat",
          DSH_SESSION_ID: "",
          TRELLIS_CONTEXT_ID: "",
        },
      },
    );
    expect(JSON.parse(result)).toEqual([
      "zcode_native",
      "zcode_native",
      "claude_native",
    ]);
  });

  it("records and recalls one updated topic with real links and no git commits", async () => {
    execFileSync("git", ["init", "-q", "-b", "main", cwd]);
    await install();
    const topic = ".trellis/research/callback.md";
    for (const key of ["key-one", "key-two"]) {
      write(
        topic,
        `# Callback\n\nUse ${key} only after payment confirmation. Never retry refunds.\n`,
      );
      execFileSync(
        "python3",
        [
          ".trellis/scripts/add_session.py",
          "--title",
          "Callback",
          "--summary",
          key,
          "--topic",
          topic,
          "--no-commit",
        ],
        { cwd },
      );
    }
    const result = recallMem({ cwd, query: "callback key-two", limit: 3 });
    const hit = result.hits.find((item) => item.path === topic);
    expect(hit).toBeDefined();
    if (!hit) throw new Error("updated topic was not recalled");
    const text = readMemRefs({ cwd, refs: [hit.ref] }).reads[0].text;
    expect(text).toContain("key-two");
    expect(text).not.toContain("key-one");
    expect(text).toContain("Never retry refunds");
    const journal = read(".trellis/workspace/tester/journal-1.md");
    expect(journal.match(/## Session /g)).toHaveLength(2);
    expect(journal.match(/\.trellis\/research\/callback\.md/g)).toHaveLength(2);
    expect(read(".trellis/workspace/tester/index.md")).toContain("Callback");
    expect(spawnSync("git", ["rev-parse", "HEAD"], { cwd }).status).not.toBe(0);
  });
});
