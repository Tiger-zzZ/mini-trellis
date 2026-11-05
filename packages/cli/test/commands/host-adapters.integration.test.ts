import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configurePlatform,
  collectPlatformTemplates,
  getConfiguredPlatforms,
} from "../../src/configurators/index.js";
import { setWriteMode } from "../../src/utils/file-writer.js";
import { readManifest, hashFile } from "../../src/utils/managed-manifest.js";
import { buildRefreshPlan, runRefresh } from "../../src/commands/refresh.js";
import { buildDoctorReport } from "../../src/commands/doctor.js";
import {
  installedOpenCodeVersions,
  resolveOpenCodeVersion,
} from "../../src/utils/opencode-version.js";
import { collectTrellisScriptTemplates } from "../../src/templates/extract.js";
import {
  buildMigratePlan,
  legacyHostPlatforms,
  migrate,
} from "../../src/commands/migrate.js";
import {
  buildManagedRemovalPlan,
  executeManagedRemovalPlan,
} from "../../src/utils/managed-removal.js";
import { init } from "../../src/commands/init.js";

const dirs: string[] = [];
function project(): string {
  const cwd = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-hosts-")),
  );
  dirs.push(cwd);
  return cwd;
}
function write(cwd: string, relative: string, content: string): void {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(cwd: string, relative: string): string {
  return fs.readFileSync(path.join(cwd, relative), "utf8");
}
function snapshot(cwd: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else
        files[path.relative(cwd, file)] = read(cwd, path.relative(cwd, file));
    }
  }
  walk(cwd);
  return files;
}
beforeEach(() => {
  setWriteMode("force");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  setWriteMode("ask");
  for (const cwd of dirs.splice(0))
    fs.rmSync(cwd, { recursive: true, force: true });
});

