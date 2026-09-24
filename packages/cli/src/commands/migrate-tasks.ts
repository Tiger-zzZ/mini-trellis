/**
 * Task-directory convergence, the second half of `mini-trellis migrate`.
 *
 * Trellis kept every task under `.trellis/tasks/`, and with `task.py` gone
 * nothing reads that tree any more. This module folds it into the memory layer:
 * each task directory becomes one research topic under `.trellis/research/`,
 * keeping its date prefix and — the point of moving directories rather than
 * files — its own `research/` subtree and `design.md` in place, so the relative
 * links the notes carry keep resolving.
 *
 * The Trellis workflow files at the task root (`task.json`, `prd.md`,
 * `implement*`, `check.jsonl`, `drafts/`, and anything else unrecognised) leave
 * the topic: into `<topic>/legacy/`, or gone.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

import { DIR_NAMES, PATHS } from "../constants/paths.js";
import { ensureDir } from "../utils/file-writer.js";

/** The memory-layer inbox converged task directories land in. */
const RESEARCH_DIR = "research";

/** Where converged task directories land. */
export const RESEARCH_REL = `${DIR_NAMES.WORKFLOW}/${RESEARCH_DIR}`;

/** Task-root directories a converged topic keeps, by name. */
const KEPT_DIRS = new Set([RESEARCH_DIR]);

/** Task-root files a converged topic keeps, by name. */
const KEPT_FILES = new Set(["design.md"]);

/** Where task-root leftovers go when the user archives them. */
const LEGACY_DIR = "legacy";

/** Session runtime files whose `current_task` pointer dies with the tasks tree. */
const SESSIONS_REL = `${DIR_NAMES.WORKFLOW}/.runtime/sessions`;

/** How the task-root leftovers leave the topic. */
export type TasksDisposition = "archive" | "delete";

export interface TaskEviction {
  name: string;
  /** Directories render with a trailing slash. */
  dir: boolean;
  bytes: number;
}

export interface ConvergeTask {
  /** Directory name, kept verbatim so the date prefix survives. */
  name: string;
  /** `""` for an active task, `archive/YYYY-MM` for an archived one. */
  group: string;
  /** Topic directory this task becomes, relative to the project root. */
  dest: string;
  /** Task-root entries that leave the topic. */
  evictions: TaskEviction[];
}

export interface TasksConvergePlan {
  tasks: ConvergeTask[];
  /** Topic directories already taken by a user note. Converging would merge. */
  conflicts: string[];
  /** Bytes leaving the topic directories: what the archive/delete choice weighs. */
  evictionBytes: number;
  /** Repo-relative `.trellis/tasks/` mentions inside the notes that stay put. */
  mentions: { repoint: number; keep: number };
}

export interface ConvergeReport {
  moved: number;
  archived: number;
  deleted: number;
  bytes: number;
  mentions: { repoint: number; keep: number };
  /** Session runtime files whose `current_task` pointer was dropped. */
  pointers: number;
  /** Files still under `.trellis/tasks/`, which is then kept and reported. */
  residue: string[];
}

function readdirSafe(abs: string): fs.Dirent[] {
  try {
    return fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isDir(abs: string): boolean {
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function treeSize(abs: string): number {
  if (!isDir(abs)) {
    try {
      return fs.statSync(abs).size;
    } catch {
      return 0;
    }
  }
  let total = 0;
  for (const entry of readdirSafe(abs)) {
    total += treeSize(path.join(abs, entry.name));
  }
  return total;
}

/** Every file under `abs`, as paths relative to `abs`. */
function filesUnder(abs: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSafe(abs)) {
    const child = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(child).map((p) => `${entry.name}/${p}`));
    } else if (entry.isFile()) {
      found.push(entry.name);
    }
  }
  return found;
}

/** Markdown under `abs`, recursively. */
function markdownUnder(abs: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSafe(abs)) {
    const child = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      found.push(...markdownUnder(child));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      found.push(child);
    }
  }
  return found;
}

/** Notes a topic keeps in place: its `research/` subtree plus `design.md`. */
function keptNotes(topicAbs: string): string[] {
  const notes = markdownUnder(path.join(topicAbs, RESEARCH_DIR));
  const design = path.join(topicAbs, "design.md");
  if (fs.existsSync(design)) notes.push(design);
  return notes;
}

/**
 * Repo-relative `.trellis/tasks/` mentions. The lookbehind rejects the long tail
 * of cross-repo pointers (`/Users/anno/workspace/.trellis/tasks/…`,
 * `opc_memento_s-x/.trellis/tasks/…`), which must survive byte-identical.
 */
