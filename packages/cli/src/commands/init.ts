import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import figlet from "figlet";
import inquirer from "inquirer";
import { createWorkflowStructure } from "../configurators/workflow.js";
import { collectTrellisResidue } from "./migrate.js";
import {
  getInitToolChoices,
  resolveCliFlag,
  configurePlatform,
  getConfiguredPlatforms,
  getPlatformsWithPythonHooks,
} from "../configurators/index.js";
import {
  getPythonCommandForPlatform,
  setResolvedPythonCommand,
} from "../configurators/shared.js";
import { AI_TOOLS, type CliFlag } from "../types/ai-tools.js";
import { DIR_NAMES, FILE_NAMES, PATHS } from "../constants/paths.js";
import { agentsMdContent } from "../templates/markdown/index.js";
import {
  setWriteMode,
  writeFile,
  type WriteMode,
} from "../utils/file-writer.js";
import {
  isCwdHomedir,
  homedirGuardMessage,
  homedirBypassEnabled,
} from "../utils/cwd-guard.js";

const MIN_PYTHON_MAJOR = 3;
const MIN_PYTHON_MINOR = 9;
const PYTHON_VERSION_RE = /Python (\d+)\.(\d+)/;

export function isSupportedPythonVersion(versionOutput: string): boolean {
  const match = versionOutput.match(PYTHON_VERSION_RE);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (
    major > MIN_PYTHON_MAJOR ||
    (major === MIN_PYTHON_MAJOR && minor >= MIN_PYTHON_MINOR)
  );
}

type PythonProbe = string | null | "sandbox-restricted";

function detectPythonVersion(command: string): PythonProbe {
  try {
    return execSync(`${command} --version`, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "EPERM" || code === "EACCES") {
      return "sandbox-restricted";
    }
    return null;
  }
}

export function requireSupportedPython(command: string): string {
  if (process.env.TRELLIS_SKIP_PYTHON_CHECK === "1") {
    return `version check skipped (TRELLIS_SKIP_PYTHON_CHECK=1)`;
  }

  const versionOutput = detectPythonVersion(command);

  if (versionOutput === "sandbox-restricted") {
    console.warn(
      chalk.yellow(
        `⚠ Python version check skipped — sandboxed environment blocked ` +
          `child_process spawn (EPERM/EACCES). Assuming "${command}" is on ` +
          `PATH. If init fails later, re-run on the host or set ` +
          `TRELLIS_SKIP_PYTHON_CHECK=1.`,
      ),
    );
    return `version unknown (sandbox-restricted)`;
  }

  if (!versionOutput) {
    throw new Error(
      `Python command "${command}" not found. mini-trellis init requires Python ≥ 3.9.`,
    );
  }

  if (!isSupportedPythonVersion(versionOutput)) {
    throw new Error(
      `${versionOutput} detected via "${command}", but mini-trellis init requires Python ≥ 3.9.`,
    );
  }

  return versionOutput;
}

const PYTHON_CANDIDATES: Record<"win32" | "other", readonly string[]> = {
  win32: ["python", "python3", "py -3"],
  other: ["python3", "python"],
};

