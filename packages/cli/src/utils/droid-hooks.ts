import fs from "node:fs";
import {
  commandMatchesDeletedPath,
  scrubHooksJson,
  type ScrubResult,
} from "./uninstall-scrubbers.js";

/** Droid's standalone hook file: keyed directly by event name, no `hooks` wrapper. */
export const DROID_HOOKS_PATH = ".factory/hooks.json";
export const DROID_SESSION_HOOK = ".factory/hooks/session-start.py";
/** Trellis registered its Droid hooks here; Droid still reads this file. */
export const DROID_SETTINGS_PATH = ".factory/settings.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate the structure we merge. `hooksDisabled` is Droid's top-level
 * switch; any other key must be an event with matcher groups. JSONC comments
 * are accepted by Droid but not by this parser, so such a file is reported
 * and left unchanged.
 */
export function readDroidHooksIssue(
  filePath: string,
  requireRegistration = false,
): string | null {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return "Droid hooks could not be read as JSON (comments are not supported here)";
  }
  if (!isObject(value)) return "Droid hooks must be a JSON object";
  for (const [event, groups] of Object.entries(value)) {
    if (event === "hooksDisabled") {
      if (typeof groups !== "boolean")
        return "Droid hooksDisabled must be a boolean";
      continue;
    }
    if (!Array.isArray(groups)) return `Droid ${event} must be an array`;
    for (const group of groups) {
      if (
        !isObject(group) ||
        !Array.isArray(group.hooks) ||
        (group.matcher !== undefined && typeof group.matcher !== "string")
      )
        return `Droid ${event} requires matcher groups with a hooks array`;
      for (const hook of group.hooks) {
        if (
          !isObject(hook) ||
          typeof hook.type !== "string" ||
          !hook.type.trim() ||
          (hook.type === "command" &&
            (typeof hook.command !== "string" || !hook.command.trim()))
        )
          return `Droid ${event} contains an invalid hook definition`;
      }
    }
  }
  if (requireRegistration && !droidSessionStartRegistered(value))
    return "mini-trellis SessionStart is not registered; run mini-trellis refresh --droid";
  return null;
}

function droidSessionStartRegistered(value: Record<string, unknown>): boolean {
  const groups = value.SessionStart;
  if (!Array.isArray(groups)) return false;
  return groups.some(
    (group) =>
      isObject(group) &&
      Array.isArray(group.hooks) &&
      group.hooks.some(
        (hook) =>
          isObject(hook) &&
          hook.type === "command" &&
          typeof hook.command === "string" &&
          commandMatchesDeletedPath(hook.command, [DROID_SESSION_HOOK]),
      ),
  );
}

function matcherCovers(matcher: unknown, source: string): boolean {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(source);
  } catch {
    return false;
  }
}

/**
 * Add the managed command unless a group already runs it for every source the
 * managed matcher lists (`startup|resume|clear|compact`), so a user who moved
 * the command into their own group does not get a duplicate.
 */
export function mergeDroidHooks(existing: unknown, desired: unknown): unknown {
  if (!isObject(existing) || !isObject(desired)) return existing;
  const merged: Record<string, unknown> = { ...existing };
  for (const [event, wanted] of Object.entries(desired)) {
    if (!Array.isArray(wanted)) continue;
    const groups = Array.isArray(merged[event])
      ? [...(merged[event] as unknown[])]
      : [];
    for (const group of wanted as Record<string, unknown>[]) {
      const sources =
        typeof group.matcher === "string" ? group.matcher.split("|") : ["*"];
      const missing = (group.hooks as Record<string, unknown>[]).filter(
        (hook) =>
          !sources.every((source) =>
            groups.some(
              (candidate) =>
                isObject(candidate) &&
                matcherCovers(candidate.matcher, source) &&
                Array.isArray(candidate.hooks) &&
                candidate.hooks.some(
                  (present: unknown) =>
                    isObject(present) &&
                    present.type === hook.type &&
                    present.command === hook.command,
                ),
            ),
          ),
      );
      if (missing.length) groups.push({ ...group, hooks: missing });
    }
    merged[event] = groups;
  }
  return merged;
}

export function scrubDroidHooks(
  content: string,
  deletedPaths: readonly string[],
): ScrubResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { content, fullyEmpty: false };
  }
  if (!isObject(parsed)) return { content, fullyEmpty: false };
  const wrapped = scrubHooksJson(
    JSON.stringify({ hooks: parsed }),
    deletedPaths,
    "nested",
  );
  const events =
    (JSON.parse(wrapped.content) as { hooks?: Record<string, unknown> })
      .hooks ?? {};
  const rendered = `${JSON.stringify(events, null, 2)}\n`;
  if (JSON.stringify(events) === JSON.stringify(parsed))
    return { content, fullyEmpty: false };
  return { content: rendered, fullyEmpty: Object.keys(events).length === 0 };
}
