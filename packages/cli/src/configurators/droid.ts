import { AI_TOOLS } from "../types/ai-tools.js";
import {
  DROID_HOOKS_PATH,
  DROID_SETTINGS_PATH,
  DROID_SESSION_HOOK,
  DROID_SOURCES,
} from "../utils/droid-hooks.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  getPythonCommandForPlatform,
  type PlatformConfigureOptions,
} from "./shared.js";

/** Skills double as `/mini-trellis-*` slash commands in Droid. */
export function collectDroidTemplates(
  options: PlatformConfigureOptions = {},
): Map<string, string> {
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
  const target = options.droidHooksPath ?? DROID_HOOKS_PATH;
  const events = {
    SessionStart: [
      {
        matcher: DROID_SOURCES.join("|"),
        hooks: [
          {
            type: "command",
            command: `${getPythonCommandForPlatform()} ${DROID_SESSION_HOOK}`,
            timeout: 30,
          },
        ],
      },
    ],
  };
  files.set(
    target,
    JSON.stringify(
      target === DROID_SETTINGS_PATH ? { hooks: events } : events,
      null,
      2,
    ) + "\n",
  );
  return files;
}
