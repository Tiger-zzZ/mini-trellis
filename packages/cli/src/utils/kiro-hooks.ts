import fs from "node:fs";
import {
  commandMatchesDeletedPath,
  type ScrubResult,
} from "./uninstall-scrubbers.js";

interface Hook {
  name?: string;
  trigger?: string;
  action?: { type?: string; command?: string };
}
interface HookFile {
  version: string;
  hooks: Hook[];
  [key: string]: unknown;
}

function parse(content: string): HookFile {
  const value = JSON.parse(content) as HookFile | null;
  if (
    value?.version !== "v1" ||
    !Array.isArray(value.hooks) ||
    value.hooks.some((hook) => !hook || typeof hook !== "object")
  )
    throw new Error("expected a Kiro v1 hook file with a hooks array");
  return value;
}

export function readKiroHooksIssue(
  file: string,
  requireEntry = false,
): string | null {
  try {
    const value = parse(fs.readFileSync(file, "utf8"));
    if (
      requireEntry &&
      !value.hooks.some(
        (hook) =>
          hook.trigger === "SessionStart" &&
          hook.action?.type === "command" &&
          typeof hook.action.command === "string" &&
          commandMatchesDeletedPath(hook.action.command, [
            ".kiro/hooks/session-start.py",
          ]),
      )
    )
      return "mini-trellis SessionStart is not registered; run mini-trellis refresh --kiro";
    return null;
  } catch (error) {
    return `Could not read Kiro hooks: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function scrubKiroHooks(
  content: string,
  deletedPaths: readonly string[],
): ScrubResult {
  try {
    const value = parse(content);
    const hooks = value.hooks.filter(
      (hook) =>
        !(
          hook.action?.type === "command" &&
          typeof hook.action.command === "string" &&
          commandMatchesDeletedPath(hook.action.command, deletedPaths)
        ),
    );
    if (hooks.length === value.hooks.length)
      return { content, fullyEmpty: false };
    value.hooks = hooks;
    return {
      content: JSON.stringify(value, null, 2) + "\n",
      fullyEmpty:
        hooks.length === 0 &&
        Object.keys(value).every((key) => ["version", "hooks"].includes(key)),
    };
  } catch {
    return { content, fullyEmpty: false };
  }
}