export function resolveSupportedPython(): {
  command: string;
  version: string;
} {
  const override = process.env.TRELLIS_PYTHON_CMD?.trim();
  if (override) {
    setResolvedPythonCommand(override);
    return { command: override, version: "set via TRELLIS_PYTHON_CMD" };
  }

  if (process.env.TRELLIS_SKIP_PYTHON_CHECK === "1") {
    const fallback = getPythonCommandForPlatform();
    setResolvedPythonCommand(fallback);
    return {
      command: fallback,
      version: "version check skipped (TRELLIS_SKIP_PYTHON_CHECK=1)",
    };
  }

  const candidates =
    process.platform === "win32"
      ? PYTHON_CANDIDATES.win32
      : PYTHON_CANDIDATES.other;

  const probeFailures: string[] = [];
  for (const candidate of candidates) {
    const probe = detectPythonVersion(candidate);
    if (probe === "sandbox-restricted") {
      console.warn(
        chalk.yellow(
          `⚠ Python version check skipped — sandboxed environment blocked ` +
            `child_process spawn (EPERM/EACCES). Assuming "${candidate}" is ` +
            `on PATH. If init fails later, re-run on the host or set ` +
            `TRELLIS_SKIP_PYTHON_CHECK=1.`,
        ),
      );
      setResolvedPythonCommand(candidate);
      return {
        command: candidate,
        version: "version unknown (sandbox-restricted)",
      };
    }
    if (!probe) {
      probeFailures.push(`${candidate}: not found`);
      continue;
    }
    if (!isSupportedPythonVersion(probe)) {
      probeFailures.push(`${candidate}: ${probe} (< 3.9)`);
      continue;
    }
    setResolvedPythonCommand(candidate);
    return { command: candidate, version: probe };
  }

  const isWindows = process.platform === "win32";
  const installHint = isWindows
    ? `Install Python ≥ 3.9 from https://www.python.org/downloads/windows/ — make sure ` +
      `"Add Python to PATH" is checked in the installer. Or, if Python is ` +
      `installed under a different name, set TRELLIS_PYTHON_CMD=<your-cmd> ` +
      `before re-running init (e.g. \`set TRELLIS_PYTHON_CMD=py -3\`).`
    : `Install Python ≥ 3.9 from https://www.python.org/downloads/ or via your ` +
      `package manager. Or set TRELLIS_PYTHON_CMD=<your-cmd> before re-running.`;

  throw new Error(
    `No supported Python command found. Tried: ${candidates.join(", ")}.\n` +
      `Probe results:\n  ${probeFailures.join("\n  ")}\n\n` +
      `mini-trellis init requires Python ≥ 3.9. ${installHint}\n` +
      `Last-resort escape hatch: set TRELLIS_SKIP_PYTHON_CHECK=1 to skip the probe entirely.`,
  );
}

