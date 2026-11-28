import { exec, execFileSync, spawnSync } from "node:child_process";
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

function invoke(
  payload: { hookEventName?: string; [key: string]: unknown },
  env: NodeJS.ProcessEnv = {},
): string {
  const command = JSON.parse(read(config))[group][
    payload.hookEventName ?? "SessionStart"
  ][0].command as string;
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
    expect(installed[group].PreInvocation).toEqual(
      installed[group].SessionStart,
    );
    const onboarding = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(onboarding).toMatch(/Antigravity:.*\/hooks.*Customizations/);
    expect(onboarding).toContain("/mini-trellis-remember");
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

  it.each([true, false])(
    "upgrades a legacy registration and preserves enabled=%s and custom command",
    async (enabled) => {
      await install();
      const legacy = JSON.parse(read(config));
      const entry = legacy[group];
      delete entry.PreInvocation;
      entry.enabled = enabled;
      entry.SessionStart[0].command = entry.SessionStart[0].command.replace(
        /^.*? -X /,
        'timeout 30s "/opt/custom python/bin/python" -X ',
      );
      entry.SessionStart[0].timeout = 27;
      legacy.other = { Stop: [{ command: "./cleanup" }] };
      write(config, JSON.stringify(legacy));
      fs.unlinkSync(path.join(cwd, hook));
      expect(getConfiguredPlatforms(cwd).has("antigravity")).toBe(true);
      expect(buildDoctorReport(cwd).checks).toContainEqual(
        expect.objectContaining({
          name: "antigravity-config",
          level: "warn",
          detail: expect.stringContaining("refresh --antigravity"),
        }),
      );
      expect(runRefresh({ cwd }).ok).toBe(true);
      expect(JSON.parse(read(config))).toEqual({
        ...legacy,
        [group]: { ...entry, PreInvocation: entry.SessionStart },
      });
      write(config, JSON.stringify(legacy));
      await uninstall({ yes: true });
      expect(JSON.parse(read(config))).toEqual({ other: legacy.other });
    },
  );

  it.skipIf(process.platform === "win32").each([
    { legacy: false, wrapper: false },
    { legacy: true, wrapper: false },
    { legacy: false, wrapper: true },
    { legacy: true, wrapper: true },
  ])(
    "recognizes an installed launcher in a fresh shell (legacy: $legacy, wrapper: $wrapper)",
    ({ legacy, wrapper }) => {
      const cli = path.resolve(__dirname, "../../bin/mini-trellis.js");
      const env = { ...process.env };
      delete env.TRELLIS_PYTHON_CMD;
      const run = (...args: string[]) =>
        execFileSync(process.execPath, [cli, ...args], {
          cwd,
          env,
          encoding: "utf8",
        });
      const launcher = wrapper
        ? path.join(temporary, "my-interpreter")
        : "/usr/bin/env python3";
      if (wrapper)
        fs.writeFileSync(launcher, '#!/bin/sh\nexec python3 "$@"\n', {
          mode: 0o755,
        });
      execFileSync(
        process.execPath,
        [cli, "init", "-u", "tester", "--antigravity", "-y"],
        {
          cwd,
          env: { ...env, TRELLIS_PYTHON_CMD: launcher },
          encoding: "utf8",
        },
      );
      const installed = JSON.parse(read(config));
      const handler = installed[group].SessionStart;
      expect(handler[0].command).toBe(
        launcher + " -X utf8 ./hooks/mini-trellis/session-start.py",
      );
      if (legacy) {
        delete installed[group].PreInvocation;
        // v0.4.2 recorded the canonical config hash, before unrelated groups were added.
        const file = ".trellis/.mini-trellis-manifest.json";
        const manifest = JSON.parse(read(file));
        delete manifest.antigravityCommandHash;
        manifest.files[config] = hashContent(
          JSON.stringify(installed, null, 2) + "\n",
        );
        write(file, JSON.stringify(manifest));
      }
      installed.user = { Stop: [{ command: "./user.sh" }] };
      write(config, JSON.stringify(installed));
      const doctor = () => JSON.parse(run("doctor", "--json")).checks;
      expect(doctor()).toContainEqual(
        expect.objectContaining({
          name: "antigravity-config",
          level: legacy ? "warn" : "ok",
        }),
      );
      run("refresh", "--antigravity", "--dry-run");
      run("refresh", "--antigravity");
      expect(JSON.parse(read(config))[group].PreInvocation).toEqual(handler);
      expect(doctor()).toContainEqual(
        expect.objectContaining({ name: "antigravity-config", level: "ok" }),
      );
      run("uninstall", "-y");
      expect(JSON.parse(read(config))).toEqual({ user: installed.user });
    },
  );

  it("keeps an unrecognized PreInvocation or extra handler intact", async () => {
    await install();
    const installed = JSON.parse(read(config));
    for (const handlers of [
      [{ command: "./mine" }],
      [{ command: "echo -X utf8 ./hooks/mini-trellis/session-start.py" }],
      [{ command: "/usr/bin/env python3 -X utf8 ./hooks/user.py" }],
      [{ ...installed[group].SessionStart[0], userSetting: true }],
      [...installed[group].SessionStart, { command: "./mine" }],
    ]) {
      installed[group].PreInvocation = handlers;
      const content = JSON.stringify(installed);
      write(config, content);
      expect(runRefresh({ cwd }).ok).toBe(false);
      expect(buildDoctorReport(cwd).checks).toContainEqual(
        expect.objectContaining({ name: "antigravity-config", level: "error" }),
      );
      expect(read(config)).toBe(content);
    }
  });

  it("dedupes startup and delivers one handoff per new tail checkpoint across partial writes and rotation", async () => {
    await install();
    const transcriptPath = path.join(temporary, "transcript.jsonl");
    const payload = {
      workspacePaths: [cwd],
      conversationId: "agy-main",
      transcriptPath,
    };
    const pre = () =>
      JSON.parse(invoke({ ...payload, hookEventName: "PreInvocation" }));
    const record = (type: string, step_index: number) =>
      JSON.stringify({ type, step_index, content: "private transcript text" });
    const initial = record("USER_INPUT", 0) + "\n";
    fs.writeFileSync(transcriptPath, initial);
    expect(JSON.parse(invoke(payload)).injectSteps).toHaveLength(1);
    expect(JSON.parse(invoke(payload))).toEqual({});
    expect(JSON.parse(read(runtime)).last_status).toBe("deduped");
    write(".trellis/.developer", "name=updated\n");
    expect(JSON.parse(invoke(payload)).injectSteps).toHaveLength(1);
    const before = read(runtime);
    expect(pre()).toEqual({});
    fs.appendFileSync(
      transcriptPath,
      record("PLANNER_RESPONSE", 1) + "\n" + record("CHECKPOINT", 2),
    );
    expect(pre()).toEqual({});
    expect(read(runtime)).toBe(before);
    const context = ".trellis/.runtime/context/antigravity";
    const stateFile = path.join(
      context,
      fs.readdirSync(path.join(cwd, context))[0],
    );
    expect(JSON.parse(read(stateFile))).toEqual({
      source: "startup",
      content_hash: expect.any(String),
    });
    fs.appendFileSync(transcriptPath, "\n" + record("USER_INPUT", 3) + "\n");
    function expectHandoff() {
      const result = pre();
      expect(result.injectSteps).toHaveLength(1);
      const message = result.injectSteps[0].systemMessage.systemMessage;
      expect(message).toContain("This invocation follows compact.");
      expect(message).toContain(
        "mini-trellis mem context agy-main --platform antigravity",
      );
      expect(message).toContain("/mini-trellis-remember");
      expect(JSON.parse(read(runtime)).last_source).toBe("compact");
      const status = read(runtime);
      expect(pre()).toEqual({});
      expect(read(runtime)).toBe(status);
    }
    expectHandoff();
    fs.writeFileSync(transcriptPath, record("CHECKPOINT", 5) + "\n");
    expectHandoff();
    fs.writeFileSync(transcriptPath, record("CHECKPOINT", 5) + "\r\n");
    expect(pre()).toEqual({});
    fs.renameSync(transcriptPath, transcriptPath + ".previous");
    fs.writeFileSync(transcriptPath, record("CHECKPOINT", 2) + "\n");
    expect(pre()).toEqual({});
    expect(JSON.parse(read(stateFile))).toEqual({
      source: "compact",
      content_hash: expect.any(String),
      last_checkpoint_step: 5,
      last_checkpoint_hash: hashContent(record("CHECKPOINT", 5)).slice(0, 16),
    });
    invoke(payload);
    expect(pre()).toEqual({});
    const revised = JSON.stringify({
      type: "CHECKPOINT",
      step_index: 5,
      content: "revised summary",
    });
    fs.writeFileSync(transcriptPath, revised + "\n");
    expectHandoff();
    expect(JSON.parse(read(stateFile)).last_checkpoint_hash).toBe(
      hashContent(revised).slice(0, 16),
    );
  });

  it("delivers a multi-block checkpoint once across concurrent invocations", async () => {
    await install();
    const transcriptPath = path.join(temporary, "large.jsonl");
    const payload = {
      workspacePaths: [cwd],
      conversationId: "concurrent",
      transcriptPath,
      hookEventName: "PreInvocation",
    };
    const checkpoint = JSON.stringify({
      type: "CHECKPOINT",
      content: "摘要".repeat(25000),
    });
    const user = JSON.stringify({
      type: "USER_INPUT",
      content: "continue ".repeat(10000),
    });
    const partial = JSON.stringify({
      type: "PLANNER_RESPONSE",
      content: "x".repeat(70000),
    });
    fs.writeFileSync(
      transcriptPath,
      [checkpoint, user, "{bad json", partial].join("\n"),
    );
    const command = JSON.parse(read(config))[group].PreInvocation[0].command;
    const outputs = await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise<string>((resolve, reject) => {
            const child = exec(
              command,
              { cwd: path.join(cwd, ".agents") },
              (error, stdout) => {
                if (error) reject(error);
                else resolve(stdout);
              },
            );
            child.stdin?.end(JSON.stringify(payload));
          }),
      ),
    );
    const results = outputs.map((output) => JSON.parse(output));
    expect(results.filter((r) => r.injectSteps)).toHaveLength(1);
    expect(results.filter((r) => !r.injectSteps)).toEqual([{}, {}, {}]);
    const stateDir = path.join(cwd, ".trellis/.runtime/context/antigravity");
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(stateDir, fs.readdirSync(stateDir)[0]),
          "utf8",
        ),
      ),
    ).toEqual({
      source: "compact",
      content_hash: expect.any(String),
      last_checkpoint_step: null,
      last_checkpoint_hash: hashContent(checkpoint).slice(0, 16),
    });
    fs.appendFileSync(transcriptPath, "\n");
    expect(JSON.parse(invoke(payload))).toEqual({});
  });

  it("leaves a resumed checkpoint pending through SessionStart until the next invocation", async () => {
    await install();
    const transcriptPath = path.join(temporary, "resumed.jsonl");
    fs.writeFileSync(transcriptPath, '{"type":"CHECKPOINT","step_index":8}\n');
    const payload = {
      workspacePaths: [cwd],
      conversationId: "resumed",
      transcriptPath,
    };
    const startup = JSON.parse(invoke(payload)).injectSteps[0].systemMessage
      .systemMessage;
    expect(startup).not.toContain("follows compact");
    fs.appendFileSync(
      transcriptPath,
      '{"type":"USER_INPUT","content":"continue"}\n',
    );
    const pre = () =>
      JSON.parse(invoke({ ...payload, hookEventName: "PreInvocation" }));
    expect(pre().injectSteps[0].systemMessage.systemMessage).toContain(
      "mini-trellis mem context resumed --platform antigravity",
    );
    expect(pre()).toEqual({});
  });

  it.each([
    { before: 40, after: 40 },
    { before: 40, after: 80 },
    { before: 695, after: 735 },
  ])(
    "detects a same-inode rewrite from $before to $after bytes",
    async ({ before, after }) => {
      await install();
      const transcriptPath = path.join(temporary, "rewritten.jsonl");
      const input = '{"type":"USER_INPUT","step_index":1}'.padEnd(39) + "\n";
      const checkpoint =
        '{"type":"CHECKPOINT","step_index":2}'.padEnd(39) + "\n";
      const retained =
        before === 695
          ? JSON.stringify({ type: "USER_INPUT", content: "x".repeat(620) }) +
            "\n"
          : "";
      const original = input + retained;
      const rewritten = checkpoint + retained + (after > before ? input : "");
      expect(Buffer.byteLength(original)).toBe(before);
      expect(Buffer.byteLength(rewritten)).toBe(after);
      fs.writeFileSync(transcriptPath, original);
      const inode = fs.statSync(transcriptPath).ino;
      const payload = {
        workspacePaths: [cwd],
        conversationId: "rewrite",
        transcriptPath,
      };
      invoke(payload);
      const pre = () =>
        JSON.parse(invoke({ ...payload, hookEventName: "PreInvocation" }));
      expect(pre()).toEqual({});
      fs.writeFileSync(transcriptPath, rewritten);
      expect(fs.statSync(transcriptPath).ino).toBe(inode);
      expect(pre().injectSteps?.[0].systemMessage.systemMessage).toContain(
        "This invocation follows compact.",
      );
      expect(pre()).toEqual({});
    },
  );

  it.each([false, true])(
    "skips a cold checkpoint followed by a tool-only planner response (intervening user input: %s)",
    async (withUserInput) => {
      await install();
      const transcriptPath = path.join(temporary, "cold.jsonl");
      fs.writeFileSync(
        transcriptPath,
        [
          { type: "CHECKPOINT", step_index: 4 },
          ...(withUserInput
            ? [{ type: "USER_INPUT", content: "continue" }]
            : []),
          { type: "PLANNER_RESPONSE", tool_calls: [{ name: "run_command" }] },
        ]
          .map((row) => JSON.stringify(row))
          .join("\n") + "\n",
      );
      const payload = {
        workspacePaths: [cwd],
        conversation_id: "cold",
        hookEventName: "PreInvocation",
        transcriptPath,
      };
      expect(JSON.parse(invoke(payload))).toEqual({});
      expect(exists(runtime)).toBe(false);
      fs.appendFileSync(
        transcriptPath,
        '{"type":"CHECKPOINT","step_index":6}\n',
      );
      expect(invoke(payload)).toContain(
        "mem context cold --platform antigravity",
      );
    },
  );

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

  it("uses the shell conversation ID and keeps inherited Claude settings isolated", async () => {
    await install();
    const envFile = path.join(temporary, "claude.env");
    const env = {
      ANTIGRAVITY_CONVERSATION_ID: "from-shell",
      CLAUDE_ENV_FILE: envFile,
    };
    const workspace = { workspacePaths: [cwd] };
    expect(JSON.parse(invoke(workspace, env)).injectSteps).toHaveLength(1);
    expect(
      JSON.parse(invoke({ ...workspace, conversationId: "from-shell" }, env)),
    ).toEqual({});
    expect(
      JSON.parse(
        invoke(
          { ...workspace, conversationId: "other" },
          { ...env, TRELLIS_CONTEXT_ID: "inherited" },
        ),
      ).injectSteps,
    ).toHaveLength(1);
    expect(fs.existsSync(envFile)).toBe(false);
  });

  it("dedupes by transcript when agy has no conversation ID and fails open without either identity", async () => {
    await install();
    const env = {
      ANTIGRAVITY_CONVERSATION_ID: "",
      TRELLIS_CONTEXT_ID: "outer-session",
    };
    const workspace = { workspacePaths: [cwd] };
    for (const name of ["first", "second"]) {
      const transcriptPath = path.join(temporary, name + ".jsonl");
      fs.writeFileSync(transcriptPath, "");
      const payload = { ...workspace, transcriptPath };
      expect(JSON.parse(invoke(payload, env)).injectSteps).toHaveLength(1);
      expect(JSON.parse(invoke(payload, env))).toEqual({});
    }
    expect(JSON.parse(invoke(workspace, env)).injectSteps).toHaveLength(1);
    expect(JSON.parse(invoke(workspace, env)).injectSteps).toHaveLength(1);
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
