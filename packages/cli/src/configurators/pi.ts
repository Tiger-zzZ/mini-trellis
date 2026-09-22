import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSkillTemplates,
  resolveCommands,
  resolveBundledSkills,
  resolvePlaceholders,
  resolveSkillsNeutral,
} from "./shared.js";
import {
  getExtensionTemplate,
  getSettingsTemplate,
} from "../templates/pi/index.js";

export function collectPiTemplates(): Map<string, string> {
  const files = new Map<string, string>();
  const ctx = AI_TOOLS.pi.templateContext;

  for (const command of resolveCommands(ctx)) {
    files.set(`.pi/prompts/mini-trellis-${command.name}.md`, command.content);
  }

  for (const [filePath, content] of collectSkillTemplates(
    ".agents/skills",
    resolveSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  files.set(".pi/extensions/mini-trellis/index.ts", getExtensionTemplate());

  const settings = getSettingsTemplate();
  files.set(
    `.pi/${settings.targetPath}`,
    resolvePlaceholders(settings.content),
  );

  return files;
}
