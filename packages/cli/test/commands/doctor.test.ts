import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDoctorReport } from "../../src/commands/doctor.js";

const tempDirs: string[] = [];

function makeProject(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-doctor-"));
  tempDirs.push(cwd);
  fs.mkdirSync(path.join(cwd, ".trellis/scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".trellis/scripts/add_session.py"),
    "# hook\n",
  );
  fs.writeFileSync(
    path.join(cwd, "AGENTS.md"),
    "<!-- TRELLIS:START -->\nmanaged\n<!-- TRELLIS:END -->\n",
  );
  return cwd;
}

afterEach(() => {
  for (const cwd of tempDirs.splice(0))
    fs.rmSync(cwd, { recursive: true, force: true });
});

describe("doctor", () => {
  it("reports a healthy project and detected host", () => {
    const cwd = makeProject();
    fs.mkdirSync(path.join(cwd, ".claude/hooks"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".claude/hooks/session-start.py"),
      "# hook\n",
    );
    fs.writeFileSync(path.join(cwd, ".claude/settings.json"), "{}\n");
    const report = buildDoctorReport(cwd);
    expect(report.ok).toBe(true);
    expect(report.platforms).toEqual(["claude-code"]);
    expect(
      report.checks.some(
        (check) => check.name === "claude-code" && check.level === "ok",
      ),
    ).toBe(true);
  });

  it("reports a blocking issue when the memory layer is absent", () => {
    const cwd = fs.mkdtempSync(
      path.join(os.tmpdir(), "mini-trellis-doctor-empty-"),
    );
    tempDirs.push(cwd);
    const report = buildDoctorReport(cwd);
    expect(report.ok).toBe(false);
    expect(
      report.checks.find((check) => check.name === "memory-layer")?.level,
    ).toBe("error");
  });
});
