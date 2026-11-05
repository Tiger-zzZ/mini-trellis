import fs from "node:fs";
import path from "node:path";

export class ManagedAssetConflict extends Error {
  constructor(
    readonly relativePath: string,
    detail: string,
  ) {
    super(`${relativePath}: ${detail}`);
    this.name = "ManagedAssetConflict";
  }
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
  options: { followLeaf?: boolean } = {},
): string {
  validateManagedRelativePath(posixPath);
  const root = path.resolve(projectRoot);
  const segments = posixPath.split("/");
  let current = root;

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index] ?? "");
    assertWithinProject(root, current);
    const stat = lstatIfPresent(current);
    if (!stat) continue;
    if (
      stat.isSymbolicLink() &&
      (index < segments.length - 1 || options.followLeaf)
    ) {
      const realParent = fs.realpathSync(current);
      assertWithinProject(root, realParent);
    }
    if (index === segments.length - 1) {
      if (
        options.followLeaf &&
        !(stat.isSymbolicLink() ? fs.statSync(current) : stat).isFile()
      ) {
        throw new Error(
          `Managed file destination is not a regular file: ${posixPath}`,
        );
      }
      continue;
    }
    if (!stat.isDirectory() && !stat.isSymbolicLink()) {
      throw new Error(`Managed path parent is not a directory: ${posixPath}`);
    }
  }

  return current;
}
