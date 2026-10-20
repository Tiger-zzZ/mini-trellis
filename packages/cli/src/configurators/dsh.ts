import { AI_TOOLS } from "../types/ai-tools.js";
import {
  collectSkillTemplates,
  resolveAllAsSkills,
  resolveBundledSkills,
} from "./shared.js";

const DSH_SKILL_NOTE = `

## DeepSeek Harness

There is no project SessionStart hook. When you need project knowledge, run \`mini-trellis mem recall\` yourself. If the excerpt does not answer the question, run \`mini-trellis mem read\` on the returned ref. After a confirmed decision, use the \`mini-trellis-remember\` skill. Compressed transcripts in \`~/.dsh/sessions\` are not read.
`;

/** Short skills only. No SessionStart, role agents, or shared `.agents/skills/` copy. */
export function collectDshTemplates(): Map<string, string> {
  const files = collectSkillTemplates(
    ".dsh/skills",
    resolveAllAsSkills(AI_TOOLS.dsh.templateContext),
    resolveBundledSkills(AI_TOOLS.dsh.templateContext),
  );
  const skill = ".dsh/skills/mini-trellis-session-insight/SKILL.md";
  const body = files.get(skill);
  if (body) files.set(skill, `${body.trimEnd()}\n${DSH_SKILL_NOTE}`);
  return files;
}
