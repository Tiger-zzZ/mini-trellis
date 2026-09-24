/**
 * Switch a project that was set up by Trellis over to mini-trellis.
 *
 * Trellis and mini-trellis share the `.trellis/` data directory, so installing
 * mini-trellis on top of a Trellis project leaves both instruction surfaces
 * discoverable: Trellis's skills, commands, and agents sit next to
 * mini-trellis's, and OpenCode keeps loading `.opencode/plugins/inject-*.js`
 * from the directory scan. This command overwrites the host surfaces with
 * mini-trellis's versions, deletes the Trellis-only instruction files,
 * replaces the Trellis block in AGENTS.md, and drops `.trellis/.version` so
 * the Trellis CLI stops offering to "update" the project back to the
 * four-phase workflow. It then converges `.trellis/tasks/` into the memory
 * layer — see migrate-tasks.ts — because with `task.py` gone nothing reads
 * that tree any more.
 *
 * Memory data is never touched: `.trellis/spec/`, `research/`, and
 * `workspace/` survive as-is. `.trellis/scripts/` IS overwritten, because the
 * SessionStart hook and `add_session.py` are read from there.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";
import { copyTrellisDir } from "../templates/extract.js";
import { configYamlTemplate } from "../templates/trellis/index.js";
import {
  agentsMdContent,
  guidesIndexContent,
  miniMemoryGuideContent,
  researchReadmeContent,
} from "../templates/markdown/index.js";
import { ensureDir, setWriteMode, writeFile } from "../utils/file-writer.js";
import {
  isCwdHomedir,
  homedirGuardMessage,
  homedirBypassEnabled,
} from "../utils/cwd-guard.js";
import { configurePlatform } from "../configurators/index.js";
import { scrubManagedMarkdownBlock } from "../utils/uninstall-scrubbers.js";
import {
  TRELLIS_BLOCK_END,
  TRELLIS_BLOCK_START,
} from "../utils/managed-paths.js";
import { AI_TOOLS, type AITool } from "../types/ai-tools.js";
import {
  RESEARCH_REL,
  buildTasksConvergePlan,
  convergeTasks,
  renderTasksConvergePlan,
  type TasksConvergePlan,
  type TasksDisposition,
} from "./migrate-tasks.js";

export interface MigrateOptions {
  yes?: boolean;
  dryRun?: boolean;
}

export interface MigratePlan {
  /** Trellis-only paths to delete, relative to the project root. */
  deletions: string[];
  /** Host surfaces mini-trellis will rewrite in place. */
  reconfigure: AITool[];
  /** Framework files mini-trellis rewrites (scripts + config.yaml). */
  rewrites: string[];
  /** `.trellis/.version` exists and will be removed. */
  dropsVersion: boolean;
  /** AGENTS.md carries a Trellis-managed block that will be replaced. */
  rewritesAgents: boolean;
}

/**
 * Trellis entry names that mini-trellis does not ship. Each rule is scoped to
 * one directory so a stray user file elsewhere can never match. Note that
 * `.opencode/lib/trellis-context.js` is deliberately NOT listed: mini-trellis
 * ships and imports that module, despite the Trellis name.
 */
const SCAN_RULES: { dir: string; match: (name: string) => boolean }[] = [
  { dir: ".claude/agents", match: (n) => /^trellis-.*\.md$/.test(n) },
  { dir: ".claude/commands", match: (n) => n === "trellis" },
  { dir: ".claude/skills", match: (n) => n.startsWith("trellis-") },
  { dir: ".claude/hooks", match: (n) => /^inject-.*\.py$/.test(n) },
  { dir: ".codex/agents", match: (n) => /^trellis-.*\.toml$/.test(n) },
  { dir: ".codex/hooks", match: (n) => /^inject-.*\.py$/.test(n) },
  { dir: ".opencode/agents", match: (n) => /^trellis-.*\.md$/.test(n) },
  { dir: ".opencode/commands", match: (n) => n === "trellis" },
  { dir: ".opencode/skills", match: (n) => n.startsWith("trellis-") },
  { dir: ".opencode/plugins", match: (n) => /^inject-.*\.js$/.test(n) },
  { dir: ".pi/agents", match: (n) => /^trellis-.*\.md$/.test(n) },
  { dir: ".pi/prompts", match: (n) => /^trellis-.*\.md$/.test(n) },
  { dir: ".pi/skills", match: (n) => n.startsWith("trellis-") },
  { dir: ".pi/extensions", match: (n) => n === "trellis" },
  { dir: ".agents/skills", match: (n) => n.startsWith("trellis-") },
];

