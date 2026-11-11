import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSkillTemplates,
  resolveCommands,
  resolveBundledSkills,
  resolvePlaceholders,
  resolveSkillsNeutral,
  resolveSkills,
} from "./shared.js";
import {
  getExtensionTemplate,
  getSettingsTemplate,
} from "../templates/pi/index.js";

export function collectPiTemplates(): Map<string, string> {
  return collectTemplates("pi");
}

export function collectOmpTemplates(): Map<string, string> {
  return collectTemplates("omp");
}

function collectTemplates(host: "pi" | "omp"): Map<string, string> {
  const files = new Map<string, string>();
  const { configDir, templateContext: ctx } = AI_TOOLS[host];

  for (const command of resolveCommands(ctx)) {
    // Pi substitutes arguments only where the template explicitly requests them.
    files.set(
      `${configDir}/prompts/mini-trellis-${command.name}.md`,
      `${command.content.trimEnd()}\n\n$ARGUMENTS\n`,
    );
  }

  for (const [filePath, content] of collectSkillTemplates(
    host === "pi" ? ".agents/skills" : ".omp/skills",
    host === "pi" ? resolveSkillsNeutral(ctx) : resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  files.set(
    `${configDir}/extensions/mini-trellis/index.ts`,
    getExtensionTemplate(),
  );

  // OMP discovers its native extensions, prompts and skills without settings entries.
  if (host === "pi") {
    const settings = getSettingsTemplate();
    files.set(
      `.pi/${settings.targetPath}`,
      resolvePlaceholders(settings.content),
    );
  }

  return files;
}
