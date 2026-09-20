import { readFileSync, readdirSync, statSync } from "node:fs";
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
} from "./shared.js";

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

function walkOpenCodeTemplateDir(): Map<string, string> {
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
          relEntry === path.join("plugins", "inject-subagent-context.js")
        ) {
          continue;
        }
        walk(relEntry);
      } else {
        if (
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

export function collectOpenCodeTemplates(): Map<string, string> {
  const files = walkOpenCodeTemplateDir();
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
