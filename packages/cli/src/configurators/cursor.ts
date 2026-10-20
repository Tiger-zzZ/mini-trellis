import { AI_TOOLS } from "../types/ai-tools.js";
import { getHooksConfig } from "../templates/cursor/index.js";
import {
  collectSharedHooks,
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
  resolvePlaceholders,
} from "./shared.js";

const CURSOR_SKILL_NOTE = `

## Cursor

Local sessions can receive the short SessionStart context. Cloud agents do not run sessionStart. Cursor conversation history is not parsed. When you need project knowledge, run \`mini-trellis mem recall\`, then \`mini-trellis mem read\` if the excerpt is not enough. After a confirmed decision, use the \`mini-trellis-remember\` skill.
`;

/**
 * Project knowledge plus a local sessionStart entry.
 * No per-turn hook, sub-agent, or conversation-store parser.
 */
export function collectCursorTemplates(): Map<string, string> {
  const ctx = AI_TOOLS.cursor.templateContext;
  const files = collectSkillTemplates(
    ".cursor/skills",
    resolveAllAsSkills(ctx),
    resolveBundledSkills(ctx),
  );
  const skill = ".cursor/skills/mini-trellis-session-insight/SKILL.md";
  const body = files.get(skill);
  if (body) files.set(skill, `${body.trimEnd()}\n${CURSOR_SKILL_NOTE}`);
  for (const [relPath, content] of collectSharedHooks(
    ".cursor/hooks",
    "cursor",
  )) {
    files.set(relPath, content);
  }
  files.set(".cursor/hooks.json", resolvePlaceholders(getHooksConfig(), ctx));
  return files;
}
