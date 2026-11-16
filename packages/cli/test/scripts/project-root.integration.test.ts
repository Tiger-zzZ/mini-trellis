import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProjectRoot } from "../../../core/src/mem/docs.js";

const SCRIPTS = path.resolve(__dirname, "../../src/templates/trellis/scripts");
const HOOK = path.resolve(
  __dirname,
  "../../src/templates/shared-hooks/session-start.py",
);

describe("project root agreement", () => {
  let temporary: string;
  beforeEach(() => {
    temporary = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "trellis-roots-")),
    );
  });
  afterEach(() => fs.rmSync(temporary, { recursive: true, force: true }));

  function roots(start: string): string[] {
    const python = execFileSync(
      "python3",
      [
        "-c",
        `import sys\nfrom pathlib import Path\nsys.path.insert(0, ${JSON.stringify(SCRIPTS)})\nfrom common.paths import get_repo_root\nprint(get_repo_root(Path(sys.argv[1])))`,
        start,
      ],
      { cwd: start, encoding: "utf8" },
    ).trim();
    return [resolveProjectRoot(start).root, python];
  }

  it.each([false, true])(
    "keeps the nearest initialized project (git: %s)",
    (git) => {
      if (git) execFileSync("git", ["init", "-q"], { cwd: temporary });
      const nested = path.join(temporary, "nested");
      const child = path.join(nested, "src");
      fs.mkdirSync(path.join(temporary, ".trellis"));
      fs.mkdirSync(path.join(nested, ".trellis"), { recursive: true });
      fs.mkdirSync(child);
      expect(roots(child)).toEqual([nested, nested]);
    },
  );

  it("does not cross an independent Git root to find parent memory", () => {
    fs.mkdirSync(path.join(temporary, ".trellis"));
    const nested = path.join(temporary, "nested");
    fs.mkdirSync(path.join(nested, "src"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: nested });
    expect(roots(path.join(nested, "src"))).toEqual([nested, nested]);
    const recording = spawnSync(
      "python3",
      [
        path.join(SCRIPTS, "add_session.py"),
        "--title",
        "must not inherit",
        "--no-commit",
      ],
      { cwd: path.join(nested, "src"), encoding: "utf8" },
    );
    expect(recording.status).toBe(1);
    expect(fs.existsSync(path.join(nested, ".trellis"))).toBe(false);
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !name.endsWith("_PROJECT_DIR") && !name.startsWith("TRELLIS_"),
      ),
    );
    for (const symlink of [false, true]) {
      if (symlink)
        fs.symlinkSync(
          path.join(temporary, ".trellis"),
          path.join(nested, ".trellis"),
          "dir",
        );
      const hook = spawnSync("python3", [HOOK], {
        cwd: path.join(nested, "src"),
        env: environment,
        input: JSON.stringify({
          cwd: path.join(nested, "src"),
          session_id: "independent-root",
          source: "startup",
        }),
        encoding: "utf8",
      });
      expect(hook.status, hook.stderr).toBe(0);
      expect(hook.stdout.trim()).toBe("");
      expect(fs.existsSync(path.join(temporary, ".trellis/.runtime"))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(nested, ".trellis/.runtime"))).toBe(false);
    }
  });

  it("uses an uninitialized Git root and otherwise keeps the requested directory", () => {
    const child = path.join(temporary, "src");
    fs.mkdirSync(child);
    expect(roots(child)).toEqual([child, child]);
    execFileSync("git", ["init", "-q"], { cwd: temporary });
    expect(roots(child)).toEqual([temporary, temporary]);
  });

  it("keeps a linked worktree's uncommitted memory local", () => {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: temporary });
    execFileSync(
      "git",
      [
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-qm",
        "baseline",
      ],
      { cwd: temporary },
    );
    const linked = path.join(temporary, "linked");
    execFileSync("git", ["worktree", "add", "-qb", "parallel", linked], {
      cwd: temporary,
    });
    fs.mkdirSync(path.join(temporary, ".trellis"));
    fs.mkdirSync(path.join(linked, ".trellis"));
    fs.mkdirSync(path.join(linked, "src"));
    expect(roots(path.join(linked, "src"))).toEqual([linked, linked]);
  });

  it("resolves hook subdirectory input before reading or writing diagnostics", () => {
    const nested = path.join(temporary, "nested");
    const child = path.join(nested, "src");
    const guides = path.join(nested, ".trellis/spec/guides");
    fs.mkdirSync(guides, { recursive: true });
    fs.cpSync(SCRIPTS, path.join(nested, ".trellis/scripts"), {
      recursive: true,
    });
    fs.mkdirSync(child);
    fs.writeFileSync(path.join(guides, "index.md"), "# NestedRootProof\n");
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !name.endsWith("_PROJECT_DIR") && !name.startsWith("TRELLIS_"),
      ),
    );
    const result = spawnSync("python3", [HOOK], {
      cwd: child,
      env: environment,
      input: JSON.stringify({
        cwd: child,
        session_id: "root-probe",
        source: "startup",
      }),
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Spec indexes: 1 available");
    expect(fs.existsSync(path.join(child, ".trellis"))).toBe(false);
    expect(fs.existsSync(path.join(nested, ".trellis/.runtime/hooks"))).toBe(
      true,
    );
  });
});
