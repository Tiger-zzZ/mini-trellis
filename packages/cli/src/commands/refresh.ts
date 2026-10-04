import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { AI_TOOLS, type AITool } from "../types/ai-tools.js";
import {
  collectPlatformTemplates,
  getConfiguredPlatforms,
} from "../configurators/index.js";
import { renderTemplateMap } from "../configurators/shared.js";
import { collectTrellisScriptTemplates } from "../templates/extract.js";
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

export type RefreshAction =
  | "add"
  | "update"
  | "merge"
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
}

const JSON_PATHS = new Set([
  ".claude/settings.json",
  ".codex/hooks.json",
  ".pi/settings.json",
]);

function executableFor(relative: string): boolean {
  return relative.endsWith(".py") || relative.endsWith(".sh");
}

function renderedJsonMerge(
  filePath: string,
  content: string,
): "merge" | "unchanged" | "conflict" {
  if (!fs.existsSync(filePath)) return "merge";
  try {
    const existing = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const desired = JSON.parse(content) as unknown;
    const merged = `${JSON.stringify(mergeJsonValues(existing, desired), null, 2)}\n`;
    return merged === fs.readFileSync(filePath, "utf8") ? "unchanged" : "merge";
  } catch {
    return "conflict";
  }
}

function addPlatformTemplates(
  target: Map<string, string>,
  platforms: AITool[],
): void {
  for (const platform of platforms) {
    const templates = collectPlatformTemplates(platform);
    if (!templates) continue;
    for (const [relative, content] of renderTemplateMap(templates)) {
      target.set(relative, content);
    }
  }
}

export function resolveRefreshPlatforms(
  cwd: string,
  options: Partial<Record<"claude" | "codex" | "opencode" | "pi", boolean>>,
): AITool[] {
  const selected = (Object.keys(AI_TOOLS) as AITool[]).filter(
    (platform) => options[AI_TOOLS[platform].cliFlag],
  );
  return selected.length > 0 ? selected : [...getConfiguredPlatforms(cwd)];
}

export function buildRefreshPlan(
  cwd: string,
  platforms: AITool[],
): RefreshReport {
  const templates = collectTrellisScriptTemplates();
  addPlatformTemplates(templates, platforms);
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
      const action = renderedJsonMerge(filePath, content);
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
  };
}

function applyRefresh(cwd: string, report: RefreshReport): void {
  const templates = collectTrellisScriptTemplates();
  addPlatformTemplates(templates, report.platforms);
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
    if (!content || item.action === "unchanged" || item.action === "conflict")
      continue;
    if (JSON_PATHS.has(item.path)) {
      mergeJsonFile(filePath, content);
      continue;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, content);
    if (executableFor(item.path)) fs.chmodSync(filePath, 0o755);
  }
  updateManifestForTemplates(cwd, templates);
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
  } = {},
): RefreshReport {
  const cwd = options.cwd ?? process.cwd();
  const platforms = resolveRefreshPlatforms(cwd, options);
  const report = buildRefreshPlan(cwd, platforms);
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
