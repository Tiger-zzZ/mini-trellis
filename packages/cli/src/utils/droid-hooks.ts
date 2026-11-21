import fs from "node:fs";
import path from "node:path";
import {
  applyEdits,
  createScanner,
  findNodeAtLocation,
  modify,
  parse,
  parseTree,
  printParseErrorCode,
  type JSONPath,
  type ParseError,
} from "jsonc-parser";
import { writeFileAtomic } from "./atomic-write.js";
import {
  assertSafeManagedPath,
  ManagedAssetConflict,
} from "./managed-path-safety.js";
import {
  commandMatchesDeletedPath,
  type ScrubResult,
} from "./uninstall-scrubbers.js";

export const DROID_HOOKS_PATH = ".factory/hooks.json";
const LEGACY_HOOKS_PATH = ".factory/hooks/hooks.json";
export const DROID_SETTINGS_PATH = ".factory/settings.json";
export const DROID_CONFIG_PATHS = [
  DROID_HOOKS_PATH,
  LEGACY_HOOKS_PATH,
  DROID_SETTINGS_PATH,
] as const;
export type DroidConfigPath = (typeof DROID_CONFIG_PATHS)[number];
export const DROID_SESSION_HOOK = ".factory/hooks/session-start.py";
export const DROID_LEGACY_INJECTORS = [
  ".factory/hooks/inject-workflow-state.py",
  ".factory/hooks/inject-subagent-context.py",
  ".factory/hooks/inject-shell-session-context.py",
];
const TRELLIS_HOOKS = [DROID_SESSION_HOOK, ...DROID_LEGACY_INJECTORS];
export const DROID_SOURCES = ["startup", "resume", "clear", "compact"];

