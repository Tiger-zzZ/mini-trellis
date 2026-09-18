import { AI_TOOLS } from "../types/ai-tools.js";
import { getConfigTemplate, getHooksConfig } from "../templates/codex/index.js";
import {
  resolvePlaceholders,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  collectSkillTemplates,
  collectSharedHooks,
  writeTemplateMap,
} from "./shared.js";

export function collectCodexTemplates(): Map<string, string> {
  const files = new Map<string, string>();
  const ctx = AI_TOOLS.codex.templateContext;

  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveAllAsSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }
  for (const [k, v] of collectSharedHooks(".codex/hooks", "codex")) {
    files.set(k, v);
  }
  files.set(".codex/hooks.json", resolvePlaceholders(getHooksConfig()));
  const config = getConfigTemplate();
  files.set(`.codex/${config.targetPath}`, config.content);
  return files;
}

export async function configureCodex(cwd: string): Promise<void> {
  await writeTemplateMap(cwd, collectCodexTemplates());
}