const TASK_MENTION =
  /(?<![A-Za-z0-9_\-/.])\.trellis\/tasks\/([^\s`)\]"'>|,;:]*)/g;

/**
 * Only mentions of content that stays inside the topic can be repointed. The
 * workflow files leave it, so a pointer at one is better left dangling (and
 * reported) than turned into a second wrong path.
 */
function staysInTopic(rest: string): boolean {
  return (
    rest === "" ||
    rest === "design.md" ||
    rest === RESEARCH_DIR ||
    rest.startsWith(`${RESEARCH_DIR}/`)
  );
}

/** Split a mention into the task name it names and whatever follows. */
function parseMention(ref: string): { name: string; rest: string } | null {
  const parts = ref.split("/");
  if (parts[0] === DIR_NAMES.ARCHIVE && parts.length > 2) {
    return { name: parts[2], rest: parts.slice(3).join("/") };
  }
  if (parts[0]) return { name: parts[0], rest: parts.slice(1).join("/") };
  return null;
}

function repointMentions(
  text: string,
  topics: Map<string, string>,
  counts: { repoint: number; keep: number },
): string {
  return text.replace(TASK_MENTION, (match, rawRef: string) => {
    const ref = rawRef.replace(/[.,;:]+$/, "");
    const trailing = rawRef.slice(ref.length);
    const parsed = ref ? parseMention(ref) : null;
    const dest = parsed ? topics.get(parsed.name) : undefined;
    if (!parsed || !dest || !staysInTopic(parsed.rest)) {
      counts.keep += 1;
      return match;
    }
    counts.repoint += 1;
    return `${dest}${parsed.rest ? `/${parsed.rest}` : ""}${trailing}`;
  });
}

/** `.trellis/research/<name>`, or `.trellis/research/archive/YYYY-MM/<name>`. */
function topicRel(group: string, name: string): string {
  return group ? `${RESEARCH_REL}/${group}/${name}` : `${RESEARCH_REL}/${name}`;
}

function describeTask(group: string, name: string, abs: string): ConvergeTask {
  const evictions: TaskEviction[] = [];
  for (const entry of readdirSafe(abs)) {
    const dir = entry.isDirectory();
    if (dir ? KEPT_DIRS.has(entry.name) : KEPT_FILES.has(entry.name)) continue;
    evictions.push({
      name: entry.name,
      dir,
      bytes: treeSize(path.join(abs, entry.name)),
    });
  }
  return { name, group, dest: topicRel(group, name), evictions };
}

export function buildTasksConvergePlan(cwd: string): TasksConvergePlan {
  const tasksRoot = path.join(cwd, PATHS.TASKS);
  const tasks: ConvergeTask[] = [];

  const collect = (group: string, dir: string): void => {
    for (const entry of readdirSafe(dir)) {
      if (entry.name.startsWith(".") || entry.name === DIR_NAMES.ARCHIVE)
        continue;
      if (!entry.isDirectory()) continue;
      tasks.push(describeTask(group, entry.name, path.join(dir, entry.name)));
    }
  };

  collect("", tasksRoot);
  const archiveRoot = path.join(tasksRoot, DIR_NAMES.ARCHIVE);
  for (const month of readdirSafe(archiveRoot)) {
    if (month.name.startsWith(".") || !month.isDirectory()) continue;
    collect(
      `${DIR_NAMES.ARCHIVE}/${month.name}`,
      path.join(archiveRoot, month.name),
    );
  }
  tasks.sort((a, b) =>
    topicRel(a.group, a.name).localeCompare(topicRel(b.group, b.name)),
  );

  const topics = new Map(tasks.map((t) => [t.name, t.dest]));
  const mentions = { repoint: 0, keep: 0 };
  const conflicts: string[] = [];
  let evictionBytes = 0;

  for (const task of tasks) {
    evictionBytes += task.evictions.reduce((sum, e) => sum + e.bytes, 0);
    if (fs.existsSync(path.join(cwd, task.dest))) conflicts.push(task.dest);
    for (const note of keptNotes(path.join(tasksRoot, task.group, task.name))) {
      repointMentions(fs.readFileSync(note, "utf-8"), topics, mentions);
    }
  }

  return { tasks, conflicts, evictionBytes, mentions };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** One line per distinct leftover name: most common first, then by weight. */
function summarizeEvictions(
  tasks: ConvergeTask[],
): { label: string; count: number; bytes: number }[] {
  const tally = new Map<string, { count: number; bytes: number }>();
  for (const task of tasks) {
    for (const e of task.evictions) {
      const label = e.dir ? `${e.name}/` : e.name;
      const seen = tally.get(label) ?? { count: 0, bytes: 0 };
      tally.set(label, { count: seen.count + 1, bytes: seen.bytes + e.bytes });
    }
  }
  return [...tally]
    .map(([label, seen]) => ({ label, ...seen }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.bytes - a.bytes ||
        a.label.localeCompare(b.label),
    );
}

export function renderTasksConvergePlan(plan: TasksConvergePlan): void {
  if (plan.tasks.length === 0) return;

  const active = plan.tasks.filter((t) => !t.group).length;
  const archived = plan.tasks.length - active;
  const leftovers = summarizeEvictions(plan.tasks);
  const leftoverCount = leftovers.reduce((sum, e) => sum + e.count, 0);
  const shown = leftovers.slice(0, 8);

  console.log();
  console.log(
    chalk.green.bold(
      `Will be converged into ${RESEARCH_REL}/ ` +
        `(${plan.tasks.length} task(s): ${active} active, ${archived} archived):`,
    ),
  );
  console.log(
    `  ${chalk.green("→")} ${PATHS.TASKS}/<name>/  ` +
      chalk.gray(`becomes ${RESEARCH_REL}/<name>/`),
  );
  console.log(
    `  ${chalk.green("→")} ${PATHS.TASKS}/${DIR_NAMES.ARCHIVE}/YYYY-MM/<name>/  ` +
      chalk.gray(
        `becomes ${RESEARCH_REL}/${DIR_NAMES.ARCHIVE}/YYYY-MM/<name>/`,
      ),
  );
  console.log(
    `  ${chalk.green("=")} research/ and design.md  ` +
      chalk.gray(
        "(every topic keeps them; relative links between notes survive)",
      ),
  );
  console.log(
    `  ${chalk.yellow("-")} ${leftoverCount} item(s), ${formatBytes(plan.evictionBytes)} ` +
      chalk.gray("leave the topics:"),
  );
  console.log(
    `      ${shown.map((e) => `${e.label} ×${e.count}`).join(", ")}` +
      (leftovers.length > shown.length
        ? chalk.gray(`, +${leftovers.length - shown.length} more`)
        : ""),
  );

  console.log(
    chalk.gray(
      `  Repointing ${plan.mentions.repoint} \`.trellis/tasks/\` mention(s) in the notes ` +
        `that stay; ${plan.mentions.keep} left alone (they point at files that leave ` +
        "the topic, or at another repository).",
    ),
  );
}

