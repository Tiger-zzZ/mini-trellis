import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectTrellisScriptTemplates } from "../../src/templates/extract.js";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import {
  hashContent,
  readManifest,
  writeManifest,
} from "../../src/utils/managed-manifest.js";

const cli = fileURLToPath(
  new URL("../../bin/mini-trellis.js", import.meta.url),
);
const hook = ".codex/hooks/session-start.py";
let cwd: string;
function write(relative: string, content: string) {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(relative: string) {
  return fs.readFileSync(path.join(cwd, relative), "utf8");
}
function snapshot(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile())
        files[path.relative(cwd, file)] = fs.readFileSync(file, "utf8");
    }
  };
  walk(cwd);
  return files;
}
beforeEach(() => {
  cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "refresh-cli-")));
  execFileSync(
    process.execPath,
    [cli, "init", "--codex", "-u", "tester", "-y"],
    {
      cwd,
      stdio: "pipe",
    },
  );
});
afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

function terminal(
  args: string[],
  answer: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  // A real terminal is needed: piped Y is deliberately not consent.
  const result = execFileSync(
    "python3",
    [
      "-c",
      String.raw`
import json, os, pty, select, signal, subprocess, sys, time
master, slave = pty.openpty()
p = subprocess.Popen(sys.argv[2:], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
output = b""
sent = False
deadline = time.monotonic() + 8
try:
    while time.monotonic() < deadline:
        if select.select([master], [], [], 0.1)[0]:
            try:
                data = os.read(master, 65536)
            except OSError:
                break
            if not data:
                break
            output += data
            if b"[y/N] " in output and not sent:
                os.write(master, b"\x04" if sys.argv[1] == "EOF" else (sys.argv[1] + "\n").encode())
                sent = True
        elif p.poll() is not None:
            break
    else:
        raise RuntimeError("CLI did not finish")
    print(json.dumps({"status": p.wait(timeout=1), "output": output.decode(errors="replace")}))
finally:
    if p.poll() is None:
        os.killpg(p.pid, signal.SIGKILL)
        p.wait()
    os.close(master)
`,
      answer,
      process.execPath,
      cli,
      ...args,
    ],
    {
      cwd,
      env,
      encoding: "utf8",
      timeout: 12000,
    },
  );
  return JSON.parse(result) as { status: number; output: string };
}

