import chalk from "chalk";
import { Command } from "commander";
import { init } from "../commands/init.js";
import { migrate } from "../commands/migrate.js";
import { upgrade } from "../commands/upgrade.js";
import { uninstall } from "../commands/uninstall.js";
import { runMem } from "../commands/mem.js";
import { runDoctor } from "../commands/doctor.js";
import { runRefresh } from "../commands/refresh.js";
import { PACKAGE_NAME, VERSION } from "../constants/version.js";
import { getConfiguredPlatforms } from "../configurators/index.js";
import { AI_TOOLS } from "../types/ai-tools.js";

export { VERSION, PACKAGE_NAME };

const program = new Command();

program
  .name("mini-trellis")
  .description(
    "mini-trellis — spec, research, journal, and cross-session memory",
  )
  .version(VERSION, "-v, --version", "output the version number");

program
  .command("init")
  .description("Initialize mini-trellis in the current project")
  .option("--claude", "Include Claude Code commands")
  .option("--opencode", "Include OpenCode commands")
  .option(
    "--opencode-version <1|2>",
    "Choose the OpenCode plugin protocol (new projects default to V2; existing assets are preserved)",
  )
  .option("--codex", "Include Codex skills")
  .option("--pi", "Include Pi Agent extension assets")
  .option("--dsh", "Include DeepSeek Harness skills")
  .option("--cursor", "Include Cursor skills and local sessionStart")
  .option(
    "--kiro",
    "Include Kiro CLI V3 / IDE skills and project SessionStart hook",
  )
  .option(
    "--zcode",
    "Include Z.ai ZCode skills and project SessionStart (requires hook trust)",
  )
  .option(
    "--codebuddy",
    "Include CodeBuddy CLI / IDE commands, skills and SessionStart",
  )
  .option("-y, --yes", "Skip prompts and use defaults")
  .option(
    "-u, --user <name>",
    "Initialize developer identity with specified name",
  )
  .option("-f, --force", "Overwrite existing files without asking")
  .option("-s, --skip-existing", "Skip existing files without asking")
  .action(async (options: Record<string, unknown>) => {
    try {
      await init(options);
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("migrate")
  .option(
    "--opencode-version <1|2>",
    "Choose the OpenCode protocol when migrating OpenCode assets",
  )
  .description(
    "Switch a project set up by Trellis over to mini-trellis (removes the Trellis instruction surface and converges .trellis/tasks/ into research topics)",
  )
  .option(
    "-y, --yes",
    "Skip both prompts; task files are archived to <topic>/legacy/",
  )
  .option(
    "--dry-run",
    "List what would change, including the task convergence, without changing anything",
  )
  .action(async (options: Record<string, unknown>) => {
    try {
      await migrate({
        yes: options.yes as boolean,
        dryRun: options.dryRun as boolean,
        opencodeVersion: options.opencodeVersion as string | undefined,
      });
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("upgrade")
  .description(
    "Upgrade the global CLI and refresh the current initialized project",
  )
  .option(
    "--tag <tag>",
    "npm dist-tag or version to install (default follows current channel: latest, beta, or rc)",
  )
  .option(
    "--dry-run",
    "Preview the upgrade and project refresh without making changes",
  )
  .action(async (options: Record<string, unknown>) => {
    try {
      await upgrade({
        tag: options.tag as string | undefined,
        dryRun: options.dryRun as boolean,
      });
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("uninstall")
  .description(
    "Remove mini-trellis platform files and .trellis/ from this project",
  )
  .option("-y, --yes", "Skip confirmation prompt")
  .option("--dry-run", "List what would be removed without changing anything")
  .action(async (options: Record<string, unknown>) => {
    try {
      await uninstall({
        yes: options.yes as boolean,
        dryRun: options.dryRun as boolean,
      });
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("mem")
  .description(
    "Recall project documents and AI conversation history (run 'mini-trellis mem help' for subcommands)",
  )
  .allowUnknownOption(true)
  .helpOption(false)
  .argument(
    "[args...]",
    "subcommand and arguments (recall|read|list|search|context|extract|projects|help)",
  )
  .action((args: string[] = []) => {
    try {
      runMem(args);
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program
  .command("doctor")
  .description("Check mini-trellis files, managed instructions, and host hooks")
  .option("--json", "Output machine-readable JSON")
  .action((options: Record<string, unknown>) => {
    const report = runDoctor({ json: options.json as boolean });
    if (!report.ok) process.exitCode = 1;
  });

program
  .command("refresh")
  .description("Preview or safely refresh installed mini-trellis assets")
  .option("--claude", "Refresh Claude Code assets")
  .option("--codex", "Refresh Codex assets")
  .option("--opencode", "Refresh OpenCode assets")
  .option(
    "--opencode-version <1|2>",
    "Explicitly switch OpenCode plugin protocol; ordinary refresh preserves it",
  )
  .option("--pi", "Refresh Pi Agent assets")
  .option("--dsh", "Refresh DeepSeek Harness skills")
  .option("--cursor", "Refresh Cursor skills and local sessionStart")
  .option("--codebuddy", "Refresh CodeBuddy CLI / IDE assets")
  .option("--zcode", "Refresh Z.ai ZCode project assets")
  .option("--kiro", "Refresh Kiro project skills and SessionStart hook")
  .option("--dry-run", "Preview changes without writing files")
  .option("--json", "Output machine-readable JSON")
  .action((options: Record<string, unknown>) => {
    const report = runRefresh({
      claude: options.claude as boolean,
      codex: options.codex as boolean,
      opencode: options.opencode as boolean,
      pi: options.pi as boolean,
      dsh: options.dsh as boolean,
      cursor: options.cursor as boolean,
      codebuddy: options.codebuddy as boolean,
      zcode: options.zcode as boolean,
      kiro: options.kiro as boolean,
      opencodeVersion: options.opencodeVersion as string | undefined,
      dryRun: options.dryRun as boolean,
      json: options.json as boolean,
    });
    if (!report.ok) process.exitCode = 1;
  });

program
  .command("platforms")
  .description(
    "Show which AI platforms are configured (active) in the current project",
  )
  .option("--json", "Output machine-readable JSON")
  .action((options: Record<string, unknown>) => {
    try {
      const cwd = process.cwd();
      const configured = getConfiguredPlatforms(cwd);
      const platforms = [...configured].map((id) => ({
        id,
        displayName: AI_TOOLS[id].name,
        configDir: AI_TOOLS[id].configDir,
      }));

      if (options.json) {
        console.log(JSON.stringify({ platforms }, null, 2));
        return;
      }

      if (platforms.length === 0) {
        console.log(chalk.gray("No platforms configured in this project."));
        return;
      }

      console.log(chalk.bold("Configured platforms:"));
      for (const p of platforms) {
        console.log(`  ${p.displayName} (${p.id}) — ${p.configDir}`);
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      if (process.env.DEBUG || process.env.TRELLIS_DEBUG) {
        console.error(error instanceof Error ? error.stack : error);
      }
      process.exit(1);
    }
  });

program.parse();
