/**
 * Switch a project that was set up by Trellis over to mini-trellis.
 *
 * Trellis and mini-trellis share the `.trellis/` data directory, so installing
 * mini-trellis on top of a Trellis project leaves both instruction surfaces
 * discoverable: Trellis's skills, commands, and agents sit next to
 * mini-trellis's, and OpenCode keeps loading `.opencode/plugins/inject-*.js`
 * from the directory scan. This command overwrites the host surfaces with
 * mini-trellis's versions, deletes the Trellis-only instruction files, and
 * drops `.trellis/.version` so the Trellis CLI stops offering to "update" the
 * project back to the four-phase workflow.
 *
 * Memory data is never touched: `.trellis/spec/`, `research/`, `workspace/`,
 * and `tasks/` survive as-is. `.trellis/scripts/` IS overwritten, because the
 * SessionStart hook and `add_session.py` are read from there.
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES, PATHS } from "../constants/paths.js";
import { copyTrellisDir } from "../templates/extract.js";
import { configYamlTemplate } from "../templates/trellis/index.js";
import {
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
import { AI_TOOLS, type AITool } from "../types/ai-tools.js";

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
  /** `.trellis/tasks/` holds content the user should review. */
  tasksHasContent: boolean;
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
  `${DIR_NAMES.WORKFLOW}/research/`,
  `${PATHS.WORKSPACE}/`,
  `${PATHS.TASKS}/`,
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

function dirHasContent(abs: string): boolean {
  try {
    return fs.readdirSync(abs).length > 0;
  } catch {
    return false;
  }
}

export function buildMigratePlan(cwd: string): MigratePlan {
  const deletions = collectTrellisResidue(cwd);
  return {
    deletions,
    reconfigure: platformsToReconfigure(cwd, deletions),
    rewrites: REWRITES,
    dropsVersion: fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW, ".version")),
    tasksHasContent: dirHasContent(path.join(cwd, PATHS.TASKS)),
  };
}

function renderPlan(cwd: string, plan: MigratePlan): void {
  console.log(chalk.bold("\nmini-trellis migrate plan\n"));

  console.log(chalk.red.bold(`Will be deleted (${plan.deletions.length}):`));
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

  console.log();
  console.log(chalk.green.bold("Will be kept untouched:"));
  for (const p of PRESERVED) {
    if (fs.existsSync(path.join(cwd, p.replace(/\/$/, "")))) {
      console.log(`  ${chalk.green("=")} ${p}`);
    }
  }

  if (plan.tasksHasContent) {
    console.log();
    console.log(
      chalk.yellow(
        `Note: ${PATHS.TASKS}/ still holds Trellis task directories. ` +
          "They are not touched, but with task.py gone nothing reads them " +
          "any more. Review and remove them by hand if you no longer need them.",
      ),
    );
  }
}

async function promptContinue(): Promise<boolean> {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message: "Delete this Trellis instruction surface?",
      default: false,
    },
  ]);
  return proceed;
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

  // `.trellis/.version` alone is not evidence of Trellis: mini-trellis's own
  // init writes it too, so only treat the project as migratable when real
  // Trellis paths are present.
  if (plan.deletions.length === 0) {
    console.log(
      chalk.gray("No Trellis installation detected — nothing to migrate."),
    );
    return;
  }

  renderPlan(cwd, plan);
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
    const ok = await promptContinue();
    if (!ok) {
      console.log(chalk.yellow("Migration cancelled. No files modified."));
      return;
    }
  }

  // Delete first so the install pass never writes a file this plan removes.
  executePlan(cwd, plan);
  await installMemoryLayer(cwd);
  for (const id of plan.reconfigure) {
    setWriteMode("force");
    await configurePlatform(id, cwd);
  }

  console.log();
  console.log(
    chalk.green(
      `Migrated to mini-trellis: ${plan.deletions.length} Trellis path(s) ` +
        `removed, ${plan.reconfigure.length + plan.rewrites.length} surface(s) ` +
        "rewritten.",
    ),
  );
  if (plan.dropsVersion) {
    console.log(
      chalk.gray(
        `Removed ${DIR_NAMES.WORKFLOW}/.version — a later \`mini-trellis init\` ` +
          "in this project will write it again, which re-arms the Trellis CLI's " +
          "update prompt.",
      ),
    );
  }
  console.log(
    chalk.gray(
      `Kept: ${PRESERVED.join(", ")}. Review ${PATHS.SPEC}/ and ${PATHS.TASKS}/ ` +
        "for anything the four-phase workflow left behind.",
    ),
  );
}
