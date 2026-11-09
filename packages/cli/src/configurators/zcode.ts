import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  getPythonCommandForPlatform,
} from "./shared.js";

/** Project skills and one trusted SessionStart entry; no user-level writes. */
export function collectZCodeTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.zcode.templateContext;
  const python = getPythonCommandForPlatform();
  const files = collectSkillTemplates(
    ".agents/skills",
    resolveAllAsSkillsNeutral(ctx),
    resolveBundledSkills(ctx),
  );
  for (const [relative, content] of collectSharedHooks(".zcode/hooks", "zcode"))
    files.set(relative, content);
  files.set(
    ".zcode/config.json",
    JSON.stringify(
      {
        hooks: {
          enabled: true,
          events: {
            SessionStart: [
              {
                matcher: "startup|clear|compact",
                hooks: [
                  {
                    type: "process",
                    command: python === "py -3" ? "py" : python,
                    args: [
                      ...(python === "py -3" ? ["-3"] : []),
                      "${ZCODE_PROJECT_DIR}/.zcode/hooks/session-start.py",
                    ],
                    timeoutMs: 30000,
                  },
                ],
              },
            ],
          },
        },
      },
      null,
      2,
    ) + "\n",
  );
  return files;
}