describe.skipIf(process.platform === "win32")("interactive refresh CLI", () => {
  it("does not offer overwrite when OpenCode has two active protocols", () => {
    write(".opencode/plugins/session-start.js", "export default () => {};\n");
    write(".opencode/plugins/mini-trellis/index.js", "export default {};\n");
    const before = snapshot();
    const result = terminal(["refresh"], "Y");
    expect(result.status).toBe(1);
    expect(result.output).not.toContain("[y/N]");
    expect(snapshot()).toEqual(before);
  });
  it("recovers the Codex hook conflict while completing managed updates and preserving knowledge/config", () => {
    write(hook, "# previously rendered Codex hook\n");
    const manifest = readManifest(cwd);
    // The Python-rendering bug left this hook untracked.
    delete manifest.files[".codex/hooks/session-start.py"];
    const scripts = collectTrellisScriptTemplates();
    const skills = collectPlatformTemplates("codex");
    for (const relative of [
      ".trellis/scripts/common/active_task.py",
      ".agents/skills/mini-trellis-session-insight/SKILL.md",
      ".agents/skills/mini-trellis-session-insight/references/organize-history.md",
    ]) {
      const old = "previous managed template\n";
      write(relative, old);
      manifest.files[relative] = hashContent(old);
    }
    writeManifest(cwd, manifest);
    write(".trellis/research/callback.md", "confirmed knowledge\n");
    write(
      "AGENTS.md",
      "User instructions\n\n" + read("AGENTS.md") + "\nUser footer\n",
    );
    const hooks = JSON.parse(read(".codex/hooks.json"));
    hooks.userSetting = "keep";
    write(".codex/hooks.json", JSON.stringify(hooks));
    const result = terminal(["refresh"], "Y");
    expect(result.status, result.output).toBe(0);
    expect(result.output.match(/\[y\/N\]/g)).toHaveLength(1);
    expect(result.output).toContain(hook);
    expect(readManifest(cwd).files[hook]).toBe(hashContent(read(hook)));
    expect(read(hook)).toBe(collectPlatformTemplates("codex")?.get(hook));
    expect(read(".trellis/scripts/common/active_task.py")).toBe(
      scripts.get(".trellis/scripts/common/active_task.py"),
    );
    expect(read(".agents/skills/mini-trellis-session-insight/SKILL.md")).toBe(
      skills?.get(".agents/skills/mini-trellis-session-insight/SKILL.md"),
    );
    expect(
      read(
        ".agents/skills/mini-trellis-session-insight/references/organize-history.md",
      ),
    ).toBe(
      skills?.get(
        ".agents/skills/mini-trellis-session-insight/references/organize-history.md",
      ),
    );
    expect(read(".trellis/research/callback.md")).toBe("confirmed knowledge\n");
    expect(read("AGENTS.md").trimEnd()).toMatch(
      /^User instructions[\s\S]*User footer$/,
    );
    expect(JSON.parse(read(".codex/hooks.json")).userSetting).toBe("keep");
    const again = terminal(["refresh"], "Y");
    expect(again.status, again.output).toBe(0);
    expect(again.output).not.toContain("[y/N]");
  });

  it.each(["N", "", "EOF"])(
    "keeps every file and returns failure for %s",
    (answer) => {
      write(hook, "# local edit\n");
      const before = snapshot();
      const result = terminal(["refresh"], answer);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain("no files changed");
      expect(snapshot()).toEqual(before);
    },
  );

  it.each(["missing", "broken", "crlf"])(
    "can refresh after confirmation with a %s manifest/content",
    (condition) => {
      const manifestPath = ".trellis/.mini-trellis-manifest.json";
      if (condition === "missing") fs.unlinkSync(path.join(cwd, manifestPath));
      else if (condition === "broken") write(manifestPath, "{broken");
      if (condition === "crlf")
        write(hook, read(hook).replaceAll("\n", "\r\n"));
      else write(hook, "# old untracked template\n");
      const result = terminal(["refresh"], "Y");
      expect(result.status, result.output).toBe(0);
      expect(readManifest(cwd).files[hook]).toBe(hashContent(read(hook)));
      expect(read(hook)).not.toContain("\r\n");
    },
  );

  it.each([{ flags: ["--dry-run"] }, { flags: ["--json"] }])(
    "does not ask or overwrite with $flags",
    ({ flags }) => {
      write(hook, "# local edit\n");
      const before = snapshot();
      const result = terminal(["refresh", ...flags], "Y");
      expect(result.status).toBe(1);
      expect(result.output).not.toContain("[y/N]");
      expect(snapshot()).toEqual(before);
      if (flags.includes("--json"))
        expect(JSON.parse(result.output).ok).toBe(false);
    },
  );

  it("does not offer to overwrite invalid JSON or a directory at a file destination", () => {
    write(hook, "# local edit\n");
    write(".codex/hooks.json", "{broken");
    const before = snapshot();
    const result = terminal(["refresh"], "Y");
    expect(result.status).toBe(1);
    expect(result.output).not.toContain("[y/N]");
    expect(snapshot()).toEqual(before);
    write(".codex/hooks.json", "{}");
    fs.unlinkSync(path.join(cwd, hook));
    fs.mkdirSync(path.join(cwd, hook));
    const directory = terminal(["refresh"], "Y");
    expect(directory.status).toBe(1);
    expect(directory.output).not.toContain("[y/N]");
    expect(directory.output).toContain("not a regular file");
  });
});

