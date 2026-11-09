/**
 * Ownership-aware removal planning for `uninstall`.
 * Paths come from the current platform template maps, not a hash manifest.
 */

import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES, FILE_NAMES } from "../constants/paths.js";
import { scrubZCodeConfig } from "./zcode-config.js";
import { ALL_MANAGED_DIRS } from "../configurators/index.js";
import {
  scrubCodexConfigToml,
  scrubHooksJson,
  scrubManagedMarkdownBlock,
  scrubPiSettings,
  type ScrubResult,
} from "./uninstall-scrubbers.js";
import {
  cleanupEmptyDirs,
  TRELLIS_BLOCK_END,
  TRELLIS_BLOCK_START,
} from "./managed-paths.js";

import {
  assertSafeManagedPath,
  lstatIfPresent,
} from "./managed-path-safety.js";
export {
  assertSafeManagedPath,
  lstatIfPresent,
  validateManagedRelativePath,
} from "./managed-path-safety.js";

export interface StructuredFileSpec {
  posixPath: string;
  reason: string;
  scrub: (content: string, deletedPaths: readonly string[]) => ScrubResult;
}

export interface PlannedDeletion {
  posixPath: string;
  absPath: string;
  missing: boolean;
}

export interface PlannedModification {
  posixPath: string;
  absPath: string;
  reason: string;
  result: ScrubResult;
}

export interface ManagedRemovalPlan {
  deletions: PlannedDeletion[];
  modifications: PlannedModification[];
  removeTrellisDir: boolean;
  allPosixPaths: string[];
}

export interface BuildManagedRemovalPlanOptions {
  strictPaths?: boolean;
}

export function buildStructuredFileSpecs(): Map<string, StructuredFileSpec> {
  const specs: StructuredFileSpec[] = [
    {
      posixPath: ".zcode/config.json",
      reason:
        "Strip mini-trellis hooks; preserve ZCode user settings and hooks",
      scrub: scrubZCodeConfig,
    },
    ...(
      [
        ".claude/settings.json",
        ".codex/hooks.json",
        ".codebuddy/settings.json",
      ] as const
    ).map(
      (posixPath): StructuredFileSpec => ({
        posixPath,
        reason: "Strip mini-trellis hooks; preserve user fields",
        scrub: (content, deletedPaths) =>
          scrubHooksJson(content, deletedPaths, "nested"),
      }),
    ),
    {
      posixPath: ".cursor/hooks.json",
      reason: "Strip mini-trellis sessionStart; preserve user hooks",
      scrub: (content, deletedPaths) =>
        scrubHooksJson(content, deletedPaths, "flat"),
    },
    {
      posixPath: ".opencode/package.json",
      reason:
        "Preserve shared OpenCode package configuration and host SDK dependencies",
      // The host pins this SDK and user plugins can import it. It is not
      // exclusively owned by mini-trellis, even if init first added it.
      scrub: (content) => ({ content, fullyEmpty: false }),
    },
    {
      posixPath: ".pi/settings.json",
      reason:
        "Strip mini-trellis extension/prompts entries; preserve user fields",
      scrub: (content) => scrubPiSettings(content),
    },
    {
      posixPath: ".codex/config.toml",
      reason: "Remove mini-trellis project_doc_fallback_filenames and notes",
      scrub: (content) => scrubCodexConfigToml(content),
    },
    {
      posixPath: FILE_NAMES.AGENTS,
      reason: "Strip mini-trellis managed block; preserve user instructions",
      scrub: (content) =>
        scrubManagedMarkdownBlock(
          content,
          TRELLIS_BLOCK_START,
          TRELLIS_BLOCK_END,
        ),
    },
  ];

  return new Map(specs.map((spec) => [spec.posixPath, spec]));
}