describe("OpenCode protocol lifecycle", () => {
  it("initializes V2 without a protocol flag and keeps it on refresh", async () => {
    const cwd = project();
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    await init({ opencode: true, yes: true, user: "probe" });
    expect(installedOpenCodeVersions(cwd)).toEqual(["2"]);
    expect(runRefresh({ cwd, opencode: true }).opencodeVersion).toBe("2");
  });
  it.each(["1", "2"] as const)(
    "installs only V%s and preserves it on refresh",
    async (version) => {
      const cwd = project();
      await configurePlatform("opencode", cwd, { opencodeVersion: version });
      expect(installedOpenCodeVersions(cwd)).toEqual([version]);
      expect(resolveOpenCodeVersion(cwd)).toBe(version);
      expect(runRefresh({ cwd, opencode: true }).opencodeVersion).toBe(version);
      expect(installedOpenCodeVersions(cwd)).toEqual([version]);
      expect(
        buildDoctorReport(cwd).checks.find(
          (check) => check.name === "opencode-trigger",
        )?.level,
      ).toBe("ok");
      expect(
        buildDoctorReport(cwd).checks.find(
          (check) => check.name === "opencode-runtime",
        )?.level,
      ).toBe("unknown");
    },
  );
  it.each([
    ["1", "2"],
    ["2", "1"],
  ] as const)(
    "switches V%s to V%s with a read-only preview",
    async (from, to) => {
      const cwd = project();
      await configurePlatform("opencode", cwd, { opencodeVersion: from });
      write(cwd, ".opencode/plugins/user.js", "export default userPlugin;\n");
      const before = snapshot(cwd);
      const preview = runRefresh({
        cwd,
        opencode: true,
        opencodeVersion: to,
        dryRun: true,
      });
      expect(preview.ok).toBe(true);
      expect(
        preview.items.some(
          (item) => item.action === "remove" && item.path.includes("plugins/"),
        ),
      ).toBe(true);
      expect(snapshot(cwd)).toEqual(before);
      expect(runRefresh({ cwd, opencode: true, opencodeVersion: to }).ok).toBe(
        true,
      );
      expect(installedOpenCodeVersions(cwd)).toEqual([to]);
      if (from === "2")
        expect(
          fs.existsSync(path.join(cwd, ".opencode/plugins/mini-trellis")),
        ).toBe(false);
      expect(read(cwd, ".opencode/plugins/user.js")).toBe(
        "export default userPlugin;\n",
      );
      expect(
        readManifest(cwd).files[
          to === "2"
            ? ".opencode/plugins/session-start.js"
            : ".opencode/plugins/mini-trellis/index.js"
        ],
      ).toBeUndefined();
    },
  );
  it("switches safely during repeated init even when existing files normally skip", async () => {
    const cwd = project();
    await configurePlatform("opencode", cwd, { opencodeVersion: "1" });
    const original = JSON.parse(read(cwd, ".opencode/package.json"));
    setWriteMode("skip");
    await configurePlatform("opencode", cwd, { opencodeVersion: "2" });
    expect(installedOpenCodeVersions(cwd)).toEqual(["2"]);
    expect(JSON.parse(read(cwd, ".opencode/package.json"))).toEqual({
      ...original,
      type: "module",
    });
  });
  it("preserves host SDK pins and user dependencies through refresh and protocol switches", async () => {
    const cwd = project();
    await configurePlatform("opencode", cwd, { opencodeVersion: "1" });
    const original = {
      dependencies: {
        "@opencode-ai/plugin": "1.18.29",
        "user-plugin": "file:./custom",
      },
      scripts: { check: "echo user" },
    };
    write(cwd, ".opencode/package.json", JSON.stringify(original));
    for (const version of ["1", "2", "1"] as const) {
      const before = snapshot(cwd);
      const preview = runRefresh({
        cwd,
        opencode: true,
        opencodeVersion: version,
        dryRun: true,
      });
      expect(preview.ok).toBe(true);
      expect(snapshot(cwd)).toEqual(before);
      expect(
        runRefresh({ cwd, opencode: true, opencodeVersion: version }).ok,
      ).toBe(true);
      const actual = JSON.parse(read(cwd, ".opencode/package.json"));
      expect(actual.dependencies).toEqual(original.dependencies);
      expect(actual.scripts).toEqual(original.scripts);
      expect(installedOpenCodeVersions(cwd)).toEqual([version]);
    }
  });
  it.each([
    "null",
    "[]",
    '{"dependencies":[]}',
    '{"dependencies":{"user-plugin":null}}',
    '{"type":"commonjs"}',
  ])(
    "rejects an incompatible V2 package before changing files: %s",
    async (content) => {
      const cwd = project();
      await configurePlatform("opencode", cwd, { opencodeVersion: "1" });
      write(cwd, ".opencode/package.json", content);
      const before = snapshot(cwd);
      expect(runRefresh({ cwd, opencode: true, opencodeVersion: "2" }).ok).toBe(
        false,
      );
      await expect(
        configurePlatform("opencode", cwd, { opencodeVersion: "2" }),
      ).rejects.toThrow(/OpenCode/);
      expect(snapshot(cwd)).toEqual(before);
    },
  );
  it("keeps a modified or unowned entry and all other bytes on failure", async () => {
    const cwd = project();
    await configurePlatform("opencode", cwd, { opencodeVersion: "1" });
    write(cwd, ".opencode/plugins/session-start.js", "// user edited\n");
    const before = snapshot(cwd);
    expect(runRefresh({ cwd, opencode: true, opencodeVersion: "2" }).ok).toBe(
      false,
    );
    await expect(
      configurePlatform("opencode", cwd, { opencodeVersion: "2" }),
    ).rejects.toThrow(/modified or unowned/);
    expect(snapshot(cwd)).toEqual(before);
  });
  it.each(["1", "2"] as const)(
    "keeps shared SDK dependencies when uninstalling V%s",
    async (version) => {
      const cwd = project();
      await configurePlatform("opencode", cwd, { opencodeVersion: version });
      const config = JSON.stringify({
        type: "module",
        dependencies: { "@opencode-ai/plugin": "1.18.29" },
      });
      write(cwd, ".opencode/package.json", config);
      write(
        cwd,
        ".opencode/plugins/user.js",
        "import { tool } from '@opencode-ai/plugin';\n",
      );
      const owned = Object.fromEntries(
        [
          ...(
            collectPlatformTemplates("opencode", {
              opencodeVersion: version,
            }) ?? new Map()
          ).keys(),
        ].map((relative) => [relative, ""]),
      );
      const plan = buildManagedRemovalPlan(cwd, owned);
      expect(
        plan.deletions.some(
          (item) => item.posixPath === ".opencode/package.json",
        ),
      ).toBe(false);
      expect(
        plan.modifications.some(
          (item) => item.posixPath === ".opencode/package.json",
        ),
      ).toBe(false);
      expect(
        plan.deletions.some(
          (item) => item.posixPath === ".opencode/plugins/user.js",
        ),
      ).toBe(false);
      executeManagedRemovalPlan(cwd, plan);
      expect(read(cwd, ".opencode/package.json")).toBe(config);
      expect(read(cwd, ".opencode/plugins/user.js")).toContain(
        "@opencode-ai/plugin",
      );
      expect(installedOpenCodeVersions(cwd)).toEqual([]);
    },
  );
  it("reports duplicate entries and keeps both intact", async () => {
    const cwd = project();
    await configurePlatform("opencode", cwd, { opencodeVersion: "1" });
    write(
      cwd,
      ".opencode/plugins/mini-trellis/index.js",
      "// another active entry\n",
    );
    const before = snapshot(cwd);
    expect(buildRefreshPlan(cwd, ["opencode"]).ok).toBe(false);
    expect(
      buildDoctorReport(cwd).checks.find(
        (check) => check.name === "opencode-protocol",
      )?.level,
    ).toBe("error");
    expect(snapshot(cwd)).toEqual(before);
  });
  it("rejects unsupported protocol choices before writes", async () => {
    const cwd = project();
    expect(runRefresh({ cwd, opencode: true, opencodeVersion: "3" }).ok).toBe(
      false,
    );
    expect(fs.readdirSync(cwd)).toEqual([]);
    expect(runRefresh({ cwd, codebuddy: true, opencodeVersion: "2" }).ok).toBe(
      false,
    );
  });
});

