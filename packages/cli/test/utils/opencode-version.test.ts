import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectOpenCodeVersion,
  OPENCODE_ENTRIES,
  resolveOpenCodeVersion,
} from "../../src/utils/opencode-version.js";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
const dirs: string[] = [];
afterEach(() => {
  vi.resetAllMocks();
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("OpenCode version resolution", () => {
  it.each([
    ["1.18.29\n", "1"],
    ["opencode v2.2.0\n", "2"],
    ["2.2.0-beta.1", "2"],
    ["3.0.0", undefined],
    ["unexpected 2.2.0", undefined],
  ])("detects %s without guessing", (output, expected) => {
    vi.mocked(execFileSync).mockReturnValue(output);
    expect(detectOpenCodeVersion()).toBe(expected);
  });
  it("defaults new projects to V2 and preserves installed or explicit protocols", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-version-"));
    dirs.push(cwd);
    vi.mocked(execFileSync).mockReturnValue("2.2.0");
    expect(resolveOpenCodeVersion(cwd)).toBe("2");
    const entry = path.join(cwd, OPENCODE_ENTRIES["1"]);
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, "// installed V1");
    expect(resolveOpenCodeVersion(cwd)).toBe("1");
    expect(resolveOpenCodeVersion(cwd, "2")).toBe("2");
    fs.rmSync(entry);
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("binary missing");
    });
    expect(resolveOpenCodeVersion(cwd)).toBe("2");
    vi.mocked(execFileSync).mockReturnValue("1.18.29");
    expect(resolveOpenCodeVersion(cwd)).toBe("2");
    expect(resolveOpenCodeVersion(cwd, "1")).toBe("1");
  });
});
