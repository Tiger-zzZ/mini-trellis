import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildUpgradeCommand,
  resolveUpgradeTag,
  upgrade,
} from "../../src/commands/upgrade.js";

let cwd: string;
beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-upgrade-"));
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(cwd, { recursive: true, force: true });
});
function installedProject() {
  fs.mkdirSync(path.join(cwd, ".trellis"));
  fs.writeFileSync(
    path.join(cwd, ".trellis/.mini-trellis-manifest.json"),
    '{"version":1,"files":{}}',
  );
}

describe("upgrade command", () => {
  it("defaults stable versions to latest", () => {
    expect(resolveUpgradeTag("0.5.12")).toBe("latest");
  });

  it("defaults beta versions to beta", () => {
    expect(resolveUpgradeTag("0.6.0-beta.8")).toBe("beta");
  });

  it("defaults rc versions to rc", () => {
    expect(resolveUpgradeTag("0.5.0-rc.7")).toBe("rc");
  });

  it("honors an explicit tag or version", () => {
    expect(resolveUpgradeTag("0.6.0-beta.8", "latest")).toBe("latest");
    expect(resolveUpgradeTag("0.6.0-beta.8", "0.6.0-beta.9")).toBe(
      "0.6.0-beta.9",
    );
  });

  it("rejects shell-shaped tags", () => {
    expect(() => resolveUpgradeTag("0.5.12", "latest && rm -rf /")).toThrow(
      /Invalid npm tag\/version/,
    );
  });

  it("builds POSIX npm global install command without shell", () => {
    expect(
      buildUpgradeCommand({ tag: "beta" }, "0.5.12", "darwin"),
    ).toMatchObject({
      command: "npm",
      args: ["install", "-g", "mini-trellis@beta"],
      spawnOptions: { stdio: "inherit", shell: false },
      displayCommand: "npm install -g mini-trellis@beta",
      target: "mini-trellis@beta",
      tag: "beta",
      binaryCheckCommand: "which mini-trellis",
    });
  });

  it("builds Windows command through cmd.exe", () => {
    expect(
      buildUpgradeCommand({ tag: "beta" }, "0.5.12", "win32"),
    ).toMatchObject({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm install -g mini-trellis@beta"],
      spawnOptions: { stdio: "inherit", shell: false },
      displayCommand: "npm install -g mini-trellis@beta",
      target: "mini-trellis@beta",
      tag: "beta",
      binaryCheckCommand: "where mini-trellis",
    });
  });

  it("dry-run does not execute npm", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runner = vi.fn();

    await upgrade({ dryRun: true, tag: "latest" }, runner);

    expect(runner).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Run: npm install -g mini-trellis@latest"),
    );

    log.mockRestore();
  });

  it("executes npm install for real upgrades", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runner = vi.fn(() => ({ status: 0, signal: null }));

    await upgrade({ tag: "latest" }, runner);

    expect(runner).toHaveBeenCalledWith(
      "npm",
      ["install", "-g", "mini-trellis@latest"],
      { stdio: "inherit", shell: false },
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("mini-trellis --version"),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("which mini-trellis"),
    );

    log.mockRestore();
  });

  it("fails when npm exits non-zero", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runner = vi.fn(() => ({ status: 1, signal: null }));

    await expect(upgrade({ tag: "latest" }, runner)).rejects.toThrow(
      /npm install failed with exit code 1\.[\s\S]*Troubleshooting:[\s\S]*Manual command: npm install -g mini-trellis@latest[\s\S]*npm config get prefix[\s\S]*which mini-trellis/,
    );

    log.mockRestore();
  });

  it("runs refresh from the newly installed global package in the current project", async () => {
    installedProject();
    const globalRoot = path.join(cwd, "npm root with spaces");
    const bin = path.join(globalRoot, "mini-trellis/bin");
    const runner = vi.fn((command, args, options) => {
      if (args[0] === "install") {
        fs.mkdirSync(bin, { recursive: true });
        fs.writeFileSync(
          path.join(bin, "mini-trellis.js"),
          'if (process.argv[2] !== "refresh") process.exit(2); require("node:fs").writeFileSync("refreshed.txt", "new CLI");',
        );
        return { status: 0, signal: null };
      }
      if (args[0] === "root")
        return { status: 0, signal: null, stdout: globalRoot + "\n" };
      return spawnSync(command, args, options);
    });
    await upgrade({}, runner);
    expect(fs.readFileSync(path.join(cwd, "refreshed.txt"), "utf8")).toBe(
      "new CLI",
    );
    expect(runner).toHaveBeenLastCalledWith(
      process.execPath,
      [path.join(bin, "mini-trellis.js"), "refresh"],
      { stdio: "inherit", shell: false, cwd },
    );
  });

  it("does not initialize a plain directory or legacy Trellis project", async () => {
    fs.mkdirSync(path.join(cwd, ".trellis"));
    fs.writeFileSync(
      path.join(cwd, "AGENTS.md"),
      "<!-- TRELLIS:START -->\n# Trellis\n<!-- TRELLIS:END -->",
    );
    const runner = vi.fn(() => ({ status: 0, signal: null }));
    await upgrade({}, runner);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(path.join(cwd, ".trellis"))).toEqual([]);
  });

  it("keeps dry-run read-only for installed projects", async () => {
    installedProject();
    const runner = vi.fn();
    await upgrade({ dryRun: true }, runner);
    expect(runner).not.toHaveBeenCalled();
  });

  it.each(["npm", "root", "refresh"])(
    "reports a failure at %s without claiming project success",
    async (step) => {
      installedProject();
      const runner = vi.fn((_command, args) => {
        if (args[0] === "install")
          return { status: step === "npm" ? 1 : 0, signal: null };
        if (args[0] === "root")
          return {
            status: step === "root" ? 1 : 0,
            signal: null,
            stdout: path.join(cwd, "global"),
          };
        return { status: 1, signal: null };
      });
      await expect(upgrade({}, runner)).rejects.toThrow(
        step === "npm"
          ? /npm install failed/
          : /CLI upgraded, but project refresh did not complete/,
      );
      expect(runner).toHaveBeenCalledTimes(
        step === "npm" ? 1 : step === "root" ? 2 : 3,
      );
    },
  );
});