describe("shared CodeBuddy CLI / IDE assets", () => {
  it.each([
    "echo .codebuddy/hooks/session-start.py",
    "python3 .codebuddy/hooks/session-start.py.disabled",
  ])(
    "does not mistake a path mention for a registered hook: %s",
    async (command) => {
      const cwd = project();
      await configurePlatform("codebuddy", cwd);
      write(
        cwd,
        ".codebuddy/settings.json",
        JSON.stringify({
          hooks: {
            SessionStart: [
              { matcher: "startup", hooks: [{ type: "command", command }] },
            ],
          },
        }),
      );
      expect(
        buildDoctorReport(cwd).checks.find(
          (check) => check.name === "codebuddy-config",
        )?.level,
      ).toBe("error");
    },
  );

  it("preserves user settings and combined matcher hooks across repeated installs and refresh", async () => {
    const cwd = project();
    const command = "python3 .codebuddy/hooks/session-start.py";
    const user = {
      env: { USER_SETTING: "keep" },
      permissions: { allow: ["Read"] },
      hooks: {
        SessionStart: [
          {
            matcher: "startup",
            hooks: [
              { type: "command", command },
              { type: "command", command: "echo user" },
            ],
          },
        ],
        Stop: [{ hooks: [{ type: "command", command: "echo stopped" }] }],
      },
    };
    write(cwd, ".codebuddy/settings.json", JSON.stringify(user));
    await configurePlatform("codebuddy", cwd);
    await configurePlatform("codebuddy", cwd);
    expect(runRefresh({ cwd, codebuddy: true }).ok).toBe(true);
    const settings = JSON.parse(read(cwd, ".codebuddy/settings.json"));
    expect(settings.env).toEqual(user.env);
    expect(settings.permissions).toEqual(user.permissions);
    expect(settings.hooks.Stop).toEqual(user.hooks.Stop);
    expect(
      settings.hooks.SessionStart.flatMap(
        (group: { hooks: { command: string }[] }) => group.hooks,
      ).filter((hook: { command: string }) => hook.command === command),
    ).toHaveLength(4);
    expect(settings.hooks.SessionStart[0].hooks).toHaveLength(2);
    expect(getConfiguredPlatforms(cwd).has("codebuddy")).toBe(true);
    expect(
      buildDoctorReport(cwd).checks.find(
        (check) => check.name === "codebuddy-config",
      ),
    ).toBeUndefined();
    expect(
      buildDoctorReport(cwd).checks.find(
        (check) => check.name === "codebuddy-runtime",
      )?.level,
    ).toBe("unknown");
    const names = [
      ...(collectPlatformTemplates("codebuddy") ?? new Map()).keys(),
    ];
    expect(names).toContain(
      ".codebuddy/skills/mini-trellis-session-insight/SKILL.md",
    );
    expect(names).toContain(".codebuddy/skills/mini-trellis-remember/SKILL.md");
    expect(names.some((name) => /inject-|\/agents\//.test(name))).toBe(false);
  });
  it.each([
    "{",
    "null",
    "[]",
    '{"hooks":[]}',
    '{"hooks":{"SessionStart":{}}}',
    '{"hooks":{"SessionStart":[{"hooks":[{"type":"command"}]}]}}',
    '{"hooks":{"SessionStart":[{"matcher":"[","hooks":[]}]}}',
  ])(
    "keeps invalid configuration %s without creating host assets",
    async (content) => {
      const cwd = project();
      write(cwd, ".codebuddy/settings.json", content);
      const before = snapshot(cwd);
      await expect(configurePlatform("codebuddy", cwd)).rejects.toThrow(
        /CodeBuddy/,
      );
      expect(runRefresh({ cwd, codebuddy: true }).ok).toBe(false);
      expect(
        buildDoctorReport(cwd).checks.find(
          (check) => check.name === "codebuddy-config",
        )?.level,
      ).toBe("error");
      expect(snapshot(cwd)).toEqual(before);
    },
  );
  it.each(["init", "migrate"])(
    "preflights invalid settings before %s changes any project files",
    async (operation) => {
      const cwd = project();
      vi.spyOn(process, "cwd").mockReturnValue(cwd);
      write(cwd, ".codebuddy/settings.json", "[]\n");
      if (operation === "migrate")
        write(cwd, ".codebuddy/hooks/inject-workflow-state.py", "# legacy\n");
      const before = snapshot(cwd);
      await expect(
        operation === "migrate"
          ? migrate({ yes: true })
          : init({ codebuddy: true, yes: true, user: "probe" }),
      ).rejects.toThrow(/CodeBuddy settings/);
      expect(snapshot(cwd)).toEqual(before);
    },
  );
  it("migrates known stale registrations with missing scripts and keeps same-event user hooks", async () => {
    const cwd = project();
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    write(
      cwd,
      ".codebuddy/settings.json",
      JSON.stringify({
        env: { USER_SETTING: "keep" },
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: "command",
                  command: "python3 .codebuddy/hooks/inject-workflow-state.py",
                },
                {
                  type: "command",
                  command: "echo .codebuddy/hooks/inject-workflow-state.py",
                },
              ],
            },
          ],
        },
      }),
    );
    expect(legacyHostPlatforms(cwd)).toContain("codebuddy");
    expect(buildMigratePlan(cwd).reconfigure).toContain("codebuddy");
    await migrate({ yes: true });
    const settings = JSON.parse(read(cwd, ".codebuddy/settings.json"));
    expect(settings.env).toEqual({ USER_SETTING: "keep" });
    expect(settings.hooks.UserPromptSubmit[0].hooks).toEqual([
      {
        type: "command",
        command: "echo .codebuddy/hooks/inject-workflow-state.py",
      },
    ]);
    expect(legacyHostPlatforms(cwd)).not.toContain("codebuddy");
    const before = snapshot(cwd);
    await migrate({ yes: true });
    expect(snapshot(cwd)).toEqual(before);
  });
  it("uninstalls managed hooks while preserving user configuration", async () => {
    const cwd = project();
    await configurePlatform("codebuddy", cwd);
    const settings = JSON.parse(read(cwd, ".codebuddy/settings.json"));
    settings.env = { USER_SETTING: "keep" };
    write(cwd, ".codebuddy/settings.json", JSON.stringify(settings));
    const owned = Object.fromEntries(
      [...(collectPlatformTemplates("codebuddy") ?? new Map()).keys()].map(
        (relative) => [relative, ""],
      ),
    );
    const plan = buildManagedRemovalPlan(cwd, owned);
    expect(
      plan.modifications.find(
        (item) => item.posixPath === ".codebuddy/settings.json",
      )?.result.content,
    ).toContain("USER_SETTING");
    expect(
      plan.deletions.some(
        (item) => item.posixPath === ".codebuddy/hooks/session-start.py",
      ),
    ).toBe(true);
    expect(hashFile(path.join(cwd, ".codebuddy/settings.json"))).not.toBeNull();
  });
});

