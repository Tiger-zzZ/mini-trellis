/**
 * Project document discovery for unified recall.
 *
 * Scope (plan §4B), applied without any user configuration:
 *   - `.trellis/spec|research|workspace` Markdown, read even when gitignored
 *   - root `README*.md`, `AGENTS.md`, `CLAUDE.md`
 *   - `docs/` and `doc/` Markdown and MDX, read as text
 *   - one bounded level of in-repo relative Markdown links
 *
 * Ordinary documents honor `.gitignore`; `.trellis` is always read but its
 * `.runtime` directory, scripts, and secret-looking files are not. A non-git
 * project uses the working directory plus a fixed set of excluded directories.
 * Running from a repository subdirectory resolves the same root.
 *
 * Every bound is a hard cap. Hitting one is reported as an incomplete search —
 * it is never silently presented as "no documents".
 */

import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { MemWarning } from "./types.js";

/** Internal caps. Large enough for the measured corpus; raised only with data. */
const MAX_FILES = 1000;
const MAX_LINK_EXPANSIONS = 200;
export const MAX_FILE_BYTES = 1_000_000;
const MAX_SCAN_DEPTH = 8;
const MAX_ENTRIES = 10_000;
const MAX_SCAN_MS = 5000;

const MARKDOWN_EXT = new Set([".md", ".mdx"]);

/** Directories never descended into, git or not. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
  ".git",
  ".runtime",
  "__pycache__",
  ".venv",
  "venv",
]);

/** File names that look like secrets. Never read, even inside `.trellis`. */
const SECRET_NAMES = /(?:^|.*\.)(?:env|pem|key|crt|p12|pfx|keystore)$/i;

export interface DiscoveredDoc {
  /** Absolute path. */
  filePath: string;
  /** Path relative to the project root, posix separators. */
  relPath: string;
  /** Where the discovery came from. */
  origin: "trellis" | "root" | "docs" | "link";
  /** True when the file lives under a `research/archive` directory. */
  archived: boolean;
  /** Byte size, capped at what was actually read. */
  bytes: number;
}

export interface DocDiscovery {
  root: string;
  /** True when `root` is inside a git work tree. */
  git: boolean;
  docs: DiscoveredDoc[];
  warnings: MemWarning[];
}

/**
 * Resolve the project root for `start`.
 *
 * A subdirectory of a repository resolves to that repository's root, so
 * `repo/pkg` and `repo` share one memory. But `start` is never widened past
 * itself when it is not inside the work tree it would resolve to — a project
 * nested in an unrelated checkout, or passed explicitly, stays itself.
 */
export function resolveProjectRoot(start: string): {
  root: string;
  git: boolean;
} {
  const abs = path.resolve(start);
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: abs,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    if (out) {
      const real = fs.realpathSync(out);
      const realStart = fs.realpathSync(abs);
      const inside =
        realStart === real || realStart.startsWith(real + path.sep);
      if (inside) return { root: real, git: true };
    }
  } catch {
    // Not a git checkout, or git is unavailable. Both are normal.
  }
  // Normalize through realpath so a root under a symlinked prefix (macOS
  // `/tmp` → `/private/tmp`) compares equal to the realpaths `consider` takes;
  // otherwise every document under it looks like it escaped the project.
  try {
    return { root: fs.realpathSync(abs), git: false };
  } catch {
    return { root: abs, git: false };
  }
}

interface IgnoreChecker {
  (rel: string): boolean;
  prime(rels: string[]): void;
}

/** Batch directory entries through Git; failures skip ordinary sources. */
function gitIgnoreChecker(
  root: string,
  git: boolean,
  warnings: MemWarning[],
): IgnoreChecker {
  const cache = new Map<string, boolean>();
  const prime = (rels: string[]): void => {
    if (!git) return;
    const pending = [...new Set(rels)].filter(rel => !cache.has(rel));
    if (!pending.length) return;
    try {
      const res = spawnSync("git", ["check-ignore", "--stdin", "-z"], {
        cwd: root,
        input: pending.join("\0") + "\0",
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 2000,
      });
      if (res.error || (res.status !== 0 && res.status !== 1)) {
        throw new Error("Git ignore check failed");
      }
      const ignored = new Set(res.stdout.split("\0"));
      for (const rel of pending) cache.set(rel, ignored.has(rel));
    } catch {
      if (!warnings.some(w => w.code === "doc-ignore-unavailable")) {
        warnings.push({
          code: "doc-ignore-unavailable",
          message: "Git ignore check failed; ordinary source skipped",
        });
      }
      for (const rel of pending) cache.set(rel, true);
    }
  };
  return Object.assign((rel: string): boolean => {
    prime([rel]);
    return cache.get(rel) ?? false;
  }, { prime });
}

