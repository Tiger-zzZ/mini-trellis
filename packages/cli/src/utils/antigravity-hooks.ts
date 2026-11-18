import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic-write.js";
import {
  assertSafeManagedPath,
  ManagedAssetConflict,
} from "./managed-path-safety.js";
import type { ScrubResult } from "./uninstall-scrubbers.js";

export const ANTIGRAVITY_HOOKS_PATH = ".agents/hooks.json";
export const ANTIGRAVITY_HOOK_DIR = ".agents/hooks/mini-trellis";
export const ANTIGRAVITY_SESSION_HOOK = `${ANTIGRAVITY_HOOK_DIR}/session-start.py`;
const GROUP = "mini-trellis-session-start";
// Command paths are relative to the directory containing hooks.json.
const START_ARGS = ` -X utf8 ./${ANTIGRAVITY_SESSION_HOOK.slice(".agents/".length)}`;

type HookRegistration =
  | { state: "missing" | "enabled" | "disabled" }
  | { state: "invalid"; detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHooks(content: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new Error("Antigravity hooks file could not be read as JSON");
  }
  if (!isRecord(value))
    throw new Error("Antigravity hooks file must be a JSON object");
  return value;
}

/** The name and single generated command identify our group in a shared file. */
function getRegistration(
  hooks: Record<string, unknown>,
): "missing" | "enabled" | "disabled" {
  const group = hooks[GROUP];
  if (group === undefined) return "missing";
  const handlers = isRecord(group) ? group.SessionStart : undefined;
  const handler: unknown = Array.isArray(handlers) ? handlers[0] : undefined;
  if (
    !isRecord(group) ||
    Object.keys(group).some(
      (key) => key !== "enabled" && key !== "SessionStart",
    ) ||
    (group.enabled !== undefined && typeof group.enabled !== "boolean") ||
    !Array.isArray(handlers) ||
    handlers.length !== 1 ||
    !isRecord(handler) ||
    Object.keys(handler).some(
      (key) => !["type", "command", "timeout"].includes(key),
    ) ||
    (handler.type !== undefined && handler.type !== "command") ||
    typeof handler.command !== "string" ||
    !handler.command.endsWith(START_ARGS) ||
    !handler.command.slice(0, -START_ARGS.length).trim() ||
    (handler.timeout !== undefined &&
      (typeof handler.timeout !== "number" ||
        !Number.isInteger(handler.timeout) ||
        handler.timeout <= 0))
  )
    throw new Error(
      `existing ${GROUP} group conflicts with mini-trellis SessionStart`,
    );
  return group.enabled === false ? "disabled" : "enabled";
}

export function readAntigravityRegistration(cwd: string): HookRegistration {
  try {
    const file = assertSafeManagedPath(
      fs.realpathSync(cwd),
      ANTIGRAVITY_HOOKS_PATH,
      { followLeaf: true },
    );
    if (!fs.existsSync(file)) return { state: "missing" };
    return {
      state: getRegistration(parseHooks(fs.readFileSync(file, "utf8"))),
    };
  } catch (error) {
    return {
      state: "invalid",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function antigravityHooksTemplate(python: string): string {
  return (
    JSON.stringify(
      {
        [GROUP]: {
          SessionStart: [
            { type: "command", command: python + START_ARGS, timeout: 15 },
          ],
        },
      },
      null,
      2,
    ) + "\n"
  );
}

/** Keep an installed command and its enabled choice, including custom Python. */
export function mergeAntigravityHooks(
  existing: string,
  desired: string,
): string {
  const hooks = parseHooks(existing);
  if (getRegistration(hooks) !== "missing") return existing;
  return JSON.stringify({ ...hooks, ...parseHooks(desired) }, null, 2) + "\n";
}

export function writeAntigravityHooks(file: string, desired: string): void {
  try {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    const merged =
      existing === null ? desired : mergeAntigravityHooks(existing, desired);
    if (merged !== existing) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      writeFileAtomic(file, merged);
    }
  } catch (error) {
    throw new ManagedAssetConflict(
      ANTIGRAVITY_HOOKS_PATH,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function scrubAntigravityHooks(content: string): ScrubResult {
  try {
    const hooks = parseHooks(content);
    if (getRegistration(hooks) !== "missing") {
      const remaining = Object.fromEntries(
        Object.entries(hooks).filter(([key]) => key !== GROUP),
      );
      return {
        content: JSON.stringify(remaining, null, 2) + "\n",
        fullyEmpty: Object.keys(remaining).length === 0,
      };
    }
  } catch {
    // Unrecognized groups and unreadable files belong to the user.
  }
  return { content, fullyEmpty: false };
}
