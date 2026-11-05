import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { hashContent, hashFile, readManifest } from "./managed-manifest.js";
import {
  assertSafeManagedPath,
  ManagedAssetConflict,
} from "./managed-path-safety.js";
import { readOpenCodePackageIssue } from "./opencode-package.js";

export type OpenCodeVersion = "1" | "2";
export const DEFAULT_OPENCODE_VERSION: OpenCodeVersion = "2";
export const OPENCODE_ENTRIES: Record<OpenCodeVersion, string> = {
  "1": ".opencode/plugins/session-start.js",
  "2": ".opencode/plugins/mini-trellis/index.js",
};

export function parseOpenCodeVersion(
  value: unknown,
): OpenCodeVersion | undefined {
  if (value === undefined) return undefined;
  if (value === "1" || value === "2") return value;
  throw new Error("--opencode-version must be 1 or 2");
}

export function installedOpenCodeVersions(cwd: string): OpenCodeVersion[] {
  return (["1", "2"] as const).filter((version) =>
    fs.existsSync(path.join(cwd, OPENCODE_ENTRIES[version])),
  );
}

export function detectOpenCodeVersion(): OpenCodeVersion | undefined {
  try {
    const output = execFileSync("opencode", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    const major = /^(?:opencode\s+)?v?([12])\.\d+\.\d+(?:[-+\s]|$)/i.exec(
      output.trim(),
    )?.[1];
    return major === "1" || major === "2" ? major : undefined;
  } catch {
    return undefined;
  }
}

export function resolveOpenCodeVersion(
  cwd: string,
  explicit?: OpenCodeVersion,
): OpenCodeVersion {
  const installed = installedOpenCodeVersions(cwd);
  if (installed.length > 1)
    throw new Error(
      "Both OpenCode V1 and V2 entries are present; resolve the duplicate plugin before updating",
    );
  // V2 is the default for new projects. Preserve existing project assets;
  // a different binary on this machine must not silently switch protocols.
  return explicit ?? installed[0] ?? DEFAULT_OPENCODE_VERSION;
}

/** Only unmodified, manifest-owned entries may be retired on an explicit switch. */
export function openCodeSwitchFiles(
  cwd: string,
  target: OpenCodeVersion,
  templates: Map<string, string>,
): string[] {
  const packagePath = path.join(cwd, ".opencode/package.json");
  assertSafeManagedPath(fs.realpathSync(cwd), ".opencode/package.json", {
    followLeaf: true,
  });
  if (fs.existsSync(packagePath)) {
    const issue = readOpenCodePackageIssue(packagePath, target);
    if (issue) throw new ManagedAssetConflict(".opencode/package.json", issue);
  }
  const installed = installedOpenCodeVersions(cwd);
  if (installed.length > 1)
    throw new Error(
      "Both OpenCode V1 and V2 entries are present; resolve the duplicate plugin before updating",
    );
  if (!installed.length || installed[0] === target) return [];
  const previous = OPENCODE_ENTRIES[installed[0]];
  assertSafeManagedPath(fs.realpathSync(cwd), previous, { followLeaf: true });
  const manifest = readManifest(cwd);
  const actual = hashFile(path.join(cwd, previous));
  if (!actual || manifest.files[previous] !== actual)
    throw new ManagedAssetConflict(
      previous,
      "modified or unowned entry; protocol switch stopped",
    );
  for (const [relative, content] of templates) {
    // This structured file is merged, including the host's own SDK pin.
    if (relative === ".opencode/package.json") continue;
    const existing = hashFile(path.join(cwd, relative));
    if (
      fs.existsSync(path.join(cwd, relative)) &&
      existing !== hashContent(content) &&
      (!existing || manifest.files[relative] !== existing)
    ) {
      throw new ManagedAssetConflict(
        relative,
        "local changes kept; protocol switch stopped",
      );
    }
  }
  return [previous];
}

/** An empty V2 directory is still discovered as a plugin by its host. */
export function cleanupOpenCodeEntryDirectory(
  cwd: string,
  relative: string,
): void {
  if (relative !== OPENCODE_ENTRIES["2"]) return;
  const directory = path.dirname(path.join(cwd, relative));
  if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0)
    fs.rmdirSync(directory);
}
