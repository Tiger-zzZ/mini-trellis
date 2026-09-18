/**
 * Ownership-aware removal planning for `uninstall`.
 * Paths come from the current platform template maps, not a hash manifest.
 */

import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES, FILE_NAMES } from "../constants/paths.js";
import { ALL_MANAGED_DIRS } from "../configurators/index.js";
import {
  scrubCodexConfigToml,
  scrubHooksJson,
  scrubManagedMarkdownBlock,
  scrubOpencodePackageJson,
  scrubPiSettings,
  type ScrubResult,
} from "./uninstall-scrubbers.js";
import {
  cleanupEmptyDirs,
  TRELLIS_BLOCK_END,
  TRELLIS_BLOCK_START,
} from "./managed-paths.js";

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

export function lstatIfPresent(absPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(absPath);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function assertWithinProject(projectRoot: string, absPath: string): void {
  let root = path.resolve(projectRoot);
  let resolved = path.resolve(absPath);
  if (process.platform === "win32") {
    root = root.toLowerCase();
    resolved = resolved.toLowerCase();
  }
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Managed path escapes project root: ${absPath}`);
  }
}

export function validateManagedRelativePath(posixPath: string): void {
  if (
    posixPath.length === 0 ||
    posixPath.includes("\0") ||
    posixPath.includes("\\") ||
    path.posix.isAbsolute(posixPath) ||
    path.win32.isAbsolute(posixPath) ||
    /^[A-Za-z]:/.test(posixPath)
  ) {
    throw new Error(
      `Invalid managed manifest path: ${JSON.stringify(posixPath)}`,
    );
  }

  const segments = posixPath.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(
      `Invalid managed manifest path: ${JSON.stringify(posixPath)}`,
    );
  }
}

export function assertSafeManagedPath(
  projectRoot: string,
  posixPath: string,
): string {
  validateManagedRelativePath(posixPath);
  const root = path.resolve(projectRoot);
  const segments = posixPath.split("/");
  let current = root;

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index] ?? "");
    assertWithinProject(root, current);
    const stat = lstatIfPresent(current);
    if (!stat || index === segments.length - 1) continue;
    if (stat.isSymbolicLink()) {
      const realParent = fs.realpathSync(current);
      assertWithinProject(root, realParent);
    }
    if (!stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new Error(`Managed path parent is not a directory: ${posixPath}`);
    }
  }

  return current;
}

export function buildStructuredFileSpecs(): Map<string, StructuredFileSpec> {
  const specs: StructuredFileSpec[] = [
    ...([".claude/settings.json", ".codex/hooks.json"] as const).map(
      (posixPath): StructuredFileSpec => ({
        posixPath,
        reason: "Strip mini-trellis hooks; preserve user fields",
        scrub: (content, deletedPaths) =>
          scrubHooksJson(content, deletedPaths, "nested"),
      }),
    ),
    {
      posixPath: ".opencode/package.json",
      reason: "Remove @opencode-ai/plugin dep; preserve other deps",
      scrub: (content) => scrubOpencodePackageJson(content),
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
    if (
      options.strictPaths &&
      !result.fullyEmpty &&
      result.content === content
    ) {
      throw new Error(
        `Cannot prove Trellis content was removed from structured file: ${posixPath}`,
      );
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
