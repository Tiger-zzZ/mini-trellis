import { AI_TOOLS } from "../types/ai-tools.js";
import { DROID_HOOKS_PATH, DROID_SESSION_HOOK } from "../utils/droid-hooks.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolvePlaceholders,
} from "./shared.js";

/** Skills double as `/mini-trellis-*` slash commands in Droid. */
export function collectDroidTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.droid.templateContext;
  const files = collectSkillTemplates(
    ".factory/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );
  for (const [relative, content] of collectSharedHooks(
    ".factory/hooks",
    "droid",
  ))
    files.set(relative, content);
  files.set(
    DROID_HOOKS_PATH,
    resolvePlaceholders(
      JSON.stringify(
        {
          SessionStart: [
            {
              matcher: "startup|resume|clear|compact",
              hooks: [
                {
                  type: "command",
                  command: `{{PYTHON_CMD}} ${DROID_SESSION_HOOK}`,
                  timeout: 30,
                },
              ],
            },
          ],
        },
        null,
        2,
      ) + "\n",
    ),
  );
  return files;
}
