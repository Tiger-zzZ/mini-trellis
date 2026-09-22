/**
 * Remove files written by mini-trellis init, plus `.trellis/`.
 * Ownership is the current platform template map, not a hash manifest.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import inquirer from "inquirer";

import { DIR_NAMES } from "../constants/paths.js";
import {
  collectPlatformTemplates,
  getConfiguredPlatforms,
} from "../configurators/index.js";
import {
  isCwdHomedir,
  homedirGuardMessage,
  homedirBypassEnabled,
} from "../utils/cwd-guard.js";
import {
  buildManagedRemovalPlan,
  executeManagedRemovalPlan,
  type ManagedRemovalPlan,
} from "../utils/managed-removal.js";

export interface UninstallOptions {
  yes?: boolean;
  dryRun?: boolean;
}

function renderPlan(cwd: string, plan: ManagedRemovalPlan): void {
  const trellisDir = path.join(cwd, DIR_NAMES.WORKFLOW);

  console.log(chalk.bold("\nmini-trellis uninstall plan\n"));

  const deletePaths = plan.deletions
    .filter((d) => !d.missing)
    .map((d) => d.posixPath);

  console.log(
    chalk.red.bold(`Will be deleted (${deletePaths.length + 1} entries):`),
  );
  for (const p of deletePaths) {
    console.log(`  ${chalk.red("-")} ${p}`);
  }
  if (plan.removeTrellisDir && fs.existsSync(trellisDir)) {
    console.log(
      `  ${chalk.red("-")} ${DIR_NAMES.WORKFLOW}/  ${chalk.gray(
        "(entire directory — including specs, research, and journals)",
      )}`,
    );
  }

  if (plan.modifications.length > 0) {
    console.log();
    console.log(
      chalk.yellow.bold(
        `Will be modified (${plan.modifications.length} files):`,
      ),
    );
    for (const m of plan.modifications) {
      console.log(
        `  ${chalk.yellow("~")} ${m.posixPath}  ${chalk.gray(`(${m.reason})`)}`,
      );
    }
  }

  console.log();
}

async function promptContinue(): Promise<boolean> {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message: "Continue?",
      default: true,
    },
  ]);
  return proceed;
}

export function collectUncommittedTrellisData(cwd: string): string[] {
  const w = DIR_NAMES.WORKFLOW;
  const userDataDirs = [`${w}/spec`, `${w}/research`, `${w}/workspace`];
  try {
    const out = execFileSync(
      "git",
      ["-C", cwd, "status", "--porcelain", "--", ...userDataDirs],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\S+\s+/, "").replace(/^.*\s->\s/, ""));
  } catch {
    return [];
  }
}

function dirtyUninstallBypassEnabled(): boolean {
  return process.env.TRELLIS_ALLOW_DIRTY_UNINSTALL === "1";
}

function collectOwnedPaths(cwd: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  hashes[FILE_NAMES_AGENTS] = "";
  const platforms = getConfiguredPlatforms(cwd);
  for (const id of platforms) {
    const templates = collectPlatformTemplates(id);
    if (!templates) continue;
    for (const rel of templates.keys()) {
      hashes[rel] = "";
    }
  }
  return hashes;
}

const FILE_NAMES_AGENTS = "AGENTS.md";

export async function uninstall(options: UninstallOptions = {}): Promise<void> {
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage("uninstall")));
    process.exit(1);
  }

  const cwd = process.cwd();
  const trellisDir = path.join(cwd, DIR_NAMES.WORKFLOW);

  if (!fs.existsSync(trellisDir)) {
    console.log(
      chalk.gray(
        "mini-trellis is not installed in this project (no .trellis/ directory found).",
      ),
    );
    return;
  }

  const hashes = collectOwnedPaths(cwd);
  const plan = buildManagedRemovalPlan(cwd, hashes);
  renderPlan(cwd, plan);

  const uncommitted = collectUncommittedTrellisData(cwd);
  if (uncommitted.length > 0) {
    console.warn(
      chalk.red.bold(
        `\n⚠ ${uncommitted.length} uncommitted file(s) under .trellis/ ` +
          `will be permanently deleted with no backup:`,
      ),
    );
    for (const p of uncommitted.slice(0, 20)) {
      console.warn(chalk.red(`    ${p}`));
    }
    if (uncommitted.length > 20) {
      console.warn(chalk.red(`    … and ${uncommitted.length - 20} more`));
    }
    console.warn(
      chalk.yellow("Commit or stash them first if you want to keep them.\n"),
    );
  }

  if (options.dryRun) {
    console.log(chalk.gray("Dry run — no files were modified."));
    return;
  }

  if (uncommitted.length > 0 && options.yes && !dirtyUninstallBypassEnabled()) {
    console.error(
      chalk.red(
        "Refusing to uninstall with --yes while .trellis/ has uncommitted user data. " +
          "Commit or stash it, re-run without --yes, or set TRELLIS_ALLOW_DIRTY_UNINSTALL=1.",
      ),
    );
    process.exit(1);
  }

  if (!options.yes) {
    if (!process.stdin.isTTY) {
      console.error(
        chalk.red(
          "Refusing to prompt for confirmation in a non-interactive shell. " +
            "Pass --yes/-y to confirm or --dry-run to preview.",
        ),
      );
      readline.createInterface({ input: process.stdin }).close();
      process.exit(1);
    }

    const ok = await promptContinue();
    if (!ok) {
      console.log(chalk.yellow("Uninstall cancelled. No files modified."));
      return;
    }
  }

  const summary = executeManagedRemovalPlan(cwd, plan);

  console.log();
  console.log(
    chalk.green(
      `Uninstalled mini-trellis: ${summary.deletedFiles} files deleted, ` +
        `${summary.modifiedFiles} files modified, ` +
        `${summary.deletedDirs} directories removed.`,
    ),
  );
}