describe("host asset preflight", () => {
  it.each([
    ["codebuddy", ".codebuddy/skills/mini-trellis-remember/SKILL.md"],
    ["opencode", ".opencode/plugins/mini-trellis/index.js"],
  ] as const)(
    "rejects a directory at a %s file destination before any writes",
    async (host, relative) => {
      const cwd = project();
      fs.mkdirSync(path.join(cwd, relative), { recursive: true });
      write(cwd, `${relative}/user.txt`, "keep\n");
      const before = snapshot(cwd);
      vi.spyOn(process, "cwd").mockReturnValue(cwd);
      await expect(
        init({
          [host]: true,
          ...(host === "opencode" ? { opencodeVersion: "2" } : {}),
          yes: true,
          user: "probe",
        }),
      ).rejects.toThrow(/not a regular file/);
      expect(snapshot(cwd)).toEqual(before);
      expect(
        runRefresh({
          cwd,
          [host]: true,
          ...(host === "opencode" ? { opencodeVersion: "2" } : {}),
        }).ok,
      ).toBe(false);
      expect(snapshot(cwd)).toEqual(before);
    },
  );
});

describe.skipIf(process.platform === "win32")(
  "project-local host configuration",
  () => {
    it.each(["opencode", "codebuddy"] as const)(
      "does not write through a %s directory linked outside the project",
      async (host) => {
        const cwd = project();
        const outside = project();
        write(outside, "settings.json", '{"env":{"USER_SETTING":"keep"}}\n');
        fs.symlinkSync(outside, path.join(cwd, `.${host}`), "dir");
        const before = snapshot(outside);
        await expect(
          configurePlatform(host, cwd, { opencodeVersion: "2" }),
        ).rejects.toThrow(/escapes project root/);
        expect(
          runRefresh({
            cwd,
            [host]: true,
            ...(host === "opencode" ? { opencodeVersion: "2" } : {}),
          }).ok,
        ).toBe(false);
        expect(snapshot(outside)).toEqual(before);
        expect(fs.existsSync(path.join(cwd, ".trellis"))).toBe(false);
      },
    );
    it("does not copy a linked global settings file into the project", async () => {
      const cwd = project();
      const outside = project();
      write(outside, "settings.json", '{"env":{"USER_SETTING":"keep"}}\n');
      fs.mkdirSync(path.join(cwd, ".codebuddy"));
      fs.symlinkSync(
        path.join(outside, "settings.json"),
        path.join(cwd, ".codebuddy/settings.json"),
      );
      await expect(configurePlatform("codebuddy", cwd)).rejects.toThrow(
        /escapes project root/,
      );
      expect(
        fs
          .lstatSync(path.join(cwd, ".codebuddy/settings.json"))
          .isSymbolicLink(),
      ).toBe(true);
      expect(read(outside, "settings.json")).toBe(
        '{"env":{"USER_SETTING":"keep"}}\n',
      );
    });
  },
);

