import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  resolveBundledSkills,
  resolveCommands,
  resolveAllAsSkills,
  resolvePlaceholders,
} from "./shared.js";

/** CLI and IDE consume the same project settings and skill files. */
export function collectCodeBuddyTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.codebuddy.templateContext;
  const files = collectSkillTemplates(
    ".codebuddy/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );
  for (const command of resolveCommands(ctx)) {
    files.set(
      `.codebuddy/commands/mini-trellis/${command.name}.md`,
      command.content,
    );
  }
  for (const [relative, content] of collectSharedHooks(
    ".codebuddy/hooks",
    "codebuddy",
  )) {
    files.set(relative, content);
  }
  files.set(
    ".codebuddy/settings.json",
    resolvePlaceholders(
      JSON.stringify(
        {
          hooks: {
            SessionStart: ["startup", "resume", "clear", "compact"].map(
              (matcher) => ({
                matcher,
                hooks: [
                  {
                    type: "command",
                    command: "{{PYTHON_CMD}} .codebuddy/hooks/session-start.py",
                    timeout: 30,
                  },
                ],
              }),
            ),
          },
        },
        null,
        2,
      ) + "\n",
    ),
  );
  return files;
}
