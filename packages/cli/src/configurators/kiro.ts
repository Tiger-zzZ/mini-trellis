import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  getPythonCommandForPlatform,
} from "./shared.js";

/** Standalone project hooks are shared by Kiro CLI V3 and IDE 1.x. */
export function collectKiroTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.kiro.templateContext;
  const files = collectSkillTemplates(
    ".kiro/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );
  for (const [relative, content] of collectSharedHooks(".kiro/hooks", "kiro"))
    files.set(relative, content);
  files.set(
    ".kiro/hooks/mini-trellis.json",
    JSON.stringify(
      {
        version: "v1",
        hooks: [
          {
            name: "mini-trellis-session-start",
            trigger: "SessionStart",
            action: {
              type: "command",
              command: `${getPythonCommandForPlatform()} .kiro/hooks/session-start.py`,
            },
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  return files;
}
