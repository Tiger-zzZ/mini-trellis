import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRefreshPlan, runRefresh } from "../../src/commands/refresh.js";
import { collectTrellisScriptTemplates } from "../../src/templates/extract.js";
import {
  hashContent,
  writeManifest,
} from "../../src/utils/managed-manifest.js";

const tempDirs: string[] = [];

function project(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "mini-trellis-refresh-"));
  tempDirs.push(cwd);
  return cwd;
}

afterEach(() => {
  for (const cwd of tempDirs.splice(0))
    fs.rmSync(cwd, { recursive: true, force: true });
});

describe("refresh", () => {
  it("updates a previously managed asset and leaves an unclaimed edit alone", () => {
    const cwd = project();
    const templates = collectTrellisScriptTemplates();
    const [relative, current] = [...templates.entries()][0];
    const filePath = path.join(cwd, ...relative.split("/"));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "old template\n");
    writeManifest(cwd, {
      version: 1,
      files: { [relative]: hashContent("old template\n") },
    });

    const report = buildRefreshPlan(cwd, []);
    expect(report.items.find((item) => item.path === relative)?.action).toBe(
      "update",
    );

    fs.writeFileSync(filePath, "user edit\n");
    const conflict = buildRefreshPlan(cwd, []);
    expect(conflict.items.find((item) => item.path === relative)?.action).toBe(
      "conflict",
    );
    expect(current.length).toBeGreaterThan(0);
  });

  it("does not write during dry-run", () => {
    const cwd = project();
    const report = runRefresh({ cwd, dryRun: true, json: true });
    expect(report.items.some((item) => item.action === "add")).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".trellis/scripts"))).toBe(false);
  });
});
