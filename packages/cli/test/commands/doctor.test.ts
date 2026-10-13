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
  it.each(["{", "null", '{"schema":99,"last_status":"ok"}'])(
    "does not report malformed hook metadata as a successful delivery (%s)",
    (metadata) => {
      const cwd = makeProject();
      fs.mkdirSync(path.join(cwd, ".codex/hooks"), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, ".codex/hooks/session-start.py"),
        "additional_context",
      );
      fs.writeFileSync(path.join(cwd, ".codex/hooks.json"), "{}");
      fs.mkdirSync(path.join(cwd, ".trellis/.runtime/hooks"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(cwd, ".trellis/.runtime/hooks/codex.json"),
        metadata,
      );
      expect(
        buildDoctorReport(cwd).checks.find((c) => c.name === "codex-runtime")
          ?.level,
      ).toBe("unknown");
    },
  );

  it("keeps recording unknown until observed, and rejects invalid metadata", () => {
    const cwd = makeProject();
    expect(
      buildDoctorReport(cwd).checks.find((c) => c.name === "recording-runtime")
        ?.level,
    ).toBe("unknown");
    const file = path.join(cwd, ".trellis/.runtime/writes/latest.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const metadata of [
      "{",
      "null",
      '{"schema":99}',
      JSON.stringify({
        schema: 1,
        last_write_at: "2026-10-11T00:00:00Z",
        last_status: "ok",
        last_exit_code: 1,
      }),
    ]) {
      fs.writeFileSync(file, metadata);
      expect(
        buildDoctorReport(cwd).checks.find(
          (c) => c.name === "recording-runtime",
        )?.level,
      ).toBe("warn");
    }
  });

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

  it("keeps runtime unknown until a real hook writes metadata", () => {
    const cwd = makeProject();
    fs.mkdirSync(path.join(cwd, ".claude/hooks"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".claude/hooks/session-start.py"),
      "additional_context\n",
    );
    fs.writeFileSync(path.join(cwd, ".claude/settings.json"), "{}\n");
    expect(
      buildDoctorReport(cwd).checks.find(
        (check) => check.name === "claude-code-runtime",
      )?.level,
    ).toBe("unknown");
    fs.mkdirSync(path.join(cwd, ".trellis/.runtime/hooks"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(cwd, ".trellis/.runtime/hooks/claude-code.json"),
      JSON.stringify({
        schema: 1,
        last_status: "ok",
        last_hook_at: "2026-10-10T00:00:00Z",
        last_output_chars: 512,
      }),
    );
    const runtime = buildDoctorReport(cwd).checks.find(
      (check) => check.name === "claude-code-runtime",
    );
    expect(runtime?.level).toBe("ok");
    expect(runtime?.detail).toContain("512 chars");
  });
});
