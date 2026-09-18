/**
 * Shared hook templates — SessionStart only for mini-trellis v1.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

export interface HookScript {
  name: string;
  content: string;
}

export type SharedHookName = "session-start.py";

export type SharedHookPlatform = "claude" | "codex";

export const SHARED_HOOKS_BY_PLATFORM: Record<
  SharedHookPlatform,
  readonly SharedHookName[]
> = {
  claude: ["session-start.py"],
  codex: ["session-start.py"],
};

export function getSharedHookScripts(): HookScript[] {
  return readdirSync(__dirname)
    .filter((f) => f.endsWith(".py"))
    .sort()
    .map((file) => ({ name: file, content: readTemplate(file) }));
}

export function getSharedHookScriptsForPlatform(
  platform: SharedHookPlatform,
): HookScript[] {
  const allowed = new Set<string>(SHARED_HOOKS_BY_PLATFORM[platform]);
  return getSharedHookScripts().filter((h) => allowed.has(h.name));
}
