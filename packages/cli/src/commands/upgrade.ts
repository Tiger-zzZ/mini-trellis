import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { PACKAGE_NAME, VERSION } from "../constants/version.js";
import { MANIFEST_PATH } from "../utils/managed-manifest.js";

export interface UpgradeOptions {
  tag?: string;
  dryRun?: boolean;
}

interface SpawnResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  stdout?: string | Buffer | null;
}

interface SpawnOptions {
  stdio: "inherit" | ["ignore", "pipe", "inherit"];
  shell: false;
  encoding?: "utf8";
  cwd?: string;
}

type SpawnRunner = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => SpawnResult;

export interface UpgradeCommandPlan {
  command: string;
  args: string[];
  spawnOptions: SpawnOptions;
  displayCommand: string;
  target: string;
  tag: string;
  binaryCheckCommand: string;
}

const NPM_TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function resolveUpgradeTag(
  currentVersion: string = VERSION,
  requestedTag?: string,
): string {
  if (requestedTag) {
    if (!NPM_TAG_RE.test(requestedTag)) {
      throw new Error(
        `Invalid npm tag/version "${requestedTag}". Use a simple dist-tag or version such as latest, beta, rc, or 0.6.0-beta.8.`,
      );
    }
    return requestedTag;
  }

  if (currentVersion.includes("-beta")) return "beta";
  if (currentVersion.includes("-rc")) return "rc";
  return "latest";
}

function binaryCheckCommand(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" ? "where mini-trellis" : "which mini-trellis";
}

export function buildUpgradeCommand(
  options: UpgradeOptions = {},
  currentVersion: string = VERSION,
  platform: NodeJS.Platform = process.platform,
): UpgradeCommandPlan {
  const tag = resolveUpgradeTag(currentVersion, options.tag);
  const target = `${PACKAGE_NAME}@${tag}`;
  const npmArgs = ["install", "-g", target];
  const displayCommand = `npm ${npmArgs.join(" ")}`;
  const spawnOptions: SpawnOptions = { stdio: "inherit", shell: false };

  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", displayCommand],
      spawnOptions,
      displayCommand,
      target,
      tag,
      binaryCheckCommand: binaryCheckCommand(platform),
    };
  }

  return {
    command: "npm",
    args: npmArgs,
    spawnOptions,
    displayCommand,
    target,
    tag,
    binaryCheckCommand: binaryCheckCommand(platform),
  };
}

function troubleshooting(plan: UpgradeCommandPlan): string {
  return [
    "",
    "Troubleshooting:",
    `- Manual command: ${plan.displayCommand}`,
    "- Check npm global prefix and PATH: npm config get prefix",
    `- Check which mini-trellis binary your shell resolves: ${plan.binaryCheckCommand}`,
    "- If this is a permissions error, fix your Node/npm install or npm prefix; mini-trellis does not run sudo.",
    "- If npm reports an existing binary or locked file, resolve that npm error manually; mini-trellis does not run --force.",
  ].join("\n");
}

function hasProjectInstallation(cwd: string): boolean {
  if (fs.existsSync(path.join(cwd, MANIFEST_PATH))) return true;
  // Installs from before the ownership manifest still carry this managed block.
  try {
    const agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
    const block = agents
      .split("<!-- TRELLIS:START -->")[1]
      ?.split("<!-- TRELLIS:END -->")[0];
    return (
      !!block &&
      /^# mini-trellis\r?$/m.test(block) &&
      block.includes("Managed by mini-trellis.") &&
      fs.existsSync(path.join(cwd, ".trellis/scripts/add_session.py"))
    );
  } catch {
    return false;
  }
}

function refreshUpgradedProject(cwd: string, runner: SpawnRunner): void {
  const recovery =
    "CLI upgraded, but project refresh did not complete. Run mini-trellis refresh to continue.";
  // Resolve npm's installed package, not the old executable or a project-local
  // binary on PATH. A separate process loads the newly installed templates.
  const root = runner(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm root -g"]
      : ["root", "-g"],
    { stdio: ["ignore", "pipe", "inherit"], shell: false, encoding: "utf8" },
  );
  const globalRoot = root.stdout?.toString().trim();
  if (
    root.error ||
    root.signal ||
    root.status !== 0 ||
    !globalRoot ||
    !path.isAbsolute(globalRoot)
  )
    throw new Error(`${recovery} Could not resolve npm root -g.`);
  const entry = path.join(globalRoot, PACKAGE_NAME, "bin/mini-trellis.js");
  const result = runner(process.execPath, [entry, "refresh"], {
    stdio: "inherit",
    shell: false,
    cwd,
  });
  if (result.error || result.signal || result.status !== 0)
    throw new Error(
      `${recovery}${result.error ? ` ${result.error.message}` : ""}`,
    );
  console.log(chalk.green("✓ Current project refreshed with the upgraded CLI"));
}

export async function upgrade(
  options: UpgradeOptions = {},
  runner: SpawnRunner = spawnSync,
): Promise<void> {
  const plan = buildUpgradeCommand(options);
  const cwd = process.cwd();
  const refreshProject = hasProjectInstallation(cwd);

  console.log(chalk.cyan(`Upgrading mini-trellis CLI to ${plan.target}`));
  console.log(chalk.gray(`Run: ${plan.displayCommand}`));
  if (refreshProject)
    console.log(
      chalk.gray("Then: refresh the current project using the upgraded CLI"),
    );

  if (options.dryRun) {
    console.log(chalk.gray("Dry run: no changes made."));
    return;
  }

  const result = runner(plan.command, plan.args, plan.spawnOptions);
  if (result.error) {
    throw new Error(
      `Failed to run npm. Install npm or run manually: ${plan.displayCommand}${troubleshooting(plan)}`,
    );
  }
  if (result.signal) {
    throw new Error(
      `npm install was interrupted by ${result.signal}.${troubleshooting(plan)}`,
    );
  }
  if (result.status === null) {
    throw new Error(
      `npm install failed without an exit status.${troubleshooting(plan)}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `npm install failed with exit code ${result.status}.${troubleshooting(plan)}`,
    );
  }

  console.log(chalk.green("\n✓ mini-trellis CLI upgrade completed"));
  if (refreshProject) refreshUpgradedProject(cwd, runner);
  console.log(chalk.gray("Run: mini-trellis --version"));
  console.log(chalk.gray(`Run: ${plan.binaryCheckCommand}`));
}
