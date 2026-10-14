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

  function hook(host = "claude", sessionId?: string, source = "startup") {
    const file = path.join(tmpDir, `.${host}/hooks/session-start.py`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(SHARED_HOOK, file);
    fs.writeFileSync(
      path.join(
        tmpDir,
        `.${host}/${host === "codex" ? "hooks" : "settings"}.json`,
      ),
      "{}",
    );
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !key.endsWith("_PROJECT_DIR") && !key.endsWith("_NON_INTERACTIVE") &&
      !key.startsWith("TRELLIS_") && key !== "CLAUDE_ENV_FILE"));
    const result = spawnSync("python3", [file], {
      cwd: tmpDir,
      encoding: "utf8",
      env,
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

  it.each(["claude", "codex"])(
    "%s deduplicates startup and restores context after compact, clear and resume",
    (host) => {
      const first = hook(host, "same");
      assertMemoryPayload(first.text);
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
        if (source === "compact") expect(text).toContain("follows compact");
        else expect(text).not.toContain("follows compact");
      }
      expect(first.text).not.toContain("follows compact");
      expect(first.text).not.toContain("read back");
      expect(first.text.length).toBeLessThan(1600);
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

  it("uses Codex's nested output contract without a duplicate compatibility field", () => {
    // Use a neutral script path so the CODEX_PROJECT_DIR environment variable,
    // rather than the install directory name, proves platform detection.
    const hookPath = path.join(tmpDir, "session-start.py");
    fs.copyFileSync(SHARED_HOOK, hookPath);
    const result = spawnSync("python3", [hookPath], {
      cwd: tmpDir,
      encoding: "utf-8",
      input: JSON.stringify({ cwd: tmpDir, source: "startup", session_id: "codex-contract" }),
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
  });

  it("OpenCode deduplicates the model payload, restores compacted context, and preserves stored user text", () => {
    const moduleUrl = pathToFileURL(path.join(CLI_ROOT, "src/templates/opencode/plugins/session-start.js")).href;
    const result = execFileSync(process.execPath, ["--input-type=module"], {
      cwd: tmpDir, encoding: "utf8",
      env: { ...process.env, TRELLIS_HOOKS: "1", TRELLIS_DISABLE_HOOKS: "0", OPENCODE_NON_INTERACTIVE: "0" },
      input: `
        import plugin from ${JSON.stringify(moduleUrl)};
        const handlers = await plugin({ directory: process.cwd() });
        const transform = handlers['experimental.chat.messages.transform'];
        const original = { info: { role: 'user', sessionID: 'fixture', agent: 'build' }, parts: [{ type: 'text', text: 'User request' }] };
        const output = { messages: [original] };
        await transform({}, output);
        await transform({}, output);
        const compacted = { messages: [original] };
        await transform({}, compacted);
        process.stdout.write(JSON.stringify({ original, messages: output.messages, compacted: compacted.messages }));
      `,
    });
    const value = JSON.parse(result);
    expect(value.original.parts).toEqual([{ type: "text", text: "User request" }]);
    expect(value.messages[0].parts).toHaveLength(2);
    expect(value.compacted[0].parts).toHaveLength(2);
    assertMemoryPayload(value.messages[0].parts[0].text);
  });

  it("Pi reuses present context and restores it after compaction", () => {
    const source = fs.readFileSync(path.join(CLI_ROOT, "src/templates/pi/extensions/mini-trellis/index.ts.txt"), "utf8");
    const code = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } }).outputText;
    const result = execFileSync(process.execPath, ["--input-type=module"], {
      cwd: tmpDir, encoding: "utf8", env: { ...process.env, TRELLIS_SUBAGENT_CHILD: "0" },
      input: `
        const { default: extension } = await import(${JSON.stringify(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)});
        const handlers = {};
        extension({ on(name, handler) { handlers[name] = handler; } });
        const fire = systemPrompt => handlers.before_agent_start({ systemPrompt }).systemPrompt;
        const first = fire('existing');
        process.stdout.write(JSON.stringify({ first, repeated: fire(first), compacted: fire('compacted') }));
      `,
    });
    const value = JSON.parse(result);
    expect(value.repeated).toBe(value.first);
    assertMemoryPayload(value.compacted);
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
