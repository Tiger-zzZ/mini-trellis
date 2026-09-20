/**
 * Platform Registry — mini-trellis v1: claude, codex, opencode, pi.
 */

import fs from "node:fs";
import path from "node:path";
import {
  AI_TOOLS,
  getManagedPaths,
  type AITool,
  type CliFlag,
} from "../types/ai-tools.js";

import { collectClaudeTemplates, configureClaude } from "./claude.js";
import { collectOpenCodeTemplates } from "./opencode.js";
import { collectCodexTemplates, configureCodex } from "./codex.js";
import { collectPiTemplates } from "./pi.js";

import { writeTemplateMap, type PlatformConfigureOptions } from "./shared.js";

interface PlatformFunctions {
  configure: (cwd: string, options?: PlatformConfigureOptions) => Promise<void>;
  collectTemplates?: () => Map<string, string>;
}

function fromTemplates(
  collectTemplates: () => Map<string, string>,
): PlatformFunctions {
  return {
    configure: (cwd) => writeTemplateMap(cwd, collectTemplates()),
    collectTemplates,
  };
}

const PLATFORM_FUNCTIONS: Record<AITool, PlatformFunctions> = {
  "claude-code": {
    configure: configureClaude,
    collectTemplates: collectClaudeTemplates,
  },
  opencode: fromTemplates(collectOpenCodeTemplates),
  codex: { configure: configureCodex, collectTemplates: collectCodexTemplates },
  pi: fromTemplates(collectPiTemplates),
};

export const PLATFORM_IDS = Object.keys(AI_TOOLS) as AITool[];

export const CONFIG_DIRS = PLATFORM_IDS.map((id) => AI_TOOLS[id].configDir);

export const PLATFORM_MANAGED_DIRS = PLATFORM_IDS.flatMap((id) =>
  getManagedPaths(id),
);

export const ALL_MANAGED_DIRS = [".trellis", ...new Set(PLATFORM_MANAGED_DIRS)];

const DETECT_FILES: Record<AITool, string[]> = {
  "claude-code": [
    ".claude/hooks/session-start.py",
    ".claude/commands/mini-trellis/remember.md",
  ],
  codex: [".codex/hooks.json", ".codex/hooks/session-start.py"],
  opencode: [".opencode/plugins/session-start.js"],
  pi: [".pi/extensions/mini-trellis/index.ts", ".pi/settings.json"],
};

export function getConfiguredPlatforms(cwd: string): Set<AITool> {
  const platforms = new Set<AITool>();
  for (const id of PLATFORM_IDS) {
    const hits = DETECT_FILES[id];
    if (hits.some((rel) => fs.existsSync(path.join(cwd, rel)))) {
      platforms.add(id);
    }
  }
  return platforms;
}

export function getPlatformsWithPythonHooks(): AITool[] {
  return PLATFORM_IDS.filter((id) => AI_TOOLS[id].hasPythonHooks);
}

export function isManagedPath(dirPath: string): boolean {
  const normalized = dirPath.replace(/\\/g, "/");
  return ALL_MANAGED_DIRS.some(
    (d) => normalized.startsWith(d + "/") || normalized === d,
  );
}

export function isManagedRootDir(dirName: string): boolean {
  return ALL_MANAGED_DIRS.includes(dirName);
}

export function getPlatformManagedPaths(platformId: AITool): string[] {
  return getManagedPaths(platformId);
}

export function configurePlatform(
  platformId: AITool,
  cwd: string,
  options?: PlatformConfigureOptions,
): Promise<void> {
  return PLATFORM_FUNCTIONS[platformId].configure(cwd, options);
}

export function collectPlatformTemplates(
  platformId: AITool,
): Map<string, string> | undefined {
  return PLATFORM_FUNCTIONS[platformId].collectTemplates?.();
}

export function getInitToolChoices(): {
  key: CliFlag;
  name: string;
  defaultChecked: boolean;
  platformId: AITool;
}[] {
  return PLATFORM_IDS.map((id) => ({
    key: AI_TOOLS[id].cliFlag,
    name: AI_TOOLS[id].name,
    defaultChecked: AI_TOOLS[id].defaultChecked,
    platformId: id,
  }));
}

export function resolveCliFlag(flag: string): AITool | undefined {
  return PLATFORM_IDS.find((id) => AI_TOOLS[id].cliFlag === flag);
}