describe("non-interactive refresh CLI", () => {
  it("does not accept piped Y as overwrite confirmation", () => {
    write(hook, "# local edit\n");
    const before = snapshot();
    const result = spawnSync(process.execPath, [cli, "refresh"], {
      cwd,
      input: "Y\n",
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).not.toContain("[y/N]");
    expect(snapshot()).toEqual(before);
  });
});

function fakeNpmEnvironment(): NodeJS.ProcessEnv {
  const globalRoot = path.join(cwd, "fake npm global");
  const install = path.join(globalRoot, "mini-trellis/bin/mini-trellis.js");
  const marker = path.join(cwd, "upgraded-cli-ran");
  write(
    "fake-bin/entry.mjs",
    `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'new CLI'); await import(${JSON.stringify(new URL("../../dist/cli/index.js", import.meta.url).href)});`,
  );
  write(
    "fake-bin/npm",
    `#!${process.execPath}\nconst fs = require('node:fs'); const path = require('node:path'); const args = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(path.join(cwd, "npm-calls.jsonl"))}, JSON.stringify(args)+'\\n'); if(args[0]==='root' && args[1]==='-g') console.log(${JSON.stringify(globalRoot)}); else if(args[0]==='install' && args[1]==='-g') { fs.mkdirSync(path.dirname(${JSON.stringify(install)}), {recursive:true}); fs.copyFileSync(${JSON.stringify(path.join(cwd, "fake-bin/entry.mjs"))}, ${JSON.stringify(install)}); fs.writeFileSync(${JSON.stringify(path.join(globalRoot, "mini-trellis/package.json"))}, '{"type":"module"}'); } else process.exit(2);\n`,
  );
  fs.chmodSync(path.join(cwd, "fake-bin/npm"), 0o755);
  return {
    ...process.env,
    PATH: path.join(cwd, "fake-bin") + path.delimiter + process.env.PATH,
  };
}

describe.skipIf(process.platform === "win32")(
  "upgrade to interactive refresh",
  () => {
    it.each([
      { condition: "edited hook", answer: "Y" },
      { condition: "edited hook", answer: "N" },
      { condition: "missing manifest", answer: "Y" },
      { condition: "broken manifest", answer: "Y" },
      { condition: "already current", answer: "Y" },
    ])(
      "runs the new CLI for $condition with $answer",
      ({ condition, answer }) => {
        if (condition !== "already current") write(hook, "# local edit\n");
        if (condition === "missing manifest")
          fs.unlinkSync(path.join(cwd, ".trellis/.mini-trellis-manifest.json"));
        if (condition === "broken manifest")
          write(".trellis/.mini-trellis-manifest.json", "{broken");
        write(".trellis/research/callback.md", "confirmed knowledge\n");
        const hooks = JSON.parse(read(".codex/hooks.json"));
        hooks.userSetting = "keep";
        write(".codex/hooks.json", JSON.stringify(hooks));
        const original = read(hook);
        const result = terminal(["upgrade"], answer, fakeNpmEnvironment());
        expect(result.status, result.output).toBe(answer === "Y" ? 0 : 1);
        expect(result.output.match(/\[y\/N\]/g) ?? []).toHaveLength(
          condition === "already current" ? 0 : 1,
        );
        expect(read(".trellis/research/callback.md")).toBe(
          "confirmed knowledge\n",
        );
        expect(JSON.parse(read(".codex/hooks.json")).userSetting).toBe("keep");
        expect(read("upgraded-cli-ran")).toBe("new CLI");
        expect(
          read("npm-calls.jsonl")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line)),
        ).toEqual([
          ["install", "-g", "mini-trellis@latest"],
          ["root", "-g"],
        ]);
        if (answer === "Y") {
          expect(readManifest(cwd).files[hook]).toBe(hashContent(read(hook)));
          expect(result.output).toContain("Current project refreshed");
        } else {
          expect(read(hook)).toBe(original);
          expect(result.output).toContain("project refresh did not complete");
          expect(result.output).not.toContain("Current project refreshed");
        }
      },
    );
    it("leaves conflicts pending in a non-interactive upgrade", () => {
      write(hook, "# local edit\n");
      const result = spawnSync(process.execPath, [cli, "upgrade"], {
        cwd,
        env: fakeNpmEnvironment(),
        input: "Y\n",
        encoding: "utf8",
        timeout: 5000,
      });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stdout).not.toContain("[y/N]");
      expect(read(hook)).toBe("# local edit\n");
      expect(result.stderr).toContain("project refresh did not complete");
    });
  },
);