export function convergeTasks(
  cwd: string,
  plan: TasksConvergePlan,
  disposition: TasksDisposition,
): ConvergeReport {
  ensureDir(path.join(cwd, RESEARCH_REL));

  let archived = 0;
  let deleted = 0;
  let bytes = 0;

  for (const task of plan.tasks) {
    const from = path.join(cwd, PATHS.TASKS, task.group, task.name);
    const to = path.join(cwd, RESEARCH_REL, task.group, task.name);
    ensureDir(path.dirname(to));
    fs.renameSync(from, to);

    if (task.evictions.length === 0) continue;
    bytes += task.evictions.reduce((sum, e) => sum + e.bytes, 0);
    if (disposition === "delete") {
      for (const e of task.evictions) {
        fs.rmSync(path.join(to, e.name), { recursive: true, force: true });
        deleted += 1;
      }
      continue;
    }
    const legacy = path.join(to, LEGACY_DIR);
    ensureDir(legacy);
    for (const e of task.evictions) {
      fs.renameSync(path.join(to, e.name), path.join(legacy, e.name));
      archived += 1;
    }
  }

  const topics = new Map(plan.tasks.map((t) => [t.name, t.dest]));
  const mentions = { repoint: 0, keep: 0 };
  for (const task of plan.tasks) {
    for (const note of keptNotes(
      path.join(cwd, RESEARCH_REL, task.group, task.name),
    )) {
      const before = fs.readFileSync(note, "utf-8");
      const after = repointMentions(before, topics, mentions);
      if (after !== before) fs.writeFileSync(note, after);
    }
  }

  const pointers = clearSessionTaskPointers(cwd);

  const tasksRoot = path.join(cwd, PATHS.TASKS);
  const residue = filesUnder(tasksRoot);
  if (residue.length === 0) {
    fs.rmSync(tasksRoot, { recursive: true, force: true });
  }

  return {
    moved: plan.tasks.length,
    archived,
    deleted,
    bytes,
    mentions,
    pointers,
    residue,
  };
}

/** The tasks tree is gone, so the active-task pointer can only go stale. */
function clearSessionTaskPointers(cwd: string): number {
  const sessions = path.join(cwd, SESSIONS_REL);
  let cleared = 0;
  for (const entry of readdirSafe(sessions)) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(sessions, entry.name);
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      continue; // Not a session file we can read; not ours to repair.
    }
    if (!data.current_task) continue;
    data.current_task = null;
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    cleared += 1;
  }
  return cleared;
}
