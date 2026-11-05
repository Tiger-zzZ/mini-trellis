import fs from "node:fs";
import { mergeJsonValues } from "./managed-merge.js";
import { commandMatchesDeletedPath } from "./uninstall-scrubbers.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate the structure we merge, while allowing unrelated settings/hook types. */
export function readCodeBuddySettingsIssue(
  filePath: string,
  requireRegistration = false,
): string | null {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return "CodeBuddy settings could not be read as JSON";
  }
  if (!isObject(value)) return "CodeBuddy settings must be a JSON object";
  if (value.hooks !== undefined && !isObject(value.hooks))
    return "CodeBuddy hooks must be an object";
  const hooks = value.hooks as Record<string, unknown> | undefined;
  for (const [event, groups] of Object.entries(hooks ?? {})) {
    if (!Array.isArray(groups))
      return `CodeBuddy hooks.${event} must be an array`;
    for (const group of groups) {
      if (
        !isObject(group) ||
        !Array.isArray(group.hooks) ||
        (group.matcher !== undefined && typeof group.matcher !== "string")
      ) {
        return `CodeBuddy hooks.${event} requires matcher groups with a hooks array`;
      }
      if (typeof group.matcher === "string" && group.matcher !== "*") {
        try {
          new RegExp(group.matcher);
        } catch {
          return `CodeBuddy hooks.${event} contains an invalid matcher`;
        }
      }
      for (const hook of group.hooks) {
        if (
          !isObject(hook) ||
          typeof hook.type !== "string" ||
          !hook.type.trim() ||
          (hook.type === "command" &&
            (typeof hook.command !== "string" || !hook.command.trim()))
        ) {
          return `CodeBuddy hooks.${event} contains an invalid hook definition`;
        }
      }
    }
  }
  if (requireRegistration) {
    const groups = (hooks?.SessionStart ?? []) as Record<string, unknown>[];
    if (
      !groups.some(
        (group) =>
          matches(group.matcher, "startup") &&
          (group.hooks as Record<string, unknown>[]).some(
            (hook) =>
              hook.type === "command" &&
              typeof hook.command === "string" &&
              commandMatchesDeletedPath(hook.command, [
                ".codebuddy/hooks/session-start.py",
              ]),
          ),
      )
    ) {
      return "mini-trellis SessionStart is not registered; run mini-trellis init --codebuddy";
    }
  }
  return null;
}

function matches(matcher: unknown, source: unknown): boolean {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string" || typeof source !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(source);
  } catch {
    return false;
  }
}

/** Avoid repeating a managed command when a user adds hooks to its matcher group. */
export function mergeCodeBuddySettings(
  existing: unknown,
  desired: unknown,
): unknown {
  if (!isObject(existing) || !isObject(desired))
    return mergeJsonValues(existing, desired);
  const merged = mergeJsonValues(existing, desired) as Record<string, unknown>;
  const hooks = isObject(existing.hooks) ? { ...existing.hooks } : {};
  for (const [event, wanted] of Object.entries(
    isObject(desired.hooks) ? desired.hooks : {},
  )) {
    if (!Array.isArray(wanted)) continue;
    const groups = Array.isArray(hooks[event])
      ? ([...hooks[event]] as Record<string, unknown>[])
      : [];
    for (const group of wanted as Record<string, unknown>[]) {
      const missing = (group.hooks as Record<string, unknown>[]).filter(
        (hook) =>
          !groups.some(
            (candidate) =>
              matches(candidate.matcher, group.matcher) &&
              Array.isArray(candidate.hooks) &&
              candidate.hooks.some(
                (present: unknown) =>
                  isObject(present) &&
                  present.type === hook.type &&
                  present.command === hook.command,
              ),
          ),
      );
      if (missing.length) groups.push({ ...group, hooks: missing });
    }
    hooks[event] = groups;
  }
  return { ...merged, hooks };
}
