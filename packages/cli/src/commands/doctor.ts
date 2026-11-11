import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { readKiroHooksIssue } from "../utils/kiro-hooks.js";
import { AI_TOOLS, type AITool } from "../types/ai-tools.js";
import { getConfiguredPlatforms } from "../configurators/index.js";
import { needsTrellisMigration } from "./migrate.js";
import { readCursorHooksConfigIssue } from "../utils/cursor-hooks-config.js";
import { readCodeBuddySettingsIssue } from "../utils/codebuddy-settings.js";
import {
  readZCodeConfigIssue,
  zcodeHookReferencesPaths,
  findZCodeSkillConflict,
} from "../utils/zcode-config.js";
import {
  detectOpenCodeVersion,
  installedOpenCodeVersions,
  OPENCODE_ENTRIES,
} from "../utils/opencode-version.js";

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

interface RuntimeStatus {
  schema?: number;
  platform?: string;
  last_hook_at?: string;
  last_status?: string;
  last_output_chars?: number;
  last_error_category?: string;
}

interface RecordingStatus {
  schema: number;
  last_write_at: string;
  last_status: "ok" | "error";
  last_exit_code: number;
}

function recordingCheck(cwd: string): DoctorCheck {
  const name = "recording-runtime";
  const file = path.join(cwd, ".trellis/.runtime/writes/latest.json");
  if (!fs.existsSync(file)) {
    return {
      name,
      level: "unknown",
      detail: "no add_session.py outcome observed",
    };
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as RecordingStatus;
    if (
      value?.schema !== 1 ||
      typeof value.last_write_at !== "string" ||
      !Number.isFinite(Date.parse(value.last_write_at)) ||
      !Number.isInteger(value.last_exit_code) ||
      value.last_exit_code < 0 ||
      !["ok", "error"].includes(value.last_status) ||
      (value.last_status === "ok") !== (value.last_exit_code === 0)
    )
      throw new Error("invalid metadata");
    return {
      name,
      level: value.last_status === "ok" ? "ok" : "warn",
      detail:
        `last add_session.py ${value.last_status} at ${value.last_write_at}; exit ${value.last_exit_code}` +
        (value.last_status === "error"
          ? "; recording-failed (a partial checkpoint may exist; inspect the command error before retrying)"
          : " (does not verify direct spec/research edits)"),
    };
  } catch {
    return {
      name,
      level: "warn",
      detail: "recording metadata is unreadable or invalid; outcome unknown",
    };
  }
}

const PLATFORM_CHECKS: Record<AITool, string[]> = {
  "claude-code": [".claude/hooks/session-start.py", ".claude/settings.json"],
  codex: [".codex/hooks/session-start.py", ".codex/hooks.json"],
  opencode: [".opencode/plugins/session-start.js"],
  pi: [".pi/extensions/mini-trellis/index.ts", ".pi/settings.json"],
  omp: [
    ".omp/extensions/mini-trellis/index.ts",
    ".omp/prompts/mini-trellis-remember.md",
    ".omp/skills/mini-trellis-session-insight/SKILL.md",
    ".omp/skills/mini-trellis-update-spec/SKILL.md",
  ],
  dsh: [
    ".dsh/skills/mini-trellis-session-insight/SKILL.md",
    ".dsh/skills/mini-trellis-remember/SKILL.md",
  ],
  cursor: [".cursor/hooks/session-start.py", ".cursor/hooks.json"],
  codebuddy: [
    ".codebuddy/hooks/session-start.py",
    ".codebuddy/settings.json",
    ".codebuddy/commands/mini-trellis/remember.md",
    ".codebuddy/skills/mini-trellis-remember/SKILL.md",
  ],
  kiro: [
    ".kiro/hooks/mini-trellis.json",
    ".kiro/hooks/session-start.py",
    ".kiro/skills/mini-trellis-remember/SKILL.md",
    ".kiro/skills/mini-trellis-update-spec/SKILL.md",
    ".kiro/skills/mini-trellis-session-insight/SKILL.md",
  ],
  zcode: [
    ".zcode/config.json",
    ".zcode/hooks/session-start.py",
    ".agents/skills/mini-trellis-remember/SKILL.md",
    ".agents/skills/mini-trellis-session-insight/SKILL.md",
    ".agents/skills/mini-trellis-update-spec/SKILL.md",
  ],
};

