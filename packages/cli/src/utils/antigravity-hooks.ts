import fs from "node:fs";
import path from "node:path";
import {
  hashContent,
  MANIFEST_PATH,
  type MiniTrellisManifest,
  readManifest,
  writeManifest,
} from "./managed-manifest.js";
import { writeFileAtomic } from "./atomic-write.js";
import {
  assertSafeManagedPath,
  ManagedAssetConflict,
} from "./managed-path-safety.js";
import {
  commandMatchesDeletedPath,
  type ScrubResult,
} from "./uninstall-scrubbers.js";

export const ANTIGRAVITY_HOOKS_PATH = ".agents/hooks.json";
export const ANTIGRAVITY_HOOK_DIR = ".agents/hooks/mini-trellis";
export const ANTIGRAVITY_SESSION_HOOK = `${ANTIGRAVITY_HOOK_DIR}/session-start.py`;
const GROUP = "mini-trellis-session-start";
// Command paths are relative to the directory containing hooks.json.
const SCRIPT = ANTIGRAVITY_SESSION_HOOK.slice(".agents/".length);
const START_ARGS = ` -X utf8 ./${SCRIPT}`;

type RegistrationState =
  | "missing"
  | "enabled"
  | "disabled"
  | "legacy-enabled"
  | "legacy-disabled";
type HookRegistration =
  | { state: RegistrationState }
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

function isSafePrefix(prefix: string): boolean {
  return !!prefix.trim() && !/[;&|`<>]|\$\(|[\p{Cc}]/u.test(prefix);
}

function isManagedCommand(
  command: unknown,
  manifest?: MiniTrellisManifest,
): boolean {
  if (typeof command !== "string" || !command.endsWith(START_ARGS))
    return false;
  const prefix = command.slice(0, -START_ARGS.length);
  if (!isSafePrefix(prefix)) return false;
  if (manifest?.antigravityCommandHash === hashContent(command)) return true;
  const unwrapped = command
    .replace(/^timeout\s+\d+(?:\.\d+)?[smhd]?\s+/, "")
    .replace(/^(?:\/usr\/bin\/|\/bin\/)?env\s+/, "");
  if (commandMatchesDeletedPath(unwrapped, [SCRIPT])) return true;

  // Older installers recorded the canonical file hash, before launcher hashes existed.
  const fileHash = manifest?.files[ANTIGRAVITY_HOOKS_PATH];
  if (!fileHash) return false;
  return [false, true].some(
    (legacy) => hashContent(renderHooks(prefix, legacy)) === fileHash,
  );
}

function isManagedHandler(
  handlers: unknown,
  manifest?: MiniTrellisManifest,
): boolean {
  if (!Array.isArray(handlers) || handlers.length !== 1) return false;
  const handler: unknown = handlers[0];
  return (
    isRecord(handler) &&
    Object.keys(handler).every((key) =>
      ["type", "command", "timeout"].includes(key),
    ) &&
    (handler.type === undefined || handler.type === "command") &&
    isManagedCommand(handler.command, manifest) &&
    (handler.timeout === undefined ||
      (typeof handler.timeout === "number" &&
        Number.isInteger(handler.timeout) &&
        handler.timeout > 0))
  );
}

function getRegistration(
  hooks: Record<string, unknown>,
  manifest?: MiniTrellisManifest,
): RegistrationState {
  const group = hooks[GROUP];
  if (group === undefined) return "missing";
  if (
    !isRecord(group) ||
    Object.keys(group).some(
      (key) => !["enabled", "SessionStart", "PreInvocation"].includes(key),
    ) ||
    (group.enabled !== undefined && typeof group.enabled !== "boolean") ||
    !isManagedHandler(group.SessionStart, manifest) ||
    (group.PreInvocation !== undefined &&
      !isManagedHandler(group.PreInvocation, manifest))
  ) {
    throw new Error(
      `existing ${GROUP} group conflicts with mini-trellis hooks`,
    );
  }
  if (group.PreInvocation === undefined)
    return group.enabled === false ? "legacy-disabled" : "legacy-enabled";
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
      state: getRegistration(
        parseHooks(fs.readFileSync(file, "utf8")),
        readManifest(cwd),
      ),
    };
  } catch (error) {
    return {
      state: "invalid",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function renderHooks(python: string, legacy: boolean): string {
  const handlers = [
    { type: "command", command: python + START_ARGS, timeout: 15 },
  ];
  return (
    JSON.stringify(
      {
        [GROUP]: {
          SessionStart: handlers,
          ...(legacy ? {} : { PreInvocation: handlers }),
        },
      },
      null,
      2,
    ) + "\n"
  );
}

export function antigravityHooksTemplate(python: string): string {
  if (!isSafePrefix(python))
    throw new Error("Invalid Python command for Antigravity hooks");
  return renderHooks(python, false);
}

/** Keep an installed command and its enabled choice, including custom Python. */
export function mergeAntigravityHooks(
  existing: string,
  desired: string,
  manifest?: MiniTrellisManifest,
): string {
  const hooks = parseHooks(existing);
  const state = getRegistration(hooks, manifest);
  if (state === "missing") hooks[GROUP] = parseHooks(desired)[GROUP];
  else if (state === "legacy-enabled" || state === "legacy-disabled") {
    const group = hooks[GROUP] as Record<string, unknown>;
    group.PreInvocation = group.SessionStart;
  } else return existing;
  return JSON.stringify(hooks, null, 2) + "\n";
}

export function writeAntigravityHooks(file: string, desired: string): void {
  try {
    const cwd = path.dirname(path.dirname(file));
    const manifest = readManifest(cwd);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    const merged =
      existing === null
        ? desired
        : mergeAntigravityHooks(existing, desired, manifest);
    if (merged !== existing) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const group = parseHooks(merged)[GROUP] as {
        SessionStart: { command: string }[];
      };
      const command = group.SessionStart[0].command;
      // Retain the approved launcher when a shared hooks file no longer matches the original template.
      if (
        !isManagedCommand(command) &&
        manifest.antigravityCommandHash !== hashContent(command)
      ) {
        assertSafeManagedPath(fs.realpathSync(cwd), MANIFEST_PATH, {
          followLeaf: true,
        });
        manifest.antigravityCommandHash = hashContent(command);
        writeManifest(cwd, manifest);
      }
      writeFileAtomic(file, merged);
    }
  } catch (error) {
    throw new ManagedAssetConflict(
      ANTIGRAVITY_HOOKS_PATH,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function scrubAntigravityHooks(
  content: string,
  manifest?: MiniTrellisManifest,
): ScrubResult {
  try {
    const hooks = parseHooks(content);
    if (getRegistration(hooks, manifest) !== "missing") {
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
