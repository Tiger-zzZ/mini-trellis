import fs from "node:fs";
import path from "node:path";
import { mergeJsonValues } from "./managed-merge.js";
import {
  commandMatchesDeletedPath,
  type ScrubResult,
} from "./uninstall-scrubbers.js";

const EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
]);
const SOURCES = ["startup", "clear", "compact"];
const SESSION_HOOK = ".zcode/hooks/session-start.py";

/** ZCode retains same-name paths; do not add a second discoverable copy. */
export function findZCodeSkillConflict(
  cwd: string,
  paths: Iterable<string>,
): string | null {
  for (const relative of paths) {
    if (
      !relative.startsWith(".agents/skills/") ||
      !relative.endsWith("/SKILL.md")
    )
      continue;
    const local = relative.replace(".agents/", ".zcode/");
    if (fs.existsSync(path.join(cwd, local))) return local;
  }
  return null;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positive(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function matches(matcher: unknown, source: string): boolean {
  if (matcher === undefined || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(source);
  } catch {
    return false;
  }
}

/** Recognize actual invocations, including the native process/args form. */
export function zcodeHookReferencesPaths(
  hook: unknown,
  paths: readonly string[],
): boolean {
  if (!object(hook) || typeof hook.command !== "string") return false;
  if (hook.type === "command")
    return commandMatchesDeletedPath(hook.command, paths);
  const args = hook.args ?? [];
  if (
    hook.type !== "process" ||
    !Array.isArray(args) ||
    !args.every((arg) => typeof arg === "string")
  )
    return false;
  return commandMatchesDeletedPath(
    [hook.command, ...args].map((arg) => `"${arg}"`).join(" "),
    paths,
  );
}

/** Check the structure we merge against ZCode's project hook schema. */
export function readZCodeConfigIssue(
  file: string,
  registration = false,
): string | null {
  let root: unknown;
  try {
    root = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return "ZCode config could not be read as JSON";
  }
  if (!object(root)) return "ZCode config must be a JSON object";
  const hooks = root.hooks;
  if (hooks !== undefined && !object(hooks))
    return "ZCode hooks must be an object";
  if (object(hooks)) {
    if (
      Object.keys(hooks).some(
        (key) =>
          !["enabled", "timeoutMs", "maxOutputBytes", "events"].includes(key),
      ) ||
      (hooks.enabled !== undefined && typeof hooks.enabled !== "boolean") ||
      ["timeoutMs", "maxOutputBytes"].some(
        (key) => hooks[key] !== undefined && !positive(hooks[key]),
      )
    )
      return "ZCode hooks contains invalid settings";
    if (hooks.events !== undefined && !object(hooks.events))
      return "ZCode hooks.events must be an object";
    for (const [event, groups] of Object.entries(
      object(hooks.events) ? hooks.events : {},
    )) {
      if (!EVENTS.has(event) || !Array.isArray(groups))
        return `ZCode hooks.events.${event} must be a supported event array`;
      for (const group of groups) {
        if (
          !object(group) ||
          Object.keys(group).some(
            (key) => !["matcher", "hooks"].includes(key),
          ) ||
          !Array.isArray(group.hooks) ||
          !group.hooks.length ||
          (group.matcher !== undefined &&
            (typeof group.matcher !== "string" || !group.matcher))
        )
          return `ZCode hooks.events.${event} requires matcher groups with a nonempty hooks array`;
        if (typeof group.matcher === "string" && group.matcher !== "*") {
          try {
            new RegExp(group.matcher);
          } catch {
            return `ZCode hooks.events.${event} contains an invalid matcher`;
          }
        }
        for (const hook of group.hooks) {
          if (
            !object(hook) ||
            !["command", "process"].includes(String(hook.type)) ||
            typeof hook.command !== "string" ||
            !hook.command.trim() ||
            (hook.enabled !== undefined && typeof hook.enabled !== "boolean") ||
            (hook.timeoutMs !== undefined && !positive(hook.timeoutMs)) ||
            (hook.statusMessage !== undefined &&
              (typeof hook.statusMessage !== "string" ||
                !hook.statusMessage)) ||
            (hook.onError !== undefined &&
              !["allow", "deny"].includes(String(hook.onError))) ||
            (hook.type === "process" &&
              hook.args !== undefined &&
              (!Array.isArray(hook.args) ||
                !hook.args.every((arg) => typeof arg === "string"))) ||
            (hook.type === "command" &&
              ((hook.timeout !== undefined && !positive(hook.timeout)) ||
                (hook.async !== undefined && typeof hook.async !== "boolean") ||
                (hook.shell !== undefined &&
                  hook.shell !== true &&
                  (typeof hook.shell !== "string" || !hook.shell))))
          )
            return `ZCode hooks.events.${event} contains an invalid hook definition`;
        }
      }
    }
  }
  if (registration) {
    const events = object(hooks) && object(hooks.events) ? hooks.events : {};
    const groups = Array.isArray(events.SessionStart)
      ? events.SessionStart
      : [];
    if (
      !SOURCES.every((source) =>
        groups.some(
          (group: Record<string, unknown>) =>
            matches(group.matcher, source) &&
            (group.hooks as unknown[]).some((hook) =>
              zcodeHookReferencesPaths(hook, [SESSION_HOOK]),
            ),
        ),
      )
    )
      return "mini-trellis SessionStart is not registered for startup/clear/compact; run mini-trellis init --zcode";
  }
  return null;
}

/** Add only uncovered event sources; retain disabled user choices and hooks. */
export function mergeZCodeConfig(existing: unknown, desired: unknown): unknown {
  const merged = mergeJsonValues(existing, desired);
  if (
    !object(existing) ||
    !object(desired) ||
    !object(merged) ||
    !object(desired.hooks) ||
    !object(desired.hooks.events) ||
    !object(merged.hooks)
  )
    return merged;
  const oldHooks = object(existing.hooks) ? existing.hooks : {};
  const events = object(oldHooks.events) ? { ...oldHooks.events } : {};
  const wanted = desired.hooks.events.SessionStart as Record<string, unknown>[];
  const groups = Array.isArray(events.SessionStart)
    ? ([...events.SessionStart] as Record<string, unknown>[])
    : [];
  for (const group of wanted) {
    const missing = SOURCES.filter(
      (source) =>
        !groups.some(
          (candidate) =>
            matches(candidate.matcher, source) &&
            Array.isArray(candidate.hooks) &&
            candidate.hooks.some((hook) =>
              zcodeHookReferencesPaths(hook, [SESSION_HOOK]),
            ),
        ),
    );
    if (missing.length) groups.push({ ...group, matcher: missing.join("|") });
  }
  return {
    ...merged,
    hooks: { ...merged.hooks, events: { ...events, SessionStart: groups } },
  };
}

/** Remove only known script invocations; keep user hooks and hook options. */
export function scrubZCodeConfig(
  content: string,
  paths: readonly string[],
): ScrubResult {
  let root: unknown;
  try {
    root = JSON.parse(content) as unknown;
  } catch {
    return { content, fullyEmpty: false };
  }
  if (!object(root) || !object(root.hooks) || !object(root.hooks.events))
    return { content, fullyEmpty: false };
  const events = root.hooks.events;
  let changed = false;
  for (const [event, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue;
    const kept = groups.flatMap((group: unknown) => {
      if (!object(group) || !Array.isArray(group.hooks)) return [group];
      const hooks = group.hooks.filter(
        (hook) => !zcodeHookReferencesPaths(hook, paths),
      );
      if (hooks.length === group.hooks.length) return [group];
      changed = true;
      return hooks.length ? [{ ...group, hooks }] : [];
    });
    if (kept.length) events[event] = kept;
    else if (groups.length) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete events[event];
    }
  }
  if (!changed) return { content, fullyEmpty: false };
  if (!Object.keys(events).length) {
    delete root.hooks.events;
    if (
      !Object.keys(root.hooks).length ||
      (Object.keys(root.hooks).length === 1 && root.hooks.enabled === true)
    )
      delete root.hooks;
  }
  return {
    content: JSON.stringify(root, null, 2) + "\n",
    fullyEmpty: !Object.keys(root).length,
  };
}