function getOsDisplayName(
  platform: NodeJS.Platform = process.platform,
): string {
  switch (platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

function logPythonAdaptationNotice(command: string): void {
  const osName = getOsDisplayName();
  console.log(
    chalk.blue(
      `📌 ${osName} detected: mini-trellis rendered Python commands as "${command}" in generated hooks, settings, and help text`,
    ),
  );
}

export function slugifyDeveloperName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "user";
}

export interface InitOptions {
  claude?: boolean;
  opencode?: boolean;
  codex?: boolean;
  pi?: boolean;
  yes?: boolean;
  user?: string;
  force?: boolean;
  skipExisting?: boolean;
}

type _AssertCliFlagsInOptions = [CliFlag] extends [keyof InitOptions]
  ? true
  : "ERROR: CliFlag has values not present in InitOptions";
const _cliFlagCheck: _AssertCliFlagsInOptions = true;
void _cliFlagCheck;

function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function createRootFiles(cwd: string): Promise<void> {
  const agentsPath = path.join(cwd, FILE_NAMES.AGENTS);
  const agentsWritten = await writeFile(agentsPath, agentsMdContent);
  if (agentsWritten) {
    console.log(chalk.blue("📄 Created AGENTS.md"));
  }
}

function initDeveloper(cwd: string, pythonCmd: string, name: string): void {
  try {
    const scriptPath = path.join(cwd, PATHS.SCRIPTS, "init_developer.py");
    execSync(`${pythonCmd} "${scriptPath}" "${name}"`, {
      cwd,
      stdio: "pipe",
    });
  } catch {
    console.log(
      chalk.yellow("⚠ Could not initialize developer. Run manually:"),
    );
    console.log(
      chalk.gray(`  ${pythonCmd} .trellis/scripts/init_developer.py ${name}`),
    );
  }
}

async function handleReinit(
  cwd: string,
  options: InitOptions,
  developerName: string | undefined,
  pythonCmd: string,
): Promise<boolean> {
  const TOOLS = getInitToolChoices();
  const configuredPlatforms = getConfiguredPlatforms(cwd);
  const configuredNames = [...configuredPlatforms]
    .map((id) => AI_TOOLS[id].name)
    .join(", ");

  const explicitTools = TOOLS.filter(
    (t) => options[t.key as keyof InitOptions],
  ).map((t) => t.key);

  let doAddPlatforms = explicitTools.length > 0;
  let doAddDeveloper = !!options.user;
  let platformsToAdd: string[] = explicitTools;

  if (!doAddPlatforms && !doAddDeveloper) {
    if (options.yes) {
      console.log(chalk.gray(`Already initialized with: ${configuredNames}`));
      console.log(
        chalk.gray(
          "Use platform flags (e.g., --codex) or -u <name> to add platforms/developer.",
        ),
      );
      return true;
    }

    console.log(
      chalk.gray(`\n   Already initialized with: ${configuredNames}\n`),
    );

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: "list",
        name: "action",
        message:
          "mini-trellis is already initialized. What would you like to do?",
        choices: [
          { name: "Add AI platform(s)", value: "add-platform" },
          {
            name: "Set up developer identity on this device",
            value: "add-developer",
          },
          { name: "Full re-initialize", value: "full" },
        ],
      },
    ]);

    if (action === "full") {
      return false;
    }
    if (action === "add-platform") doAddPlatforms = true;
    if (action === "add-developer") doAddDeveloper = true;
  }

  if (doAddPlatforms) {
    if (platformsToAdd.length === 0) {
      const unconfigured = TOOLS.filter((t) => {
        const pid = resolveCliFlag(t.key);
        return pid && !configuredPlatforms.has(pid);
      });

      if (unconfigured.length === 0) {
        console.log(
          chalk.green("✓ All available platforms are already configured."),
        );
      } else {
        const answers = await inquirer.prompt<{ tools: string[] }>([
          {
            type: "checkbox",
            name: "tools",
            message: "Select platforms to add:",
            choices: unconfigured.map((t) => ({
              name: t.name,
              value: t.key,
            })),
          },
        ]);
        platformsToAdd = answers.tools;
      }
    }

    for (const tool of platformsToAdd) {
      const platformId = resolveCliFlag(tool as CliFlag);
      if (!platformId) continue;
      if (configuredPlatforms.has(platformId)) {
        console.log(
          chalk.gray(
            `  ○ ${AI_TOOLS[platformId].name} already configured, skipping`,
          ),
        );
        continue;
      }
      console.log(chalk.blue(`📝 Configuring ${AI_TOOLS[platformId].name}...`));
      await configurePlatform(platformId, cwd);
    }
  }

  if (doAddDeveloper) {
    let devName = developerName;
    if (!devName) {
      devName = await askInput("Your name: ");
      while (!devName) {
        console.log(chalk.yellow("Name is required"));
        devName = await askInput("Your name: ");
      }
    }
    initDeveloper(cwd, pythonCmd, devName);
    console.log(chalk.green(`✓ Developer "${devName}" initialized`));
  }

  return true;
}

/**
 * Trellis and mini-trellis share `.trellis/`, so a project can carry both
 * instruction surfaces at once: Trellis's skills, commands, and agents stay
 * discoverable beside mini-trellis's, and init skips files that already exist
 * (including `.claude/hooks/session-start.py`, which then stays Trellis's and
 * silently never runs mini-trellis's SessionStart). Say so instead of letting
 * the user assume the switch was clean.
 */
function warnIfTrellisResidue(cwd: string): void {
  const residue = collectTrellisResidue(cwd);
  if (residue.length === 0) return;

  console.log(
    chalk.yellow.bold(
      `⚠ This project still has ${residue.length} Trellis path(s) installed.`,
    ),
  );
  console.log(
    chalk.yellow(
      "  Files that already exist are skipped, so mini-trellis shares this\n" +
        "  project with Trellis rather than replacing it.",
    ),
  );
  console.log(
    chalk.gray(
      "  Already using Trellis here? Keeping the two apart is the safer path:\n" +
        "  point mini-trellis at a new project instead.\n" +
        "  If you do want to switch this one, run: mini-trellis migrate --dry-run",
    ),
  );
  console.log();
}

