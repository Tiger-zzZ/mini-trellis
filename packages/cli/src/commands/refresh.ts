import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { AI_TOOLS, type AITool, type CliFlag } from "../types/ai-tools.js";
import {
  collectPlatformTemplates,
  getConfiguredPlatforms,
  resolvePlatformOptions,
} from "../configurators/index.js";
import {
  renderTemplateMap,
  type PlatformConfigureOptions,
} from "../configurators/shared.js";
import {
  mergeCodeBuddySettings,
  readCodeBuddySettingsIssue,
} from "../utils/codebuddy-settings.js";
import {
  openCodeSwitchFiles,
  cleanupOpenCodeEntryDirectory,
} from "../utils/opencode-version.js";
import { ManagedAssetConflict } from "../utils/managed-path-safety.js";
import { RETIRED_SCRIPT_MODULES } from "./migrate.js";
import { collectTrellisScriptTemplates } from "../templates/extract.js";
import { PATHS } from "../constants/paths.js";
import { agentsMdContent } from "../templates/markdown/index.js";
import {
  mergeJsonFile,
  mergeJsonValues,
  mergeManagedBlock,
} from "../utils/managed-merge.js";
import {
  hashContent,
  hashFile,
  readManifest,
  updateManifestForTemplates,
} from "../utils/managed-manifest.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import { readCursorHooksConfigIssue } from "../utils/cursor-hooks-config.js";
import {
  readZCodeConfigIssue,
  mergeZCodeConfig,
} from "../utils/zcode-config.js";

export type RefreshAction =
  | "add"
  | "update"
  | "merge"
  | "remove"
  | "unchanged"
  | "conflict";

export interface RefreshItem {
  path: string;
  action: RefreshAction;
  detail: string;
}

export interface RefreshReport {
  ok: boolean;
  platforms: AITool[];
  items: RefreshItem[];
  opencodeVersion?: "1" | "2";
}

const JSON_PATHS = new Set([
  ".claude/settings.json",
  ".codex/hooks.json",
  ".cursor/hooks.json",
  ".pi/settings.json",
  ".codebuddy/settings.json",
  ".zcode/config.json",
  ".opencode/package.json",
]);

function executableFor(relative: string): boolean {
  return relative.endsWith(".py") || relative.endsWith(".sh");
}

function renderedJsonMerge(
  relative: string,
  filePath: string,
  content: string,
): "merge" | "unchanged" | "conflict" {
  if (!fs.existsSync(filePath)) return "merge";
  try {
    const existing = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const desired = JSON.parse(content) as unknown;
    const merge =
      relative === ".codebuddy/settings.json"
        ? mergeCodeBuddySettings
        : relative === ".zcode/config.json"
          ? mergeZCodeConfig
          : mergeJsonValues;
    const merged = `${JSON.stringify(merge(existing, desired), null, 2)}\n`;
    return merged === fs.readFileSync(filePath, "utf8") ? "unchanged" : "merge";
  } catch {
    return "conflict";
  }
}

function addPlatformTemplates(
  target: Map<string, string>,
  platforms: AITool[],
  options: PlatformConfigureOptions,
): void {
  for (const platform of platforms) {
    const templates = collectPlatformTemplates(platform, options);
    if (!templates) continue;
    for (const [relative, content] of renderTemplateMap(templates)) {
      target.set(relative, content);
    }
  }
}

export function resolveRefreshPlatforms(
  cwd: string,
  options: Partial<Record<CliFlag, boolean>>,
): AITool[] {
  const selected = (Object.keys(AI_TOOLS) as AITool[]).filter(
    (platform) => options[AI_TOOLS[platform].cliFlag],
  );
  return selected.length > 0 ? selected : [...getConfiguredPlatforms(cwd)];
}