export function buildManagedRemovalPlan(
  cwd: string,
  hashes: Record<string, string>,
  options: BuildManagedRemovalPlanOptions = {},
): ManagedRemovalPlan {
  const structured = buildStructuredFileSpecs();
  const allPosixPaths = Object.keys(hashes);
  const deletions: PlannedDeletion[] = [];
  const modifications: PlannedModification[] = [];

  for (const posixPath of allPosixPaths) {
    const absPath = options.strictPaths
      ? assertSafeManagedPath(cwd, posixPath)
      : path.join(cwd, ...posixPath.split("/"));
    const stat = options.strictPaths ? lstatIfPresent(absPath) : null;
    const spec = structured.get(posixPath);

    if (!spec) {
      deletions.push({
        posixPath,
        absPath,
        missing: options.strictPaths ? stat === null : !fs.existsSync(absPath),
      });
      continue;
    }

    if (options.strictPaths) {
      if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
        deletions.push({ posixPath, absPath, missing: stat === null });
        continue;
      }
    } else if (!fs.existsSync(absPath)) {
      deletions.push({ posixPath, absPath, missing: true });
      continue;
    }

    const content = fs.readFileSync(absPath, "utf-8");
    const result = spec.scrub(content, allPosixPaths);
    if (!result.fullyEmpty && result.content === content) {
      if (options.strictPaths)
        throw new Error(
          `Cannot prove Trellis content was removed from structured file: ${posixPath}`,
        );
      continue;
    }
    if (result.fullyEmpty) {
      deletions.push({ posixPath, absPath, missing: false });
    } else {
      modifications.push({
        posixPath,
        absPath,
        reason: spec.reason,
        result,
      });
    }
  }

  return {
    deletions,
    modifications,
    removeTrellisDir: true,
    allPosixPaths,
  };
}

export function executeManagedRemovalPlan(
  cwd: string,
  plan: ManagedRemovalPlan,
): { deletedFiles: number; modifiedFiles: number; deletedDirs: number } {
  let deletedFiles = 0;
  let modifiedFiles = 0;

  for (const modification of plan.modifications) {
    fs.writeFileSync(modification.absPath, modification.result.content);
    modifiedFiles += 1;
  }

  const deletedDirCandidates = new Set<string>();
  for (const deletion of plan.deletions) {
    if (deletion.missing) continue;
    try {
      fs.unlinkSync(deletion.absPath);
      deletedFiles += 1;
      deletedDirCandidates.add(path.posix.dirname(deletion.posixPath));
    } catch {
      // best-effort unlink
    }
  }

  let deletedDirs = 0;
  if (plan.removeTrellisDir) {
    const trellisDir = path.join(cwd, DIR_NAMES.WORKFLOW);
    if (lstatIfPresent(trellisDir)) {
      fs.rmSync(trellisDir, { recursive: true, force: true });
      deletedDirs += 1;
    }
  }

  for (const dirPosix of deletedDirCandidates) {
    if (dirPosix === "." || dirPosix === "") continue;
    cleanupEmptyDirs(cwd, dirPosix);
  }

  const sortedManagedDirs = [...ALL_MANAGED_DIRS]
    .filter((dir) => dir !== DIR_NAMES.WORKFLOW)
    .sort((left, right) => right.split("/").length - left.split("/").length);
  for (const managedDir of sortedManagedDirs) {
    const abs = path.join(cwd, ...managedDir.split("/"));
    if (!fs.existsSync(abs)) continue;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isDirectory()) continue;
      if (fs.readdirSync(abs).length !== 0) continue;
      fs.rmdirSync(abs);
      deletedDirs += 1;

      let parentPosix = path.posix.dirname(managedDir);
      while (parentPosix !== "." && parentPosix.length > 0) {
        const parentAbs = path.join(cwd, ...parentPosix.split("/"));
        if (!fs.existsSync(parentAbs)) break;
        if (fs.readdirSync(parentAbs).length !== 0) break;
        fs.rmdirSync(parentAbs);
        deletedDirs += 1;
        parentPosix = path.posix.dirname(parentPosix);
      }
    } catch {
      // best-effort directory cleanup
    }
  }

  return { deletedFiles, modifiedFiles, deletedDirs };
}