/** Trellis-only files at fixed paths that no scan rule covers. */
const FIXED_DELETIONS = [
  PATHS.WORKFLOW_GUIDE_FILE,
  `${PATHS.SCRIPTS}/task.py`,
  `${DIR_NAMES.WORKFLOW}/.template-hashes.json`,
];

/** Framework files migrate rewrites in place, shown as modifications. */
const REWRITES = [`${DIR_NAMES.WORKFLOW}/config.yaml`, `${PATHS.SCRIPTS}/`];

/** Residue that survives the migration on purpose; printed after the run. */
const PRESERVED = [
  `${PATHS.SPEC}/`,
  `${RESEARCH_REL}/`,
  `${PATHS.WORKSPACE}/`,
  `${PATHS.SCRIPTS}/common/`,
];

export function collectTrellisResidue(cwd: string): string[] {
  const found: string[] = [];

  for (const rule of SCAN_RULES) {
    const abs = path.join(cwd, rule.dir);
    let entries: string[];
    try {
      entries = fs.readdirSync(abs);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (rule.match(entry)) found.push(`${rule.dir}/${entry}`);
    }
  }

  for (const rel of FIXED_DELETIONS) {
    if (fs.existsSync(path.join(cwd, rel))) found.push(rel);
  }

  return found.sort();
}

/** Hosts whose config dir carries Trellis residue mini-trellis should overwrite. */
function platformsToReconfigure(cwd: string, deletions: string[]): AITool[] {
  const ids = new Set<AITool>();
  for (const rel of deletions) {
    for (const id of Object.keys(AI_TOOLS) as AITool[]) {
      const configDir = AI_TOOLS[id].configDir;
      if (rel.startsWith(`${configDir}/`)) ids.add(id);
    }
    // `.agents/skills/` is the shared skill dir Codex reads.
    if (rel.startsWith(".agents/")) ids.add("codex");
  }
  return [...ids].sort();
}

export function buildMigratePlan(cwd: string): MigratePlan {
  const deletions = collectTrellisResidue(cwd);
  return {
    deletions,
    reconfigure: platformsToReconfigure(cwd, deletions),
    rewrites: REWRITES,
    dropsVersion: fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW, ".version")),
    rewritesAgents: agentsHasManagedBlock(cwd),
  };
}

function agentsHasManagedBlock(cwd: string): boolean {
  try {
    const content = fs.readFileSync(path.join(cwd, FILE_NAMES.AGENTS), "utf-8");
    return (
      content.includes(TRELLIS_BLOCK_START) &&
      content.includes(TRELLIS_BLOCK_END)
    );
  } catch {
    return false;
  }
}

/**
 * Swap the Trellis-managed block in AGENTS.md for mini-trellis's. Everything
 * outside the markers is the user's and is kept verbatim; the block moves to
 * the top, which is where both inits write it.
 */
function rewriteAgentsMd(cwd: string): void {
  const abs = path.join(cwd, FILE_NAMES.AGENTS);
  const scrubbed = scrubManagedMarkdownBlock(
    fs.readFileSync(abs, "utf-8"),
    TRELLIS_BLOCK_START,
    TRELLIS_BLOCK_END,
  );
  const block = agentsMdContent.trimEnd();
  const rest = scrubbed.fullyEmpty ? "" : `\n${scrubbed.content.trimStart()}`;
  fs.writeFileSync(abs, `${block}\n${rest}`);
}