function isSecret(name: string): boolean {
  return SECRET_NAMES.test(name) || name.endsWith(".secret");
}

function relPosix(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

/** One policy for walking, linked documents and later ref expansion. */
export function allowedDocPath(root: string, abs: string): string | undefined {
  let real: string;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return undefined;
  }
  const rel = relPosix(root, real);
  if (rel === ".." || rel.startsWith("../") || path.isAbsolute(rel))
    return undefined;
  const parts = rel.split("/");
  const knowledge =
    parts[0] === ".trellis" &&
    ["spec", "research", "workspace"].includes(parts[1] ?? "");
  if (
    parts.some(
      (part, i) =>
        EXCLUDED_DIRS.has(part) ||
        (part.startsWith(".") && !(knowledge && i === 0)),
    )
  )
    return undefined;
  if (
    !MARKDOWN_EXT.has(path.extname(real).toLowerCase()) ||
    isSecret(path.basename(real))
  )
    return undefined;
  return real;
}

/** Bound the actual read as well as discovery's stat; fail visibly on races. */
export function readDocText(
  root: string,
  file: string,
  warnings: MemWarning[],
): string | undefined {
  const real = allowedDocPath(root, file);
  if (!real || real !== file) {
    warnings.push({
      code: "doc-unreadable",
      message: "document moved outside its allowed source; search again",
    });
    return undefined;
  }
  let fd: number | undefined;
  try {
    fd = fs.openSync(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      warnings.push({
        code: "doc-too-large",
        message: `${relPosix(root, real)} is not a bounded regular document`,
      });
      return undefined;
    }
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const n = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (!n) break;
      used += n;
    }
    if (used > MAX_FILE_BYTES) {
      warnings.push({
        code: "doc-too-large",
        message: `${relPosix(root, real)} grew beyond the document limit`,
      });
      return undefined;
    }
    return bytes.subarray(0, used).toString("utf8");
  } catch {
    warnings.push({
      code: "doc-unreadable",
      message: `${relPosix(root, real)} could not be read`,
    });
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

interface ScanState {
  root: string;
  ignored: IgnoreChecker;
  docs: DiscoveredDoc[];
  seen: Set<string>;
  warnings: MemWarning[];
  truncated: boolean;
  entries: number;
  deadline: number;
  directories: Set<string>;
}

function consider(
  state: ScanState,
  abs: string,
  origin: DiscoveredDoc["origin"],
): void {
  if (Date.now() > state.deadline || state.docs.length >= MAX_FILES) {
    state.truncated = true;
    return;
  }
  const real = allowedDocPath(state.root, abs);
  if (!real) return;
  const relative = relPosix(state.root, real);
  const knowledge = /^\.trellis\/(spec|research|workspace)\//.test(relative);
  if (!knowledge && state.ignored(relative)) return;
  if (state.seen.has(real)) return;

  const name = path.basename(real);
  if (!MARKDOWN_EXT.has(path.extname(name).toLowerCase())) return;
  if (isSecret(name)) return;

  let bytes = 0;
  try {
    const stat = fs.statSync(real);
    if (!stat.isFile()) return;
    bytes = stat.size;
  } catch {
    return;
  }
  if (bytes > MAX_FILE_BYTES) {
    state.warnings.push({
      code: "doc-too-large",
      message: `${relPosix(state.root, real)} exceeds ${MAX_FILE_BYTES} bytes and was skipped`,
    });
    return;
  }

  state.seen.add(real);
  const rel = relPosix(state.root, real);
  state.docs.push({
    filePath: real,
    relPath: rel,
    origin,
    archived: rel.startsWith(".trellis/research/archive/"),
    bytes,
  });
}

/** Walk a directory, honoring exclusions. `trellis` bypasses gitignore. */
function walk(
  state: ScanState,
  dir: string,
  origin: DiscoveredDoc["origin"],
  depth: number,
  bypassIgnore: boolean,
): void {
  if (depth > MAX_SCAN_DEPTH || state.truncated) {
    if (depth > MAX_SCAN_DEPTH) state.truncated = true;
    return;
  }
  let entries: fs.Dirent[];
  try {
    const real = fs.realpathSync(dir);
    const relative = relPosix(state.root, real);
    if (
      relative === ".." ||
      relative.startsWith("../") ||
      path.isAbsolute(relative)
    )
      return;
    if (state.directories.has(real)) return;
    state.directories.add(real);
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    state.warnings.push({
      code: "doc-unreadable",
      message: `${relPosix(state.root, dir)} could not be scanned`,
    });
    return;
  }
  if (!bypassIgnore) {
    state.ignored.prime(entries.slice(0, Math.max(0, MAX_ENTRIES - state.entries)).filter(entry =>
      entry.isDirectory() || entry.isSymbolicLink() || MARKDOWN_EXT.has(path.extname(entry.name).toLowerCase()),
    ).map(entry => relPosix(state.root, path.join(dir, entry.name))));
  }
  for (const entry of entries) {
    if (state.truncated) return;
    if (++state.entries > MAX_ENTRIES || Date.now() > state.deadline) {
      state.truncated = true;
      return;
    }
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // Only follow a symlink when its target stays inside the project.
      let real: string;
      try {
        real = fs.realpathSync(abs);
      } catch {
        continue;
      }
      const rel = path.relative(state.root, real);
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    }
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".trellis") continue;
        const rel = relPosix(state.root, abs);
        if (!bypassIgnore && state.ignored(rel)) continue;
        walk(state, abs, origin, depth + 1, bypassIgnore);
        continue;
      }
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    if (!MARKDOWN_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const rel = relPosix(state.root, abs);
    if (!bypassIgnore && state.ignored(rel)) continue;
    consider(state, abs, origin);
  }
}

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** One bounded level of in-repo relative Markdown links. */
function expandLinks(state: ScanState): void {
  let expansions = 0;
  const seeds = [...state.docs];
  for (const doc of seeds) {
    if (
      expansions >= MAX_LINK_EXPANSIONS ||
      Date.now() > state.deadline ||
      state.truncated
    ) {
      state.truncated = true;
      break;
    }
    const text = readDocText(state.root, doc.filePath, state.warnings);
    if (text === undefined) continue;
    for (const match of text.matchAll(LINK_RE)) {
      if (expansions >= MAX_LINK_EXPANSIONS || Date.now() > state.deadline) {
        state.truncated = true;
        break;
      }
      const raw = match[1];
      if (!raw || raw.includes("://") || raw.startsWith("#")) continue;
      const target = raw.split("#")[0];
      if (!target) continue;
      expansions += 1;
      const resolved = path.resolve(path.dirname(doc.filePath), target);
      const rel = path.relative(state.root, resolved);
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
      if (!fs.existsSync(resolved)) continue;
      consider(state, resolved, "link");
    }
  }
}

