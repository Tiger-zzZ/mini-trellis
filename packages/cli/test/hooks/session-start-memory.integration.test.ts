/**
 * SessionStart contract: short entry point, with research recalled on demand.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ModuleKind, transpileModule } from "typescript";

import { buildSessionContext } from "../../src/templates/opencode/lib/session-utils.js";
import { buildDoctorReport } from "../../src/commands/doctor.js";

const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const TEMPLATE_SCRIPTS = path.join(CLI_ROOT, "src/templates/trellis/scripts");
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
  fs.writeFileSync(path.join(research, "archive", "cold-topic.md"), "# Cold\n");
  // What `mini-trellis migrate` leaves behind: a task directory that became a
  // topic, evidence files and all.
  fs.mkdirSync(path.join(research, CONVERGED_TOPIC, "research"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(research, CONVERGED_TOPIC, "research", "note.md"),
    "# Note\n",
  );
  fs.writeFileSync(
    path.join(research, CONVERGED_TOPIC, "research", "raw.csv"),
    "a,b\n",
  );
}

/** A migrated task directory: one topic, not one note per file inside it. */
const CONVERGED_TOPIC = "09-11-pipeline-outage-meter-flow-impact";

function assertMemoryPayload(text: string): void {
  expect(text).toContain("mini-trellis mem recall");
  expect(text).toContain("mini-trellis mem read");
  expect(text).toContain("mini-trellis mem recall <query>");
  expect(text).not.toContain(".trellis/research/hot-topic.md");
  expect(text).not.toContain(`.trellis/research/${CONVERGED_TOPIC}/`);
  expect(text).not.toContain("<first-reply-notice>");
  expect(text).not.toContain("Research notes:");
  expect(text).not.toContain("workflow.md");
  expect(text).not.toContain("task.py");
  expect(text).not.toContain("finish-work");
  expect(text).not.toContain("trellis-brainstorm");
  expect(text).toMatch(/mini-trellis mem/);
}