function renderPlan(
  cwd: string,
  plan: MigratePlan,
  converge: TasksConvergePlan,
): void {
  console.log(chalk.bold("\nmini-trellis migrate plan\n"));

  if (plan.deletions.length > 0 || plan.dropsVersion) {
    console.log(
      chalk.red.bold(
        `Will be deleted (${plan.deletions.length + (plan.dropsVersion ? 1 : 0)}):`,
      ),
    );
    for (const p of plan.deletions) {
      console.log(`  ${chalk.red("-")} ${p}`);
    }
    if (plan.dropsVersion) {
      console.log(
        `  ${chalk.red("-")} ${DIR_NAMES.WORKFLOW}/.version  ${chalk.gray(
          "(stops the Trellis CLI offering to update this project back)",
        )}`,
      );
    }
    console.log();
  }

  console.log(chalk.yellow.bold("Will be overwritten:"));
  for (const p of plan.rewrites) {
    console.log(
      `  ${chalk.yellow("~")} ${p}  ${chalk.gray(
        "(re-apply any local edits after migrating)",
      )}`,
    );
  }
  for (const id of plan.reconfigure) {
    console.log(
      `  ${chalk.yellow("~")} ${AI_TOOLS[id].configDir}/  ${chalk.gray(
        `(rewrite ${AI_TOOLS[id].name} hooks, settings, and mini-trellis skills)`,
      )}`,
    );
  }
  if (plan.rewritesAgents) {
    console.log(
      `  ${chalk.yellow("~")} ${FILE_NAMES.AGENTS}  ${chalk.gray(
        "(replace the Trellis block; text outside it is kept)",
      )}`,
    );
  }

  console.log();
  console.log(chalk.green.bold("Will be kept untouched:"));
  for (const p of PRESERVED) {
    if (fs.existsSync(path.join(cwd, p.replace(/\/$/, "")))) {
      console.log(`  ${chalk.green("=")} ${p}`);
    }
  }

  renderTasksConvergePlan(converge);
}

/** The tasks tree is the only thing left to act on in a re-run project. */
function promptContinue(converge: TasksConvergePlan): Promise<boolean> {
  const message =
    converge.tasks.length > 0
      ? "Delete this Trellis instruction surface and converge its tasks?"
      : "Delete this Trellis instruction surface?";
  return inquirer
    .prompt<{ proceed: boolean }>([
      {
        type: "confirm",
        name: "proceed",
        message,
        default: false,
      },
    ])
    .then((answer) => answer.proceed);
}

/**
 * Asked once per run, and only when there is something to decide. Deleting is
 * irreversible — the tasks tree is not necessarily under version control — so
 * archive is the default everywhere, `--yes` included.
 */
async function promptTasksDisposition(): Promise<TasksDisposition> {
  const { disposition } = await inquirer.prompt<{
    disposition: TasksDisposition;
  }>([
    {
      type: "list",
      name: "disposition",
      message:
        "What should happen to the Trellis workflow files leaving each topic?",
      default: "archive",
      choices: [
        {
          name: `Archive to ${RESEARCH_REL}/<topic>/legacy/   (reversible)`,
          value: "archive",
        },
        { name: "Delete permanently   (not reversible)", value: "delete" },
      ],
    },
  ]);
  return disposition;
}

/** Write the files a fresh mini-trellis project would have. */
async function installMemoryLayer(cwd: string): Promise<void> {
  setWriteMode("force");
  await copyTrellisDir("scripts", path.join(cwd, PATHS.SCRIPTS), {
    executable: true,
  });
  await writeFile(
    path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml"),
    configYamlTemplate,
  );

  // Seeds are created only when absent, so an existing spec index or research
  // inbox keeps whatever the user wrote in it.
  setWriteMode("skip");
  const researchDir = path.join(cwd, DIR_NAMES.WORKFLOW, "research");
  ensureDir(researchDir);
  ensureDir(path.join(researchDir, "archive"));
  await writeFile(path.join(researchDir, "README.md"), researchReadmeContent);

  const guidesDir = path.join(cwd, PATHS.SPEC, "guides");
  ensureDir(guidesDir);
  await writeFile(path.join(guidesDir, "index.md"), guidesIndexContent);
  await writeFile(
    path.join(guidesDir, "mini-memory.md"),
    miniMemoryGuideContent,
  );
}

function executePlan(cwd: string, plan: MigratePlan): void {
  for (const rel of plan.deletions) {
    fs.rmSync(path.join(cwd, rel), { recursive: true, force: true });
  }
  if (plan.dropsVersion) {
    fs.rmSync(path.join(cwd, DIR_NAMES.WORKFLOW, ".version"), { force: true });
  }
}