/** Discover the documents recall can search, starting from `start`. */
export function discoverDocs(start: string): DocDiscovery {
  const { root, git } = resolveProjectRoot(start);
  const warnings: MemWarning[] = [];
  const state: ScanState = {
    root,
    ignored: gitIgnoreChecker(root, git, warnings),
    docs: [],
    seen: new Set(),
    warnings,
    truncated: false,
    entries: 0,
    deadline: Date.now() + MAX_SCAN_MS,
    directories: new Set(),
  };

  const trellis = path.join(root, ".trellis");
  for (const sub of ["spec", "research", "workspace"]) {
    const dir = path.join(trellis, sub);
    if (fs.existsSync(dir)) walk(state, dir, "trellis", 1, true);
  }

  for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (++state.entries > MAX_ENTRIES || Date.now() > state.deadline) {
      state.truncated = true;
      break;
    }
    if (/^README.*\.md$/i.test(name)) {
      consider(state, path.join(root, name), "root");
    }
  }
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const abs = path.join(root, name);
    if (fs.existsSync(abs)) consider(state, abs, "root");
  }

  for (const sub of ["docs", "doc"]) {
    const dir = path.join(root, sub);
    if (fs.existsSync(dir)) walk(state, dir, "docs", 1, false);
  }

  expandLinks(state);

  if (state.truncated) {
    state.warnings.push({
      code: "doc-search-incomplete",
      message: `document discovery stopped at its limit under ${root}; results are partial`,
    });
  }

  return { root, git, docs: state.docs, warnings: state.warnings };
}
