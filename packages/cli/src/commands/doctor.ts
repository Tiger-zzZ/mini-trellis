import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { AI_TOOLS, type AITool } from "../types/ai-tools.js";
import { getConfiguredPlatforms } from "../configurators/index.js";

export type DoctorLevel = "ok" | "warn" | "error" | "unknown";

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

const TRIGGER_MARKERS: Record<AITool, [string, string]> = {
  "claude-code": [".claude/hooks/session-start.py", "additional_context"],
  codex: [".codex/hooks/session-start.py", "additional_context"],
  opencode: [".opencode/plugins/session-start.js", "messages.transform"],
  pi: [".pi/extensions/mini-trellis/index.ts", "before_agent_start"],
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
    if (complete) {
      const [triggerPath, marker] = TRIGGER_MARKERS[platform];
      let triggerLevel: DoctorLevel = "unknown";
      let triggerDetail = "host delivery is unknown until a real session runs";
      try {
        const content = fs.readFileSync(path.join(cwd, triggerPath), "utf8");
        if (content.includes(marker)) {
          triggerLevel = "ok";
          triggerDetail = `trigger asset contains ${marker}`;
        } else {
          triggerLevel = "warn";
          triggerDetail = `trigger asset does not contain ${marker}`;
        }
      } catch {
        triggerLevel = "warn";
        triggerDetail = "trigger asset could not be read";
      }
      checks.push({
        level: triggerLevel,
        name: `${platform}-trigger`,
        detail: triggerDetail,
      });
      checks.push({
        level: "unknown",
        name: `${platform}-runtime`,
        detail:
          "run one real host session to confirm the hook reaches the model",
      });
    }
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