export function isDroidConfigPath(
  relative: string,
): relative is DroidConfigPath {
  return DROID_CONFIG_PATHS.some((p) => p === relative);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function editDroidJson(
  content: string,
  remove: JSONPath[],
  append?: JSONPath,
  value?: unknown,
): string {
  const bom = content.startsWith("\uFEFF") ? "\uFEFF" : "";
  let text = content.slice(bom.length);
  const options = { formattingOptions: { insertSpaces: true, tabSize: 2 } };
  for (const location of remove) {
    // modify(..., undefined) also deletes comments attached to the next handler.
    // Remove just this array entry and its separator. The paths identify array entries in this document.
    const tree = parseTree(text);
    const node = tree && findNodeAtLocation(tree, location);
    const siblings = node?.parent?.children;
    if (!node || !siblings)
      throw new Error(`Missing Droid hook at ${JSON.stringify(location)}`);
    const edits = [{ offset: node.offset, length: node.length, content: "" }];
    if (siblings.length > 1) {
      const left =
        node === siblings.at(-1) ? siblings[siblings.length - 2] : node;
      const scanner = createScanner(text, true);
      scanner.setPosition(left.offset + left.length);
      scanner.scan();
      edits.push({ offset: scanner.getTokenOffset(), length: 1, content: "" });
    }
    text = applyEdits(text, edits);
  }
  if (append) text = applyEdits(text, modify(text, append, value, options));
  return bom + text;
}

interface HookConfig {
  relative: DroidConfigPath;
  content: string;
  prefix: string[];
  events: Record<string, unknown>;
}

function hookConfig(content: string, relative: DroidConfigPath): HookConfig {
  const errors: ParseError[] = [];
  const root: unknown = parse(content.replace(/^\uFEFF/, ""), errors);
  if (errors.length)
    throw new ManagedAssetConflict(
      relative,
      `invalid JSONC at offset ${errors[0].offset} (${printParseErrorCode(errors[0].error)})`,
    );
  if (!isObject(root))
    throw new ManagedAssetConflict(relative, "expected a JSON object");
  const prefix = relative === DROID_SETTINGS_PATH ? ["hooks"] : [];
  const { hooks = {} } = root;
  const events = relative === DROID_SETTINGS_PATH ? hooks : root;
  if (
    !isObject(events) ||
    (events.SessionStart !== undefined && !Array.isArray(events.SessionStart))
  ) {
    throw new ManagedAssetConflict(
      relative,
      "expected a hook map with a SessionStart array",
    );
  }
  return { relative, content, prefix, events };
}

function readProjectConfigs(cwd: string, skipInvalid = false): HookConfig[] {
  const root = fs.realpathSync(cwd);
  const result: HookConfig[] = [];
  // Factory ignores the old standalone file whenever hooks.json exists.
  const standalone = fs.existsSync(path.join(root, DROID_HOOKS_PATH))
    ? DROID_HOOKS_PATH
    : LEGACY_HOOKS_PATH;
  for (const relative of [standalone, DROID_SETTINGS_PATH] as const) {
    try {
      const file = assertSafeManagedPath(root, relative, { followLeaf: true });
      if (fs.existsSync(file))
        result.push(hookConfig(fs.readFileSync(file, "utf8"), relative));
    } catch (error) {
      if (skipInvalid) continue;
      if (error instanceof ManagedAssetConflict) throw error;
      throw new ManagedAssetConflict(
        relative,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return result;
}

function startConfig(configs: HookConfig[]): HookConfig | undefined {
  // Standalone overrides settings per event. Adding an event to the wrong file masks user hooks.
  return (
    configs.find(({ events }) => events.SessionStart !== undefined) ??
    configs.find(({ relative }) => relative !== DROID_SETTINGS_PATH)
  );
}

export function resolveDroidHooksPath(cwd: string): DroidConfigPath {
  return startConfig(readProjectConfigs(cwd))?.relative ?? DROID_HOOKS_PATH;
}

function invokes(hook: unknown, scripts: readonly string[]): boolean {
  return (
    isObject(hook) &&
    hook.type === "command" &&
    typeof hook.command === "string" &&
    hook.args === undefined &&
    commandMatchesDeletedPath(hook.command, scripts)
  );
}

function matchesSource(matcher: unknown, source: string): boolean {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  if (/^[\w ,|-]+$/.test(matcher))
    return matcher.split(/[|,]/).some((name) => name.trim() === source);
  try {
    return new RegExp(matcher).test(source);
  } catch {
    return false;
  }
}

function coversSessionStart(matchers: unknown[]): boolean {
  return DROID_SOURCES.every(
    (source) =>
      matchers.filter((matcher) => matchesSource(matcher, source)).length === 1,
  );
}

export function readDroidRegistration(cwd: string): {
  level: "ok" | "error" | "warn";
  detail: string;
} {
  try {
    const configs = readProjectConfigs(cwd);
    const target = startConfig(configs);
    if (
      !target ||
      !coversSessionStart(
        findHooks(target, [DROID_SESSION_HOOK], "SessionStart").matchers,
      )
    )
      return {
        level: "error",
        detail:
          "SessionStart must cover startup, resume, clear and compact; run mini-trellis refresh --droid",
      };
    if (
      configs.find(({ events }) => typeof events.hooksDisabled === "boolean")
        ?.events.hooksDisabled
    )
      return { level: "warn", detail: "Droid project hooks are disabled" };
    return {
      level: "ok",
      detail: `SessionStart is registered in ${target.relative}`,
    };
  } catch (error) {
    return {
      level: "error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Delete in reverse array order so paths still identify the same handlers after each edit. */
function findHooks(
  config: HookConfig,
  scripts: readonly string[],
  onlyEvent?: string,
): { paths: JSONPath[]; matchers: unknown[] } {
  const paths: JSONPath[] = [];
  const matchers: unknown[] = [];
  for (const [event, groups] of Object.entries(config.events)) {
    if ((onlyEvent && onlyEvent !== event) || !Array.isArray(groups)) continue;
    for (let i = groups.length - 1; i >= 0; --i) {
      const group = groups[i] as unknown;
      if (!isObject(group) || !Array.isArray(group.hooks)) continue;
      const matches = group.hooks.flatMap((hook, index) =>
        invokes(hook, scripts) ? [index] : [],
      );
      if (!matches.length) continue;
      matchers.push(...matches.map(() => group.matcher));
      const groupPath = [...config.prefix, event, i];
      if (matches.length === group.hooks.length) paths.push(groupPath);
      else
        for (const index of matches.reverse())
          paths.push([...groupPath, "hooks", index]);
    }
  }
  return { paths, matchers };
}

export function mergeDroidHooks(
  content: string,
  relative: DroidConfigPath,
  template: string,
): string {
  const config = hookConfig(content, relative);
  const registration = findHooks(config, [DROID_SESSION_HOOK], "SessionStart");
  if (coversSessionStart(registration.matchers)) return content;
  const desired = hookConfig(template, relative).events
    .SessionStart as unknown[];
  return editDroidJson(
    content,
    registration.paths,
    [...config.prefix, "SessionStart", -1],
    desired[0],
  );
}

export function writeDroidHooks(
  cwd: string,
  relative: DroidConfigPath,
  template: string,
): void {
  const file = assertSafeManagedPath(fs.realpathSync(cwd), relative, {
    followLeaf: true,
  });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const merged =
    existing === null
      ? template
      : mergeDroidHooks(existing, relative, template);
  if (merged !== existing) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(
      file,
      merged,
      fs.statSync(file, { throwIfNoEntry: false })?.mode,
    );
  }
}

export function hasLegacyDroidHooks(cwd: string): boolean {
  // Startup is shared with mini-trellis. Only a Trellis installation marker identifies it as legacy.
  const scripts = fs.existsSync(path.join(cwd, ".trellis/.version"))
    ? TRELLIS_HOOKS
    : DROID_LEGACY_INJECTORS;
  // Discovery also runs for other hosts. Droid preflight reports invalid files before any write.
  return readProjectConfigs(cwd, true).some(
    (config) => findHooks(config, scripts).paths.length > 0,
  );
}

export function migrateDroidHooks(cwd: string): void {
  const configs = readProjectConfigs(cwd);
  const active = startConfig(configs);
  for (const config of configs) {
    const { paths } = findHooks(
      config,
      config === active ? DROID_LEGACY_INJECTORS : TRELLIS_HOOKS,
    );
    if (paths.length) {
      const file = path.join(cwd, config.relative);
      writeFileAtomic(
        file,
        editDroidJson(config.content, paths),
        fs.statSync(file).mode,
      );
    }
  }
}

export function scrubDroidHooks(
  content: string,
  relative: DroidConfigPath,
): ScrubResult {
  const config = hookConfig(content, relative);
  const { paths } = findHooks(config, [DROID_SESSION_HOOK], "SessionStart");
  if (!paths.length) return { content, fullyEmpty: false };
  const remaining = editDroidJson(content, paths);
  const events = hookConfig(remaining, relative).events;
  const fullyEmpty =
    relative !== DROID_SETTINGS_PATH &&
    Object.keys(events).length === 1 &&
    Array.isArray(events.SessionStart) &&
    events.SessionStart.length === 0;
  return { content: remaining, fullyEmpty };
}
