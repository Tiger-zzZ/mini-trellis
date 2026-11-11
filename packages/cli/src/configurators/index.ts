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
import { collectOpenCodeTemplates, configureOpenCode } from "./opencode.js";
import { collectCodexTemplates, configureCodex } from "./codex.js";
import { collectPiTemplates } from "./pi.js";
import { collectDshTemplates } from "./dsh.js";
import { collectCursorTemplates } from "./cursor.js";
import { collectCodeBuddyTemplates } from "./codebuddy.js";
import { collectKiroTemplates } from "./kiro.js";
import { collectZCodeTemplates } from "./zcode.js";

import {
  writeTemplateMap,
  renderTemplateMap,
  assertProjectTemplatePaths,
  type PlatformConfigureOptions,
} from "./shared.js";
import {
  openCodeSwitchFiles,
  parseOpenCodeVersion,
  resolveOpenCodeVersion,
} from "../utils/opencode-version.js";
import { readKiroHooksIssue } from "../utils/kiro-hooks.js";
import { readCodeBuddySettingsIssue } from "../utils/codebuddy-settings.js";
import { readZCodeConfigIssue } from "../utils/zcode-config.js";
import { ManagedAssetConflict } from "../utils/managed-path-safety.js";

interface PlatformFunctions {
  configure: (cwd: string, options?: PlatformConfigureOptions) => Promise<void>;
  collectTemplates?: (
    options?: PlatformConfigureOptions,
  ) => Map<string, string>;
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
  opencode: {
    configure: configureOpenCode,
    collectTemplates: collectOpenCodeTemplates,
  },
  codex: { configure: configureCodex, collectTemplates: collectCodexTemplates },
  pi: fromTemplates(collectPiTemplates),
  dsh: fromTemplates(collectDshTemplates),
  cursor: fromTemplates(collectCursorTemplates),
  codebuddy: fromTemplates(collectCodeBuddyTemplates),
  zcode: fromTemplates(collectZCodeTemplates),
  kiro: fromTemplates(collectKiroTemplates),
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
  opencode: [
    ".opencode/plugins/session-start.js",
    ".opencode/plugins/mini-trellis/index.js",
  ],
  pi: [".pi/extensions/mini-trellis/index.ts", ".pi/settings.json"],
  dsh: [".dsh/skills/mini-trellis-remember/SKILL.md"],
  cursor: [".cursor/hooks.json", ".cursor/hooks/session-start.py"],
  codebuddy: [
    ".codebuddy/settings.json",
    ".codebuddy/hooks/session-start.py",
    ".codebuddy/commands/mini-trellis/remember.md",
  ],
  kiro: [
    ".kiro/hooks/mini-trellis.json",
    ".kiro/hooks/session-start.py",
    ".kiro/skills/mini-trellis-remember/SKILL.md",
  ],
  zcode: [
    ".zcode/config.json",
    ".zcode/hooks/session-start.py",
    // Shared .agents skills alone cannot identify the host; detect local conflicts too.
    ".zcode/skills/mini-trellis-remember/SKILL.md",
  ],
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
  options?: PlatformConfigureOptions,
): Map<string, string> | undefined {
  return PLATFORM_FUNCTIONS[platformId].collectTemplates?.(options);
}

/** Resolve once before any project writes; reuse for preview, install and manifest. */
export function resolvePlatformOptions(
  cwd: string,
  platforms: readonly AITool[],
  options: { opencodeVersion?: unknown } = {},
): PlatformConfigureOptions {
  const explicit = parseOpenCodeVersion(options.opencodeVersion);
  if (explicit && !platforms.includes("opencode"))
    throw new Error("--opencode-version requires selecting OpenCode");
  const resolved: PlatformConfigureOptions = {};
  if (platforms.includes("opencode")) {
    resolved.opencodeVersion = resolveOpenCodeVersion(cwd, explicit);
    const templates = renderTemplateMap(collectOpenCodeTemplates(resolved));
    assertProjectTemplatePaths(cwd, templates);
    openCodeSwitchFiles(cwd, resolved.opencodeVersion, templates);
  }
  const settings = path.join(cwd, ".codebuddy/settings.json");
  if (platforms.includes("codebuddy"))
    assertProjectTemplatePaths(cwd, collectCodeBuddyTemplates());
  if (platforms.includes("codebuddy") && fs.existsSync(settings)) {
    const issue = readCodeBuddySettingsIssue(settings);
    if (issue)
      throw new Error(
        `.codebuddy/settings.json: ${issue}; no CodeBuddy assets changed`,
      );
  }
  if (platforms.includes("zcode")) {
    assertProjectTemplatePaths(cwd, collectZCodeTemplates());
    const config = path.join(cwd, ".zcode/config.json");
    const issue = fs.existsSync(config) ? readZCodeConfigIssue(config) : null;
    if (issue) throw new ManagedAssetConflict(".zcode/config.json", issue);
  }
  if (platforms.includes("kiro")) {
    assertProjectTemplatePaths(cwd, collectKiroTemplates());
    const config = path.join(cwd, ".kiro/hooks/mini-trellis.json");
    const issue = fs.existsSync(config) ? readKiroHooksIssue(config) : null;
    if (issue)
      throw new ManagedAssetConflict(".kiro/hooks/mini-trellis.json", issue);
  }
  return resolved;
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