const TRIGGER_MARKERS: Record<AITool, [string, string]> = {
  "claude-code": [".claude/hooks/session-start.py", "additional_context"],
  codex: [".codex/hooks/session-start.py", "additional_context"],
  opencode: [".opencode/plugins/session-start.js", "messages.transform"],
  pi: [".pi/extensions/mini-trellis/index.ts", "before_agent_start"],
  omp: [".omp/extensions/mini-trellis/index.ts", "before_agent_start"],
  dsh: [
    ".dsh/skills/mini-trellis-session-insight/SKILL.md",
    "no project SessionStart",
  ],
  cursor: [".cursor/hooks/session-start.py", "additional_context"],
  codebuddy: [".codebuddy/hooks/session-start.py", "additionalContext"],
  zcode: [".zcode/hooks/session-start.py", "additionalContext"],
  kiro: [".kiro/hooks/session-start.py", "print(context_text"],
};

export function buildDoctorReport(cwd: string): DoctorReport {
  if (needsTrellisMigration(cwd)) {
    return {
      ok: false,
      checks: [
        {
          level: "error",
          name: "legacy-trellis",
          detail:
            "Trellis workflow detected; run mini-trellis migrate --dry-run",
        },
      ],
      platforms: [...getConfiguredPlatforms(cwd)],
    };
  }
  const checks: DoctorCheck[] = [];
  const exists = (relative: string): boolean =>
    fs.existsSync(path.join(cwd, relative));

  const runtimeStatus = (platform: AITool): RuntimeStatus | null => {
    const file = path.join(
      cwd,
      ".trellis",
      ".runtime",
      "hooks",
      `${platform}.json`,
    );
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8")) as RuntimeStatus;
      return value?.schema === 1 &&
        typeof value.last_status === "string" &&
        typeof value.last_hook_at === "string" &&
        Number.isFinite(Date.parse(value.last_hook_at)) &&
        Number.isInteger(value.last_output_chars) &&
        (value.last_output_chars ?? -1) >= 0
        ? value
        : null;
    } catch {
      return null;
    }
  };

  const workflowReady =
    exists(".trellis") && exists(".trellis/scripts/add_session.py");
  checks.push({
    level: workflowReady ? "ok" : "error",
    name: "memory-layer",
    detail: workflowReady
      ? ".trellis and add_session.py are present"
      : "missing .trellis or .trellis/scripts/add_session.py; run mini-trellis init",
  });
  checks.push(recordingCheck(cwd));

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
  const openCodeVersions = installedOpenCodeVersions(cwd);
  if (openCodeVersions.length > 1)
    checks.push({
      level: "error",
      name: "opencode-protocol",
      detail:
        "Both V1 and V2 plugins are active; resolve the duplicate entry before refreshing",
    });
  else if (openCodeVersions[0]) {
    const installed = openCodeVersions[0];
    const binary = detectOpenCodeVersion();
    checks.push({
      name: "opencode-protocol",
      level: binary && binary !== installed ? "warn" : "ok",
      detail:
        binary && binary !== installed
          ? `Installed V${installed} plugin differs from local OpenCode V${binary}; use mini-trellis refresh --opencode --opencode-version ${binary} --dry-run to review a switch`
          : `Installed V${installed} plugin; ordinary refresh preserves this protocol${binary ? "" : "; local OpenCode version unavailable"}`,
    });
  }
  for (const platform of Object.keys(AI_TOOLS) as AITool[]) {
    if (platform === "zcode") {
      if (!platforms.includes("zcode")) continue;
      const conflict = findZCodeSkillConflict(cwd, PLATFORM_CHECKS.zcode);
      if (conflict)
        checks.push({
          name: "zcode-skills",
          level: "error",
          detail: `${conflict}: ZCode-local skill conflicts with the shared .agents destination; existing file was kept. Move or rename it before installation`,
        });
    }
    if (platform === "kiro" && exists(".kiro/hooks/mini-trellis.json")) {
      const issue = readKiroHooksIssue(
        path.join(cwd, ".kiro/hooks/mini-trellis.json"),
        true,
      );
      if (issue)
        checks.push({ name: "kiro-config", level: "error", detail: issue });
    }
    const openCodeVersion = openCodeVersions[0] ?? "1";
    const files =
      platform === "opencode"
        ? [OPENCODE_ENTRIES[openCodeVersion]]
        : PLATFORM_CHECKS[platform];
    const present = files.filter(exists);
    if (present.length === 0) continue;
    const complete = present.length === files.length;
    checks.push({
      level: complete ? "ok" : "warn",
      name: platform,
      detail: complete
        ? platform === "dsh"
          ? "DeepSeek Harness skills are present"
          : `${AI_TOOLS[platform].name} hook and config are present`
        : `${AI_TOOLS[platform].name} is partially configured (${present.length}/${files.length} files)`,
    });
    if (platform === "codebuddy" && exists(".codebuddy/settings.json")) {
      const issue = readCodeBuddySettingsIssue(
        path.join(cwd, ".codebuddy/settings.json"),
        true,
      );
      if (issue)
        checks.push({
          name: "codebuddy-config",
          level: "error",
          detail: issue,
        });
    }
    if (platform === "zcode") {
      if (exists(".zcode/config.json")) {
        const file = path.join(cwd, ".zcode/config.json");
        const issue = readZCodeConfigIssue(file, true);
        if (issue)
          checks.push({ name: "zcode-config", level: "error", detail: issue });
        else {
          const config = JSON.parse(fs.readFileSync(file, "utf8")) as {
            hooks?: {
              enabled?: boolean;
              events?: { SessionStart?: { hooks: { enabled?: boolean }[] }[] };
            };
          };
          if (
            config.hooks?.enabled === false ||
            config.hooks?.events?.SessionStart?.some((group) =>
              group.hooks.some(
                (hook) =>
                  hook.enabled === false &&
                  zcodeHookReferencesPaths(hook, [
                    ".zcode/hooks/session-start.py",
                  ]),
              ),
            )
          )
            checks.push({
              name: "zcode-config",
              level: "warn",
              detail:
                "ZCode hooks or a SessionStart declaration is disabled; user choices were preserved",
            });
        }
      }
      checks.push({
        name: "zcode-trust",
        level: "unknown",
        detail:
          "project hook trust is owned by ZCode; in Desktop Settings > Hooks, select this project, or use standalone CLI `zcode hooks trust review --workspace . --json` and `zcode hooks trust status --workspace . --json`. Match the host's workspace path. Review before granting a digest; changed declarations may need new trust. Older builds may ignore project hooks. Skills and project knowledge do not require a user-level bridge",
      });
    }
    if (complete) {
      const [triggerPath, marker] =
        platform === "opencode" && openCodeVersion === "2"
          ? [OPENCODE_ENTRIES["2"], 'ctx.session.hook("context"']
          : TRIGGER_MARKERS[platform];
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
      if (platform === "dsh") continue;
      if (platform === "cursor") {
        const issue = readCursorHooksConfigIssue(
          path.join(cwd, ".cursor/hooks.json"),
          true,
        );
        if (issue) {
          checks.push({
            level: "warn",
            name: "cursor-config",
            detail: `.cursor/hooks.json: ${issue}; invalid configuration is kept`,
          });
        }
      }
      const runtime = runtimeStatus(platform);
      if (!runtime) {
        checks.push({
          level: "unknown",
          name: `${platform}-runtime`,
          detail:
            platform === "codex"
              ? "no real hook execution observed; ensure Codex trusts this project, then use /hooks to review/trust the project hook and start a new session"
              : platform === "cursor"
                ? "no real local hook execution observed; Cursor-managed cloud agents do not run sessionStart"
                : platform === "zcode"
                  ? "no hook execution observed; review/trust the project hook in ZCode, then start a new session. Config presence does not prove trust or model delivery"
                  : "no real hook execution observed; run one host session",
        });
      } else if (
        runtime.last_status === "ok" ||
        runtime.last_status === "deduped"
      ) {
        checks.push({
          level: "ok",
          name: `${platform}-runtime`,
          detail: `hook ${runtime.last_status} at ${runtime.last_hook_at ?? "unknown time"}; emitted ${runtime.last_output_chars ?? 0} chars (model delivery still requires real-session evidence)`,
        });
      } else {
        checks.push({
          level: "warn",
          name: `${platform}-runtime`,
          detail: `last hook ${runtime.last_status ?? "unknown"} at ${runtime.last_hook_at ?? "unknown time"}${runtime.last_error_category ? `; error ${runtime.last_error_category}` : ""}`,
        });
      }
    }
  }

  if (platforms.length === 0) {
    checks.push({
      level: "warn",
      name: "platforms",
      detail:
        "no host detected; choose --claude, --codex, --opencode, --pi, --omp, --dsh, --cursor, --codebuddy, --zcode, or --kiro",
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
        check.level === "ok"
          ? "✓"
          : check.level === "warn"
            ? "!"
            : check.level === "unknown"
              ? "?"
              : "✗";
      const color =
        check.level === "ok"
          ? chalk.green
          : check.level === "warn"
            ? chalk.yellow
            : check.level === "unknown"
              ? chalk.gray
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
