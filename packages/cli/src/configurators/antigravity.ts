import { AI_TOOLS } from "../types/ai-tools.js";
import {
  ANTIGRAVITY_HOOK_DIR,
  ANTIGRAVITY_HOOKS_PATH,
  antigravityHooksTemplate,
} from "../utils/antigravity-hooks.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  getPythonCommandForPlatform,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
} from "./shared.js";

export function collectAntigravityTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.antigravity.templateContext;
  const files = collectSkillTemplates(
    ".agents/skills",
    resolveAllAsSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  );
  for (const [relative, content] of collectSharedHooks(
    ANTIGRAVITY_HOOK_DIR,
    "antigravity",
  ))
    files.set(relative, content);
  files.set(
    ANTIGRAVITY_HOOKS_PATH,
    antigravityHooksTemplate(getPythonCommandForPlatform()),
  );
  return files;
}
