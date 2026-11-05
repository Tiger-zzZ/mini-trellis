import { readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getOpenCodeTemplatePath } from "../templates/extract.js";
import { toPosix } from "../utils/posix.js";
import {
  collectSkillTemplates,
  replacePythonCommandLiterals,
  resolveBundledSkills,
  resolveCommands,
  resolveSkills,
  writeTemplateMap,
  renderTemplateMap,
  type PlatformConfigureOptions,
} from "./shared.js";
import {
  DEFAULT_OPENCODE_VERSION,
  openCodeSwitchFiles,
  resolveOpenCodeVersion,
  cleanupOpenCodeEntryDirectory,
} from "../utils/opencode-version.js";
import { getWriteMode, setWriteMode } from "../utils/file-writer.js";
import { updateManifestForTemplates } from "../utils/managed-manifest.js";

const EXCLUDE_PATTERNS = [
  ".d.ts",
  ".d.ts.map",
  ".js.map",
  "__pycache__",
  "node_modules",
  "bun.lock",
  ".gitignore",
];

function shouldExclude(filename: string): boolean {
  return EXCLUDE_PATTERNS.some(
    (pattern) => filename.endsWith(pattern) || filename === pattern,
  );
}

function walkOpenCodeTemplateDir(version: "1" | "2"): Map<string, string> {
  const files = new Map<string, string>();
  const sourcePath = getOpenCodeTemplatePath();

  function walk(relDir: string): void {
    const absDir = path.join(sourcePath, relDir);
    for (const entry of readdirSync(absDir)) {
      if (shouldExclude(entry)) continue;
      const absEntry = path.join(absDir, entry);
      const relEntry = relDir ? path.join(relDir, entry) : entry;
      const stat = statSync(absEntry);
      if (stat.isDirectory()) {
        if (
          relEntry === "commands" ||
          relEntry === "agents" ||
          (version === "1" &&
            relEntry === path.join("plugins", "mini-trellis")) ||
          relEntry === path.join("plugins", "inject-subagent-context.js")
        ) {
          continue;
        }
        walk(relEntry);
      } else {
        if (
          (version === "2" &&
            relEntry === path.join("plugins", "session-start.js")) ||
          relEntry.endsWith("inject-subagent-context.js") ||
          relEntry.endsWith("inject-workflow-state.js")
        ) {
          continue;
        }
        const content = readFileSync(absEntry, "utf-8");
        files.set(
          toPosix(path.join(".opencode", relEntry)),
          replacePythonCommandLiterals(content),
        );
      }
    }
  }

  walk("");
  return files;
}

export function collectOpenCodeTemplates(
  options: PlatformConfigureOptions = {},
): Map<string, string> {
  const version = options.opencodeVersion ?? DEFAULT_OPENCODE_VERSION;
  const files = walkOpenCodeTemplateDir(version);
  if (version === "2")
    files.set(".opencode/package.json", '{"type":"module"}\n');
  const ctx = AI_TOOLS.opencode.templateContext;
  for (const cmd of resolveCommands(ctx)) {
    files.set(`.opencode/commands/mini-trellis/${cmd.name}.md`, cmd.content);
  }
  for (const [filePath, content] of collectSkillTemplates(
    ".opencode/skills",
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }
  return files;
}

export async function configureOpenCode(
  cwd: string,
  options: PlatformConfigureOptions = {},
): Promise<void> {
  const version = resolveOpenCodeVersion(cwd, options.opencodeVersion);
  const files = renderTemplateMap(
    collectOpenCodeTemplates({ opencodeVersion: version }),
  );
  const removed = openCodeSwitchFiles(cwd, version, files);
  const mode = getWriteMode();
  try {
    // Explicit protocol switches refresh only files proven unmodified above.
    if (removed.length) setWriteMode("force");
    await writeTemplateMap(cwd, files);
  } finally {
    setWriteMode(mode);
  }
  for (const relative of removed) {
    rmSync(path.join(cwd, relative));
    cleanupOpenCodeEntryDirectory(cwd, relative);
  }
  updateManifestForTemplates(cwd, files, removed);
}