describe("OpenCode V2 outgoing context", () => {
  it("uses session locations, restores ephemeral entries, updates changes and isolates parallel sessions", async () => {
    const cwd = project();
    const other = project();
    for (const root of [cwd, other])
      for (const [relative, content] of collectTrellisScriptTemplates())
        write(root, relative, content);
    write(cwd, ".trellis/.developer", "name=alice\n");
    write(other, ".trellis/.developer", "name=bob\n");
    await configurePlatform("opencode", cwd, { opencodeVersion: "2" });
    const result = execFileSync(process.execPath, ["--input-type=module"], {
      cwd,
      encoding: "utf8",
      input: `
      import { pathToFileURL } from 'node:url';
      import { writeFileSync } from 'node:fs';
      const { default: plugin } = await import(pathToFileURL(${JSON.stringify(path.join(cwd, ".opencode/plugins/mini-trellis/index.js"))}));
      let hook;
      await plugin.setup({ location: { directory: '/wrong-instance' }, session: {
        hook: async (name, fn) => { if (name === 'context') hook=fn; },
        get: async ({ sessionID }) => { if (sessionID === 'bad') throw new Error('unavailable'); return { location: { directory: sessionID === 'other' ? ${JSON.stringify(other)} : ${JSON.stringify(cwd)} } }; }
      }});
      const event = id => ({ sessionID:id, system:[{type:'text',text:'original system'}], messages:[{role:'user', content:'unchanged'}] });
      const first=event('same'); await hook(first); await hook(first);
      const resumed=event('same'); await hook(resumed);
      const parallel=event('other'); await hook(parallel);
      writeFileSync(${JSON.stringify(path.join(cwd, ".trellis/.developer"))}, 'name=carol\\n');
      await hook(first);
      const bad=event('bad'); await hook(bad);
      console.log(JSON.stringify({first,resumed,parallel,bad}));
    `,
    });
    const value = JSON.parse(result);
    expect(value.first.system).toHaveLength(2);
    expect(value.first.system[1].text).toContain("Developer: carol");
    expect(value.resumed.system[1].text).toContain("Developer: alice");
    expect(value.parallel.system[1].text).toContain("Developer: bob");
    expect(value.first.messages).toEqual([
      { role: "user", content: "unchanged" },
    ]);
    expect(value.bad.system).toHaveLength(1);
    expect(value.first.system[1].text.length).toBeLessThanOrEqual(4100);
  });
});