export async function init(options: InitOptions): Promise<void> {
  if (isCwdHomedir() && !homedirBypassEnabled()) {
    console.error(chalk.red(homedirGuardMessage("init")));
    process.exit(1);
  }

  const cwd = process.cwd();
  const isFirstInit = !fs.existsSync(path.join(cwd, DIR_NAMES.WORKFLOW));

  const banner = figlet.textSync("mini-trellis", { font: "Rebel" });
  console.log(chalk.cyan(`\n${banner.trimEnd()}`));
  console.log(chalk.gray("\n   Memory layer: spec, research, journal, mem\n"));

  warnIfTrellisResidue(cwd);

  let writeMode: WriteMode = "ask";
  if (options.force) {
    writeMode = "force";
    console.log(chalk.gray("Mode: Force overwrite existing files\n"));
  } else if (options.skipExisting) {
    writeMode = "skip";
    console.log(chalk.gray("Mode: Skip existing files\n"));
  } else if (options.yes) {
    writeMode = "skip";
    console.log(chalk.gray("Mode: Non-interactive (skip existing files)\n"));
  }
  setWriteMode(writeMode);

  let developerName = options.user;
  if (!developerName) {
    const isGitRepo = fs.existsSync(path.join(cwd, ".git"));
    if (isGitRepo) {
      try {
        developerName = execSync("git config user.name", {
          cwd,
          encoding: "utf-8",
        }).trim();
      } catch {
        // Git not available or no user.name configured
      }
    }
  }

  if (developerName) {
    console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
  }

  const { command: pythonCmd } = resolveSupportedPython();

  if (!isFirstInit && !options.force && !options.skipExisting) {
    const reinitDone = await handleReinit(
      cwd,
      options,
      developerName,
      pythonCmd,
    );
    if (reinitDone) return;
  }

  if (!developerName && !options.yes) {
    console.log(
      chalk.gray(
        "\nmini-trellis keeps a per-developer journal under " +
          `${PATHS.WORKSPACE}/{name}/.\n` +
          "Tip: Usually this is your git username (git config user.name).\n",
      ),
    );
    developerName = await askInput("Your name: ");
    while (!developerName) {
      console.log(chalk.yellow("Name is required"));
      developerName = await askInput("Your name: ");
    }
    console.log(chalk.blue("👤 Developer:"), chalk.gray(developerName));
  }

  const TOOLS = getInitToolChoices();
  const explicitTools = TOOLS.filter(
    (t) => options[t.key as keyof InitOptions],
  ).map((t) => t.key);

  let tools: string[];
  if (explicitTools.length > 0) {
    tools = explicitTools;
  } else if (options.yes) {
    tools = TOOLS.filter((t) => t.defaultChecked).map((t) => t.key);
  } else {
    const answers = await inquirer.prompt<{ tools: string[] }>([
      {
        type: "checkbox",
        name: "tools",
        message: "Select AI tools to configure:",
        choices: TOOLS.map((t) => ({
          name: t.name,
          value: t.key,
          checked: t.defaultChecked,
        })),
      },
    ]);
    tools = answers.tools;
  }

  if (tools.length === 0) {
    console.log(
      chalk.yellow("No tools selected. At least one tool is required."),
    );
    return;
  }

  console.log(chalk.blue("📁 Creating memory skeleton..."));
  await createWorkflowStructure(cwd);

  for (const tool of tools) {
    const platformId = resolveCliFlag(tool);
    if (platformId) {
      console.log(chalk.blue(`📝 Configuring ${AI_TOOLS[platformId].name}...`));
      await configurePlatform(platformId, cwd);
    }
  }

  const pythonPlatforms = getPlatformsWithPythonHooks();
  const hasSelectedPythonPlatform = pythonPlatforms.some((id) =>
    tools.includes(AI_TOOLS[id].cliFlag),
  );
  if (hasSelectedPythonPlatform) {
    logPythonAdaptationNotice(pythonCmd);
  }

  await createRootFiles(cwd);

  if (developerName) {
    initDeveloper(cwd, pythonCmd, developerName);
  }

  console.log(chalk.green("\n✓ mini-trellis initialized."));
  console.log(
    chalk.gray(
      "  Record sessions with /mini-trellis:remember (or $mini-trellis-remember on Codex).",
    ),
  );
  console.log(
    chalk.gray("  Search past dialogue with: mini-trellis mem search <kw>\n"),
  );
}