export function buildRefreshPlan(
  cwd: string,
  platforms: AITool[],
  options: { opencodeVersion?: unknown } = {},
): RefreshReport {
  let context: PlatformConfigureOptions;
  try {
    context = resolvePlatformOptions(cwd, platforms, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      platforms,
      items: [
        {
          path:
            error instanceof ManagedAssetConflict
              ? error.relativePath
              : detail.startsWith(".codebuddy/settings.json")
                ? ".codebuddy/settings.json"
                : ".opencode",
          action: "conflict",
          detail,
        },
      ],
    };
  }
  const templates = collectTrellisScriptTemplates();
  addPlatformTemplates(templates, platforms, context);
  const manifest = readManifest(cwd);
  const items: RefreshItem[] = [];

  for (const [relative, content] of templates) {
    const filePath = path.join(cwd, ...relative.split("/"));
    if (!fs.existsSync(filePath)) {
      items.push({
        path: relative,
        action: "add",
        detail: "missing managed asset",
      });
      continue;
    }
    if (JSON_PATHS.has(relative)) {
      if (relative === ".cursor/hooks.json") {
        const issue = readCursorHooksConfigIssue(filePath);
        if (issue) {
          items.push({ path: relative, action: "conflict", detail: issue });
          continue;
        }
      }
      if (relative === ".codebuddy/settings.json") {
        const issue = readCodeBuddySettingsIssue(filePath);
        if (issue) {
          items.push({ path: relative, action: "conflict", detail: issue });
          continue;
        }
      }
      if (relative === ".zcode/config.json") {
        const issue = readZCodeConfigIssue(filePath);
        if (issue) {
          items.push({ path: relative, action: "conflict", detail: issue });
          continue;
        }
      }
      const action = renderedJsonMerge(relative, filePath, content);
      items.push({
        path: relative,
        action,
        detail:
          action === "conflict"
            ? "existing file is not valid JSON"
            : "merge mini-trellis entries",
      });
      continue;
    }
    const actual = hashFile(filePath);
    if (actual === hashContent(content)) {
      items.push({
        path: relative,
        action: "unchanged",
        detail: "already current",
      });
    } else if (actual && manifest.files[relative] === actual) {
      items.push({
        path: relative,
        action: "update",
        detail: "managed file changed in the new template",
      });
    } else {
      items.push({
        path: relative,
        action: "conflict",
        detail: "local changes kept; refresh skipped",
      });
    }
  }

  if (context.opencodeVersion) {
    for (const relative of openCodeSwitchFiles(
      cwd,
      context.opencodeVersion,
      renderTemplateMap(
        collectPlatformTemplates("opencode", context) ?? new Map(),
      ),
    )) {
      items.push({
        path: relative,
        action: "remove",
        detail: `retire managed entry when switching to OpenCode V${context.opencodeVersion}`,
      });
    }
  }

  for (const name of RETIRED_SCRIPT_MODULES) {
    const relative = `${PATHS.SCRIPTS}/common/${name}`;
    if (fs.existsSync(path.join(cwd, relative))) {
      items.push({
        path: relative,
        action: "remove",
        detail: "retired task-engine module",
      });
    }
  }

  const agentsPath = path.join(cwd, "AGENTS.md");
  const existingAgents = fs.existsSync(agentsPath)
    ? fs.readFileSync(agentsPath, "utf8")
    : "";
  const mergedAgents = mergeManagedBlock(
    existingAgents,
    agentsMdContent,
    "<!-- TRELLIS:START -->",
    "<!-- TRELLIS:END -->",
  );
  items.push({
    path: "AGENTS.md",
    action: mergedAgents === existingAgents ? "unchanged" : "merge",
    detail: "update only the mini-trellis managed block",
  });

  return {
    ok: items.every((item) => item.action !== "conflict"),
    platforms,
    items,
    ...(context.opencodeVersion
      ? { opencodeVersion: context.opencodeVersion }
      : {}),
  };
}

function applyRefresh(cwd: string, report: RefreshReport): void {
  const templates = collectTrellisScriptTemplates();
  addPlatformTemplates(templates, report.platforms, {
    opencodeVersion: report.opencodeVersion,
  });
  for (const item of report.items) {
    const filePath = path.join(cwd, ...item.path.split("/"));
    const content = templates.get(item.path);
    if (item.path === "AGENTS.md") {
      const existing = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, "utf8")
        : "";
      const merged = mergeManagedBlock(
        existing,
        agentsMdContent,
        "<!-- TRELLIS:START -->",
        "<!-- TRELLIS:END -->",
      );
      if (merged !== existing) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileAtomic(filePath, merged);
      }
      continue;
    }
    if (item.action === "remove") {
      fs.rmSync(filePath, { force: true });
      cleanupOpenCodeEntryDirectory(cwd, item.path);
      continue;
    }
    if (!content || item.action === "unchanged" || item.action === "conflict")
      continue;
    if (JSON_PATHS.has(item.path)) {
      mergeJsonFile(
        filePath,
        content,
        item.path === ".codebuddy/settings.json"
          ? mergeCodeBuddySettings
          : item.path === ".zcode/config.json"
            ? mergeZCodeConfig
            : undefined,
      );
      continue;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, content);
    if (executableFor(item.path)) fs.chmodSync(filePath, 0o755);
  }
  updateManifestForTemplates(
    cwd,
    templates,
    report.items
      .filter((item) => item.action === "remove")
      .map((item) => item.path),
  );
}

export function runRefresh(
  options: {
    cwd?: string;
    dryRun?: boolean;
    json?: boolean;
    claude?: boolean;
    codex?: boolean;
    opencode?: boolean;
    pi?: boolean;
    dsh?: boolean;
    cursor?: boolean;
    codebuddy?: boolean;
    zcode?: boolean;
    opencodeVersion?: string;
  } = {},
): RefreshReport {
  const cwd = options.cwd ?? process.cwd();
  const platforms = resolveRefreshPlatforms(cwd, options);
  const report = buildRefreshPlan(cwd, platforms, options);
  if (!options.dryRun && report.ok) applyRefresh(cwd, report);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.bold("mini-trellis refresh\n"));
    if (platforms.length === 0)
      console.log(chalk.yellow("No configured platforms found."));
    for (const item of report.items) {
      const symbol =
        item.action === "unchanged"
          ? "="
          : item.action === "conflict"
            ? "!"
            : item.action === "add"
              ? "+"
              : item.action === "remove"
                ? "-"
                : "~";
      const color =
        item.action === "conflict"
          ? chalk.yellow
          : item.action === "unchanged"
            ? chalk.gray
            : chalk.green;
      console.log(`${color(symbol)} ${item.path} — ${item.detail}`);
    }
    console.log();
    if (options.dryRun) console.log(chalk.gray("Dry run: no files changed."));
    else if (report.ok) console.log(chalk.green("Refresh complete."));
    else
      console.log(
        chalk.yellow("Refresh stopped at conflicts; local changes were kept."),
      );
  }
  return report;
}
