import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { AI_TOOLS, type AITool } from "../types/ai-tools.js";
import { getConfiguredPlatforms } from "../configurators/index.js";

export type DoctorLevel = "ok" | "warn" | "error";

export interface DoctorCheck {
  level: DoctorLevel;
  name: string;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  platforms: AITool[];
}

const PLATFORM_CHECKS: Record<AITool, string[]> = {
  "claude-code": [".claude/hooks/session-start.py", ".claude/settings.json"],
  codex: [".codex/hooks/session-start.py", ".codex/hooks.json"],
  opencode: [".opencode/plugins/session-start.js"],
  pi: [".pi/extensions/mini-trellis/index.ts", ".pi/settings.json"],
};

export function buildDoctorReport(cwd: string): DoctorReport {
  const checks: DoctorCheck[] = [];
  const exists = (relative: string): boolean =>
    fs.existsSync(path.join(cwd, relative));

  const workflowReady =
    exists(".trellis") && exists(".trellis/scripts/add_session.py");
  checks.push({
    level: workflowReady ? "ok" : "error",
    name: "memory-layer",
    detail: workflowReady
      ? ".trellis and add_session.py are present"
      : "missing .trellis or .trellis/scripts/add_session.py; run mini-trellis init",
  });

  const agents = exists("AGENTS.md")
    ? fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8")
    : "";
  const agentsReady =
    agents.includes("<!-- TRELLIS:START -->") &&
    agents.includes("<!-- TRELLIS:END -->");
  checks.push({
    level: agentsReady ? "ok" : "warn",
    name: "instructions",
    detail: agentsReady
      ? "AGENTS.md contains the managed mini-trellis block"
      : "AGENTS.md is missing the managed mini-trellis block; run init to add it",
  });

  const platforms = [...getConfiguredPlatforms(cwd)];
  for (const platform of Object.keys(AI_TOOLS) as AITool[]) {
    const files = PLATFORM_CHECKS[platform];
    const present = files.filter(exists);
    if (present.length === 0) continue;
    const complete = present.length === files.length;
    checks.push({
      level: complete ? "ok" : "warn",
      name: platform,
      detail: complete
        ? `${AI_TOOLS[platform].name} hook and config are present`
        : `${AI_TOOLS[platform].name} is partially configured (${present.length}/${files.length} files)`,
    });
  }

  if (platforms.length === 0) {
    checks.push({
      level: "warn",
      name: "platforms",
      detail:
        "no host hook detected; choose --claude, --codex, --opencode, or --pi",
    });
  }

  return {
    ok: checks.every((check) => check.level !== "error"),
    checks,
    platforms,
  };
}

export function runDoctor(
  options: { json?: boolean; cwd?: string } = {},
): DoctorReport {
  const report = buildDoctorReport(options.cwd ?? process.cwd());
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.bold("mini-trellis doctor\n"));
    for (const check of report.checks) {
      const icon =
        check.level === "ok" ? "✓" : check.level === "warn" ? "!" : "✗";
      const color =
        check.level === "ok"
          ? chalk.green
          : check.level === "warn"
            ? chalk.yellow
            : chalk.red;
      console.log(`${color(icon)} ${check.name}: ${check.detail}`);
    }
    console.log();
    console.log(
      report.ok
        ? chalk.green("Doctor passed.")
        : chalk.red("Doctor found blocking issues."),
    );
  }
  return report;
}
