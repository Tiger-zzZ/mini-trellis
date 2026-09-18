import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { getClaudeTemplatePath } from "../templates/extract.js";
import { toPosix } from "../utils/posix.js";
import {
  resolvePlaceholders,
  resolveCommands,
  resolveSkills,
  resolveBundledSkills,
  collectSkillTemplates,
  collectSharedHooks,
  writeTemplateMap,
} from "./shared.js";

const EXCLUDE_PATTERNS = [
  ".d.ts",
  ".d.ts.map",
  ".js",
  ".js.map",
  ".ts",
  "__pycache__",
];

function shouldExclude(filename: string): boolean {
  return EXCLUDE_PATTERNS.some(
    (pattern) => filename.endsWith(pattern) || filename === pattern,
  );
}

function walkClaudeTemplateDir(): Map<string, string> {
  const files = new Map<string, string>();
  const sourcePath = getClaudeTemplatePath();

  function walk(relDir: string): void {
    const absDir = path.join(sourcePath, relDir);
    for (const entry of readdirSync(absDir)) {
      if (shouldExclude(entry)) continue;
      const absEntry = path.join(absDir, entry);
      const relEntry = relDir ? path.join(relDir, entry) : entry;
      if (statSync(absEntry).isDirectory()) {
        if (
          relEntry === "commands" ||
          relEntry === "hooks" ||
          relEntry === "agents"
        ) {
          continue;
        }
        walk(relEntry);
      } else {
        const content = readFileSync(absEntry, "utf-8");
        files.set(
          toPosix(path.join(".claude", relEntry)),
          entry === "settings.json" ? resolvePlaceholders(content) : content,
        );
      }
    }
  }

  walk("");
  return files;
}

export function collectClaudeTemplates(): Map<string, string> {
  const ctx = AI_TOOLS["claude-code"].templateContext;
  const files = walkClaudeTemplateDir();

  for (const cmd of resolveCommands(ctx)) {
    files.set(`.claude/commands/trellis/${cmd.name}.md`, cmd.content);
  }
  for (const [filePath, content] of collectSkillTemplates(
    ".claude/skills",
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }
  for (const [k, v] of collectSharedHooks(".claude/hooks", "claude")) {
    files.set(k, v);
  }

  return files;
}

export async function configureClaude(cwd: string): Promise<void> {
  await writeTemplateMap(cwd, collectClaudeTemplates());
}