export async function migrate(options: MigrateOptions = {}): Promise<void> {
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage("migrate")));
    process.exit(1);
  }

  const cwd = process.cwd();
  const plan = buildMigratePlan(cwd);
  const converge = buildTasksConvergePlan(cwd);

  // A converged project has no Trellis residue left, so the tasks tree on its
  // own still means there is something to do. `.trellis/.version` alone is not
  // evidence of Trellis: mini-trellis's own init writes one too.
  if (plan.deletions.length === 0 && converge.tasks.length === 0) {
    console.log(
      chalk.gray("No Trellis installation detected — nothing to migrate."),
    );
    return;
  }

  // Renaming nothing is the only safe answer to a collision: merging a task
  // directory into a note the user already wrote would silently mix them.
  if (converge.conflicts.length > 0) {
    console.error(
      chalk.red(
        `Cannot converge: ${converge.conflicts.length} topic(s) already ` +
          "exist. Move or rename your note(s) first — migrate never merges:",
      ),
    );
    for (const dest of converge.conflicts)
      console.error(`  ${chalk.red("!")} ${dest}`);
    process.exit(1);
  }

  renderPlan(cwd, plan, converge);
  console.log(
    chalk.red.bold(
      "\n⚠ Deletion is permanent: migrate makes no backup. " +
        "Commit or copy anything you may want back first.",
    ),
  );
  console.log();

  if (options.dryRun) {
    console.log(chalk.gray("Dry run — no files were modified."));
    return;
  }

  let disposition: TasksDisposition = "archive";
  if (!options.yes) {
    if (!process.stdin.isTTY) {
      console.error(
        chalk.red(
          "Refusing to prompt for confirmation in a non-interactive shell. " +
            "Pass --yes/-y to confirm or --dry-run to preview.",
        ),
      );
      process.exit(1);
    }
    const ok = await promptContinue(converge);
    if (!ok) {
      console.log(chalk.yellow("Migration cancelled. No files modified."));
      return;
    }
    if (converge.tasks.length > 0) disposition = await promptTasksDisposition();
  }

  // Delete first so the install pass never writes a file this plan removes.
  executePlan(cwd, plan);
  await installMemoryLayer(cwd);
  if (plan.rewritesAgents) rewriteAgentsMd(cwd);
  for (const id of plan.reconfigure) {
    setWriteMode("force");
    await configurePlatform(id, cwd);
  }

  const report = convergeTasks(cwd, converge, disposition);

  console.log();
  console.log(
    chalk.green(
      `Migrated to mini-trellis: ${plan.deletions.length} Trellis path(s) ` +
        `removed, ${
          plan.reconfigure.length +
          plan.rewrites.length +
          (plan.rewritesAgents ? 1 : 0)
        } surface(s) rewritten.`,
    ),
  );
  if (report.moved > 0) {
    const handled =
      disposition === "delete"
        ? `${report.deleted} item(s) deleted`
        : `${report.archived} item(s) moved into ${RESEARCH_REL}/<topic>/legacy/`;
    console.log(
      chalk.green(
        `Converged ${report.moved} task director${
          report.moved === 1 ? "y" : "ies"
        } into ${RESEARCH_REL}/: ${handled} (${
          report.bytes / 1024 < 1024
            ? `${Math.round(report.bytes / 1024)} KB`
            : `${(report.bytes / 1024 / 1024).toFixed(1)} MB`
        }), ${report.mentions.repoint} reference(s) repointed, ` +
          `${report.pointers} session pointer(s) cleared.`,
      ),
    );
    if (report.mentions.keep > 0) {
      console.log(
        chalk.gray(
          `  ${report.mentions.keep} reference(s) left alone — they point at the ` +
            "workflow files that left each topic, or at another repository.",
        ),
      );
    }
    if (report.residue.length > 0) {
      console.log(
        chalk.yellow(
          `  ${PATHS.TASKS}/ was not empty after the move and is kept as-is: ` +
            `${report.residue.slice(0, 5).join(", ")}${
              report.residue.length > 5
                ? ` and ${report.residue.length - 5} more`
                : ""
            }.`,
        ),
      );
    }
  }
  console.log(
    chalk.gray(
      `Kept: ${PRESERVED.join(", ")}. Review ${PATHS.SPEC}/ for anything the ` +
        "four-phase workflow left behind.",
    ),
  );
}