describe.skipIf(!hasPython())("session-start memory contract", () => {
  let tmpDir: string;

  function hook(
    host = "claude",
    sessionId?: string,
    source = "startup",
    projectEnv?: NodeJS.ProcessEnv,
  ) {
    const file = path.join(tmpDir, `.${host}/hooks/session-start.py`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(SHARED_HOOK, file);
    fs.writeFileSync(
      path.join(
        tmpDir,
        `.${host}/${host === "codex" ? "hooks" : host === "zcode" ? "config" : "settings"}.json`,
      ),
      "{}",
    );
    if (host === "zcode") {
      for (const name of ["remember", "session-insight", "update-spec"]) {
        const skill = path.join(tmpDir, `.agents/skills/mini-trellis-${name}/SKILL.md`);
        fs.mkdirSync(path.dirname(skill), { recursive: true });
        fs.writeFileSync(skill, `# ${name}\n`);
      }
    }
    if (host === "codebuddy") {
      const command = path.join(
        tmpDir,
        ".codebuddy/commands/mini-trellis/remember.md",
      );
      fs.mkdirSync(path.dirname(command), { recursive: true });
      fs.writeFileSync(command, "# Remember\n");
      const skill = path.join(tmpDir, ".codebuddy/skills/mini-trellis-remember/SKILL.md");
      fs.mkdirSync(path.dirname(skill), { recursive: true });
      fs.writeFileSync(skill, "# Remember\n");
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.endsWith("_PROJECT_DIR") &&
          !key.endsWith("_NON_INTERACTIVE") &&
          !key.startsWith("TRELLIS_") &&
          key !== "CLAUDE_CODE_SESSION_ID" &&
          key !== "CLAUDE_ENV_FILE",
      ),
    );
    const result = spawnSync("python3", [file], {
      cwd: tmpDir,
      encoding: "utf8",
      env: { ...env, ...projectEnv },
      input: JSON.stringify({ cwd: tmpDir, source, session_id: sessionId }),
    });
    expect(result.status, result.stderr).toBe(0);
    const data = JSON.parse(result.stdout);
    return {
      ...result,
      data,
      text: data.hookSpecificOutput?.additionalContext ?? "",
    };
  }

  beforeEach(() => {
    tmpDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-ss-")),
    );
    stampMemorySkeleton(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(["claude", "codex", "codebuddy", "zcode"])(
    "%s handler deduplicates startup and rebuilds context when a lifecycle event is supplied",
    (host) => {
      const first = hook(host, "same");
      assertMemoryPayload(first.text);
      const remember =
        host === "codex" || host === "zcode" ? "$mini-trellis-remember" : host === "codebuddy" ? "mini-trellis-remember" : "/mini-trellis:remember";
      const other =
        host === "codex" || host === "zcode" ? "/mini-trellis:remember" : "$mini-trellis-remember";
      expect(first.text).toContain(remember);
      expect(first.text).not.toContain(other);
      expect(hook(host, "same").data).toEqual({});
      const platform = host === "claude" ? "claude-code" : host;
      const runtime = buildDoctorReport(tmpDir).checks.find(
        (c) => c.name === `${platform}-runtime`,
      );
      expect(runtime?.level).toBe("ok");
      expect(runtime?.detail).toContain("deduped");
      expect(runtime?.detail).toContain("0 chars");
      expect(hook(host, "new").text).toBe(first.text);
      for (const source of ["compact", "clear", "resume"]) {
        const text = hook(host, "same", source).text;
        assertMemoryPayload(text);
        expect(text).toContain(remember);
        expect(text).not.toContain(other);
        if (source === "compact") expect(text).toContain("follows compact");
        else expect(text).not.toContain("follows compact");
        if (host === "zcode") {
          expect(text).not.toContain("local session history");
          expect(text).not.toContain("mini-trellis mem context");
          expect(text).not.toContain("same");
        }
      }
      expect(first.text).not.toContain("follows compact");
      expect(first.text).not.toContain("read back");
      expect(first.text.length).toBeLessThan(1600);
    },
  );

  it("compact SessionStart names the host session id and keeps the host remember command", () => {
    for (const host of ["claude", "codex"] as const) {
      const sessionId = "compact-session-abc123";
      const remember =
        host === "codex" ? "$mini-trellis-remember" : "/mini-trellis:remember";
      const other =
        host === "codex" ? "/mini-trellis:remember" : "$mini-trellis-remember";
      const text = hook(host, sessionId, "compact").text;
      assertMemoryPayload(text);
      expect(text).toContain("follows compact");
      expect(text).toContain(`local session ${sessionId}`);
      expect(text).toContain(
        `mini-trellis mem context ${sessionId} --platform ${host}`,
      );
      const resumed = hook(host, sessionId, "resume");
      expect(resumed.text).not.toContain(`mem context ${sessionId}`);
      const afterResume = hook(host, sessionId, "compact");
      expect(afterResume.text).toContain(
        `mini-trellis mem context ${sessionId} --platform ${host}`,
      );
      expect(text).toContain(remember);
      expect(text).not.toContain(other);
      expect(text).not.toMatch(/local session history:/);
      const again = hook(host, sessionId, "compact");
      expect(again.text).toBe(text);
      expect(again.text.length).toBeGreaterThan(0);
      expect(again.data).not.toEqual({});
    }
  });

  it("compact SessionStart stays generic when the host sends no session id", () => {
    const text = hook("claude", undefined, "compact").text;
    assertMemoryPayload(text);
    expect(text).toContain("follows compact");
    expect(text).toContain("local session history");
    expect(text).toContain("mini-trellis mem recall <query>");
    expect(text).toContain("mini-trellis mem read <ref>");
    expect(text).toContain("/mini-trellis:remember");
    expect(text).not.toMatch(/local session (?!history\b)\S+/);
    expect(text).not.toMatch(/mini-trellis mem context \S+/);

    const blank = hook("claude", "   ", "compact").text;
    expect(blank).toContain("local session history");
    expect(blank).not.toMatch(/mini-trellis mem context \S+/);
  });

  it.each(["sessionId", "sessionID"])(
    "compact SessionStart accepts the host field %s",
    (key) => {
      const file = path.join(tmpDir, ".claude/hooks/session-start.py");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.copyFileSync(SHARED_HOOK, file);
      const sessionId = "field-session-xyz";
      const result = spawnSync("python3", [file], {
        cwd: tmpDir,
        encoding: "utf8",
        input: JSON.stringify({
          cwd: tmpDir,
          source: "compact",
          [key]: sessionId,
        }),
      });
      expect(result.status, result.stderr).toBe(0);
      const text =
        JSON.parse(result.stdout).hookSpecificOutput?.additionalContext ?? "";
      expect(text).toContain(`mini-trellis mem context ${sessionId}`);
    },
  );

  it("delivers changed entry content and fails open without identity or valid state", () => {
    const first = hook("claude", "same").text;
    fs.writeFileSync(
      path.join(tmpDir, ".trellis/.developer"),
      "name=changed-developer\n",
    );
    const changed = hook("claude", "same").text;
    expect(changed).not.toBe(first);
    expect(changed).toContain("changed-developer");
    fs.unlinkSync(path.join(tmpDir, ".trellis/.developer"));
    expect(hook("claude", "same").text).toBe(first);
    const dir = path.join(tmpDir, ".trellis/.runtime/context/claude");
    for (const file of fs.readdirSync(dir))
      fs.writeFileSync(path.join(dir, file), "{");
    expect(hook("claude", "same").text).toBe(first);
    expect(hook().text).toBe(first);
    expect(hook().text).toBe(first);
  });

  it("delivers context even when runtime metadata cannot be written", () => {
    fs.writeFileSync(path.join(tmpDir, ".trellis/.runtime"), "blocked");
    const result = hook("codex", "unwritable");
    assertMemoryPayload(result.text);
    expect(result.stderr).toContain("diagnostic write failed");
    expect(
      buildDoctorReport(tmpDir).checks.find((c) => c.name === "codex-runtime")
        ?.level,
    ).toBe("unknown");
  });

  it("keeps startup output constant for 0, 100 and 1000 research topics", () => {
    const dir = path.join(tmpDir, ".trellis/research");
    fs.rmSync(dir, { recursive: true });
    fs.mkdirSync(dir);
    const lengths: number[] = [];
    for (const count of [0, 100, 1000]) {
      for (let i = 0; i < count; i++)
        fs.writeFileSync(
          path.join(dir, `topic-${i}.md`),
          "# Private topic body\n",
        );
      const text = hook("claude", `topics-${count}`).text;
      lengths.push(text.length);
      expect(text).not.toContain("Private topic body");
      expect(text.length).toBeLessThan(1600);
    }
    expect(new Set(lengths).size).toBe(1);
  });

  it("python hook emits a bounded on-demand entry", () => {
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

  it("keeps Cursor's project state when a Claude workspace alias is inherited", () => {
    const other = path.join(tmpDir, "other");
    stampMemorySkeleton(other);
    fs.writeFileSync(path.join(other, ".trellis/.developer"), "name=other-project\n");
    fs.writeFileSync(path.join(tmpDir, ".trellis/.developer"), "name=cursor-project\n");
    const { text } = hook("cursor", "cursor-workspace", "startup", {
      CURSOR_PROJECT_DIR: tmpDir,
      CLAUDE_PROJECT_DIR: other,
    });
    expect(text).toContain("Developer: cursor-project");
    expect(fs.existsSync(path.join(other, ".trellis/.runtime"))).toBe(false);
  });

  it("uses Codex's nested output contract without a duplicate compatibility field", () => {
    // Use a neutral script path so the CODEX_PROJECT_DIR environment variable,
    // rather than the install directory name, proves platform detection.
    const hookPath = path.join(tmpDir, "session-start.py");
    fs.copyFileSync(SHARED_HOOK, hookPath);
    const result = spawnSync("python3", [hookPath], {
      cwd: tmpDir,
      encoding: "utf-8",
      input: JSON.stringify({
        cwd: tmpDir,
        source: "startup",
        session_id: "codex-contract",
      }),
      env: { ...process.env, CODEX_PROJECT_DIR: tmpDir },
    });
    // The copied template is the same shared hook used by the Codex asset.
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty("hookSpecificOutput");
    expect(parsed).not.toHaveProperty("additional_context");
  });

  it("OpenCode session-utils matches the same listing contract", () => {
    const text = buildSessionContext({ directory: tmpDir });
    assertMemoryPayload(text);
    expect(text).toContain("/mini-trellis:remember");
    expect(text).not.toContain("$mini-trellis-remember");
  });

  it.each(["0", "1"])(
    "OpenCode deduplicates and restores ephemeral context in headless=%s without changing stored user text",
    (nonInteractive) => {
      const moduleUrl = pathToFileURL(
        path.join(CLI_ROOT, "src/templates/opencode/plugins/session-start.js"),
      ).href;
      const result = execFileSync(process.execPath, ["--input-type=module"], {
        cwd: tmpDir,
        encoding: "utf8",
        env: {
          ...process.env,
          TRELLIS_HOOKS: "1",
          TRELLIS_DISABLE_HOOKS: "0",
          OPENCODE_NON_INTERACTIVE: nonInteractive,
        },
        input: `
        import plugin from ${JSON.stringify(moduleUrl)};
        import { writeFileSync, readFileSync } from 'node:fs';
        const handlers = await plugin({ directory: process.cwd() });
        const transform = handlers['experimental.chat.messages.transform'];
        await transform({}, { messages: [] });
        const emptyRuntime = JSON.parse(readFileSync('.trellis/.runtime/hooks/opencode.json', 'utf8'));
        const original = { info: { role: 'user', sessionID: 'fixture', agent: 'build' }, parts: [{ type: 'text', text: 'User request' }] };
        const output = { messages: [original] };
        await transform({}, output);
        await transform({}, output);
        const compacted = { messages: [original] };
        await transform({}, compacted);
        const stale = { type: 'text', synthetic: true, text: '<session-context>\\nmini-trellis SessionStart context. stale' };
        const retained = { messages: [{ ...original, parts: [stale, ...output.messages[0].parts] }] };
        const storedParts = retained.messages[0].parts;
        await transform({}, retained);
        writeFileSync('.trellis/.developer', 'name=changed-entry\\n');
        await transform({}, output);
        process.stdout.write(JSON.stringify({ original, emptyRuntime, messages: output.messages, compacted: compacted.messages, retained: retained.messages, storedParts }));
      `,
      });
      const value = JSON.parse(result);
      expect(value.emptyRuntime.last_status).toBe("skipped");
      expect(value.emptyRuntime.last_output_chars).toBe(0);
      expect(value.original.parts).toEqual([
        { type: "text", text: "User request" },
      ]);
      expect(value.messages[0].parts).toHaveLength(2);
      expect(value.messages[0].parts[0].text).toContain(
        "Developer: changed-entry",
      );
      expect(value.compacted[0].parts).toHaveLength(2);
      expect(value.retained[0].parts).toHaveLength(2);
      expect(value.retained[0].parts[0].text).not.toContain("context. stale");
      expect(value.storedParts).toHaveLength(3);
      assertMemoryPayload(value.messages[0].parts[0].text);
    },
  );

  it("renders complete catalog lines within budget, counts missing targets and excludes navigation from the body", () => {
    const index = path.join(tmpDir, ".trellis/index.md");
    const first = "- .trellis/research/hot-topic.md — when changing the hot path";
    const next = "- .trellis/spec/guides/index.md — " + "目录".repeat(70);
    const missing = "- docs/vanished.md — old location";
    fs.writeFileSync(index, [first, ...Array<string>(15).fill(next), missing].join("\n"));
    const text = hook("codex", "catalog").text;
    const start = text.indexOf(first);
    const catalog = text.slice(start, text.indexOf("\n</current-state>", start));
    expect(start).toBeGreaterThan(0);
    expect([...catalog].length).toBeLessThanOrEqual(1200);
    expect(catalog).not.toContain("vanished.md");
    expect(catalog.split("\n").slice(1, -2).every((line: string) => line === next)).toBe(true);
    expect(catalog).toContain("Skipped 1 invalid catalog entry.");
    expect(catalog).toContain(".trellis/index.md (lines 17)");
    expect(catalog).toContain("More entries: open .trellis/index.md");
    expect(hook("codex", "catalog").data).toEqual({});
    fs.writeFileSync(index, first);
    expect(hook("codex", "catalog").text).toContain(first);
  });

  it("renders hand-written bullets and links to project or child project documentation", () => {
    for (const file of ["packages/core/package.json", "packages/core/README.md", "service/.git", "service/docs/start here.md"]) {
      const target = path.join(tmpDir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "");
    }
    fs.writeFileSync(path.join(tmpDir, ".trellis/index.md"), [
      "# Knowledge",
      "- .trellis/research/hot-topic.md — ordinary",
      "* `packages/core/README.md` - public API",
      "+ [start the service](<service/docs/start here.md>)",
    ].join("\n"));
    const { text } = hook("codex", "manual-catalog");
    expect(text).toContain("- .trellis/research/hot-topic.md — ordinary\n- packages/core/README.md — public API\n- service/docs/start here.md — start the service");
    expect(text).not.toContain("invalid catalog");
  });

  it("reports bounded source line numbers and falls back to spec when no catalog entry survives", () => {
    const vendor = path.join(tmpDir, "node_modules/example");
    fs.mkdirSync(vendor, { recursive: true });
    fs.writeFileSync(path.join(vendor, "package.json"), "{}");
    fs.writeFileSync(path.join(vendor, "README.md"), "# vendor");
    fs.writeFileSync(path.join(tmpDir, "other.md"), "# Root document");
    const unsupported = process.platform === "win32" ? "other.md" : ".trellis/research/alias.md";
    if (process.platform !== "win32")
      fs.symlinkSync(path.join(tmpDir, "other.md"), path.join(tmpDir, unsupported));
    fs.writeFileSync(path.join(tmpDir, ".trellis/index.md"), [
      "# Knowledge", "", "* [gone](docs/moved.md)", "- bad separator", "",
      "- node_modules/example/README.md - vendor", `- ${unsupported} — other`, "+",
    ].join("\n"));
    const { text } = hook("codex", "invalid-catalog");
    expect(text).toContain("- .trellis/spec/guides/index.md");
    expect(text).toContain("Skipped 5 invalid catalog entries. See .trellis/index.md (lines 3, 4, 6, …).");
    expect(text).not.toContain("alias.md");
  });

  it("keeps the entry when an inherited hook runs against older project scripts", () => {
    fs.unlinkSync(path.join(tmpDir, ".trellis/scripts/common/knowledge_catalog.py"));
    const { text } = hook("codex", "old-project");
    expect(text).toContain("Open .trellis/index.md if present");
    expect(text).toContain("$mini-trellis-remember");
  });

  it("keeps a complete navigation pointer when the entire hook exceeds its budget", () => {
    const backend = path.join(tmpDir, ".trellis/spec/backend");
    fs.mkdirSync(backend, { recursive: true });
    fs.writeFileSync(path.join(backend, "index.md"), "# Backend\n");
    const packages = Array.from({ length: 180 }, (_, i) =>
      `  long-workspace-package-${i}:\n    path: pkgs/p${i}`);
    fs.writeFileSync(path.join(tmpDir, ".trellis/config.yaml"), ["packages:", ...packages].join("\n"));
    for (const text of [hook("codex", "many-packages").text, buildSessionContext({ directory: tmpDir })]) {
      expect(text.length).toBeLessThanOrEqual(4000);
      expect(text).toContain("[mini-trellis context truncated; open .trellis/index.md or .trellis/spec/]");
      expect(text).not.toContain("Monorepo packages: long-workspace-package");
      expect(text.trimEnd().endsWith("</ready>")).toBe(true);
    }
  });

  it("Pi reuses present context and restores it after compaction", () => {
    const source = fs.readFileSync(
      path.join(
        CLI_ROOT,
        "src/templates/pi/extensions/mini-trellis/index.ts.txt",
      ),
      "utf8",
    );
    const code = transpileModule(source, {
      compilerOptions: { module: ModuleKind.ESNext },
    }).outputText;
    const result = execFileSync(process.execPath, ["--input-type=module"], {
      cwd: tmpDir,
      encoding: "utf8",
      env: { ...process.env, TRELLIS_SUBAGENT_CHILD: "0" },
      input: `
        const { default: extension } = await import(${JSON.stringify(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)});
        const handlers = {};
        extension({ on(name, handler) { handlers[name] = handler; } });
        const fire = systemPrompt => handlers.before_agent_start({ systemPrompt }).systemPrompt;
        const first = fire('existing');
        const repeated = fire(first);
        const fs = await import('node:fs');
        fs.writeFileSync('.trellis/index.md', '- .trellis/spec/guides/mini-memory.md — new entry');
        process.stdout.write(JSON.stringify({ first, repeated, changed: fire(first), compacted: fire('compacted') }));
      `,
    });
    const value = JSON.parse(result);
    expect(value.repeated).toBe(value.first);
    expect(value.changed.match(/mini-trellis memory is available/g)).toHaveLength(1);
    expect(value.changed).toContain("mini-memory.md — new entry");
    assertMemoryPayload(value.compacted);
    expect(value.first).toContain("/mini-trellis-remember");
    expect(value.compacted).toContain("/mini-trellis-remember");
    expect(value.compacted).not.toContain("/mini-trellis:remember");
    expect(value.compacted.startsWith("compacted")).toBe(true);
  });

  it("keeps the startup entry bounded with a large research directory", () => {
    const research = path.join(tmpDir, ".trellis/research");
    for (let i = 0; i < 1000; i++) {
      fs.writeFileSync(path.join(research, `topic-${i}.md`), `# Topic ${i}\n`);
    }
    const hookPath = path.join(tmpDir, ".claude/hooks/session-start.py");
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.copyFileSync(SHARED_HOOK, hookPath);
    const result = spawnSync("python3", [hookPath], {
      cwd: tmpDir,
      encoding: "utf-8",
      input: JSON.stringify({
        cwd: tmpDir,
        source: "startup",
        session_id: "large",
      }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
    });
    const parsed = JSON.parse(result.stdout) as {
      hookSpecificOutput?: { additionalContext?: string };
    };
    const text = parsed.hookSpecificOutput?.additionalContext ?? "";
    expect(result.status).toBe(0);
    expect(text.length).toBeLessThan(4000);
    expect(text).not.toContain("topic-999.md");
  });

  it("keeps startup dedupe state separate for parallel host sessions", () => {
    const hookPath = path.join(tmpDir, ".claude/hooks/session-start.py");
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.copyFileSync(SHARED_HOOK, hookPath);
    for (const sessionId of ["session-a", "session-b"]) {
      const result = spawnSync("python3", [hookPath], {
        cwd: tmpDir,
        encoding: "utf-8",
        input: JSON.stringify({
          cwd: tmpDir,
          source: "startup",
          session_id: sessionId,
        }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).not.toBe("{}");
    }
    const files = fs.readdirSync(
      path.join(tmpDir, ".trellis/.runtime/context/claude"),
    );
    expect(files).toHaveLength(2);
  });

  it.each(["\n", "\r\n"])(
    "Pi reads the initialized developer record with %j line endings",
    (eol) => {
      fs.writeFileSync(
        path.join(tmpDir, ".trellis/.developer"),
        `name=tester${eol}initialized_at=2026-09-28${eol}`,
      );
      const workspace = path.join(tmpDir, ".trellis/workspace/tester");
      fs.mkdirSync(workspace, { recursive: true });
      fs.writeFileSync(
        path.join(workspace, "journal-1.md"),
        "# Older journal\n",
      );
      fs.writeFileSync(
        path.join(workspace, "journal-2.md"),
        "# Current journal\n",
      );
      const source = fs.readFileSync(
        path.join(
          CLI_ROOT,
          "src/templates/pi/extensions/mini-trellis/index.ts.txt",
        ),
        "utf-8",
      );
      const code = transpileModule(source, {
        compilerOptions: { module: ModuleKind.ESNext },
      }).outputText;
      const text = execFileSync(process.execPath, ["--input-type=module"], {
        cwd: tmpDir,
        encoding: "utf-8",
        env: { ...process.env, TRELLIS_SUBAGENT_CHILD: "0" },
        input: `
        const { default: extension } = await import(${JSON.stringify(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)});
        const handlers = {};
        extension({ on(name, handler) { handlers[name] = handler; } });
        process.stdout.write(handlers.before_agent_start({ systemPrompt: "existing" }).systemPrompt);
      `,
      });
      assertMemoryPayload(text);
      expect(text).toContain("Journal: .trellis/workspace/tester/journal-2.md");
      expect(text).not.toContain("initialized_at=");
    },
  );
});
