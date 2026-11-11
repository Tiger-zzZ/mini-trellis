import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "../../src/commands/init.js";
import { uninstall } from "../../src/commands/uninstall.js";
import { runRefresh } from "../../src/commands/refresh.js";
import { buildDoctorReport } from "../../src/commands/doctor.js";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import { resetResolvedPythonCommand } from "../../src/configurators/shared.js";
import { setWriteMode } from "../../src/utils/file-writer.js";
import {
  hashContent,
  readManifest,
  writeManifest,
} from "../../src/utils/managed-manifest.js";

let cwd: string;
function write(relative: string, content: string) {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(relative: string) {
  return fs.readFileSync(path.join(cwd, relative), "utf8");
}
beforeEach(() => {
  cwd = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-pi-omp-")),
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

describe("Pi and OMP project assets", () => {
  it.each(["pi", "omp"] as const)(
    "installs %s with an argument-aware remember prompt and discoverable skills",
    async (host) => {
      await init({ [host]: true, yes: true, user: "tester" });
      expect(read(`.${host}/prompts/mini-trellis-remember.md`)).toMatch(
        /\n\n\$ARGUMENTS\n$/,
      );
      expect(read(`.${host}/extensions/mini-trellis/index.ts`)).toContain(
        "before_agent_start",
      );
      const skillRoot = host === "pi" ? ".agents/skills" : ".omp/skills";
      expect(fs.readdirSync(path.join(cwd, skillRoot)).sort()).toEqual([
        "mini-trellis-session-insight",
        "mini-trellis-update-spec",
      ]);
      const report = buildDoctorReport(cwd);
      expect(report.platforms).toEqual([host]);
      expect(report.ok).toBe(true);
    },
  );

  it("refreshes an owned pre-fix Pi prompt and keeps local edits as conflicts", async () => {
    await init({ pi: true, yes: true, user: "tester" });
    const relative = ".pi/prompts/mini-trellis-remember.md";
    const oldPrompt = read(relative).replace(/\n\n\$ARGUMENTS\n$/, "\n");
    write(relative, oldPrompt);
    const manifest = readManifest(cwd);
    manifest.files[relative] = hashContent(oldPrompt);
    writeManifest(cwd, manifest);
    expect(runRefresh({ cwd, dryRun: true }).items).toContainEqual(
      expect.objectContaining({ path: relative, action: "update" }),
    );
    expect(read(relative)).toBe(oldPrompt);
    expect(runRefresh({ cwd }).ok).toBe(true);
    expect(read(relative)).toContain("$ARGUMENTS");
    write(relative, "user-edited prompt\n");
    expect(runRefresh({ cwd }).ok).toBe(false);
    expect(read(relative)).toBe("user-edited prompt\n");
  });

  it("shares the hook implementation while installing separate native host roots", async () => {
    await init({ pi: true, omp: true, yes: true, user: "tester" });
    expect(read(".omp/extensions/mini-trellis/index.ts")).toBe(
      read(".pi/extensions/mini-trellis/index.ts"),
    );
    expect(fs.existsSync(path.join(cwd, ".omp/settings.json"))).toBe(false);
    expect(buildDoctorReport(cwd).platforms).toEqual(["pi", "omp"]);
    expect(
      collectPlatformTemplates("omp")?.get(
        ".omp/skills/mini-trellis-session-insight/SKILL.md",
      ),
    ).toContain("mini-trellis mem recall");
  });

  it("refreshes OMP assets and uninstalls them while retaining user files", async () => {
    await init({ omp: true, yes: true, user: "tester" });
    write(".trellis/research/callback.md", "confirmed rule\n");
    write(".omp/config.yml", "theme: custom\n");
    write(".omp/prompts/user.md", "user prompt\n");
    write(".omp/extensions/user.ts", "export default () => {};\n");
    const prompt = ".omp/prompts/mini-trellis-remember.md";
    fs.unlinkSync(path.join(cwd, prompt));
    const refreshed = runRefresh({ cwd });
    expect(refreshed.platforms).toEqual(["omp"]);
    expect(refreshed.ok).toBe(true);
    expect(read(prompt)).toContain("$ARGUMENTS");
    expect(read(".trellis/research/callback.md")).toBe("confirmed rule\n");
    await uninstall({ yes: true });
    expect(fs.existsSync(path.join(cwd, prompt))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".omp/extensions/mini-trellis"))).toBe(
      false,
    );
    expect(read(".omp/config.yml")).toBe("theme: custom\n");
    expect(read(".omp/prompts/user.md")).toBe("user prompt\n");
    expect(read(".omp/extensions/user.ts")).toBe("export default () => {};\n");
  });

  it.skipIf(process.platform === "win32")(
    "rejects an OMP root linked outside the project before writing assets",
    async () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "omp-config-"));
      try {
        fs.symlinkSync(outside, path.join(cwd, ".omp"), "dir");
        await expect(
          init({ omp: true, yes: true, user: "tester" }),
        ).rejects.toThrow(/escapes project root/);
        expect(fs.readdirSync(outside)).toEqual([]);
        expect(fs.existsSync(path.join(cwd, ".trellis"))).toBe(false);
        expect(runRefresh({ cwd, omp: true }).ok).toBe(false);
        expect(fs.readdirSync(outside)).toEqual([]);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    },
  );
});
