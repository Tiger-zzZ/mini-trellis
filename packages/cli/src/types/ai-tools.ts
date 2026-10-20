/**
 * AI Tool Types and Registry — mini-trellis v1 hosts only.
 */

export type AITool =
  | "claude-code"
  | "codex"
  | "opencode"
  | "pi"
  | "dsh"
  | "cursor";

export type TemplateDir = "common" | "claude" | "codex" | "opencode" | "pi";

export type CliFlag = "claude" | "codex" | "opencode" | "pi" | "dsh" | "cursor";

export interface TemplateContext {
  cmdRefPrefix: "/mini-trellis:" | "/mini-trellis-" | "$";
  executorAI: "Bash scripts or Task calls" | "Bash scripts or tool calls";
  userActionLabel: "Slash commands" | "Skills";
  agentCapable: boolean;
  hasHooks: boolean;
  cliFlag: CliFlag;
}

export interface AIToolConfig {
  name: string;
  templateDirs: TemplateDir[];
  configDir: string;
  supportsAgentSkills?: boolean;
  extraManagedPaths?: string[];
  cliFlag: CliFlag;
  defaultChecked: boolean;
  hasPythonHooks: boolean;
  templateContext: TemplateContext;
}

export const AI_TOOLS: Record<AITool, AIToolConfig> = {
  "claude-code": {
    name: "Claude Code",
    templateDirs: ["common", "claude"],
    configDir: ".claude",
    cliFlag: "claude",
    defaultChecked: true,
    hasPythonHooks: true,
    templateContext: {
      cmdRefPrefix: "/mini-trellis:",
      executorAI: "Bash scripts or Task calls",
      userActionLabel: "Slash commands",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "claude",
    },
  },
  opencode: {
    name: "OpenCode",
    templateDirs: ["common", "opencode"],
    configDir: ".opencode",
    cliFlag: "opencode",
    defaultChecked: false,
    hasPythonHooks: false,
    templateContext: {
      cmdRefPrefix: "/mini-trellis:",
      executorAI: "Bash scripts or Task calls",
      userActionLabel: "Slash commands",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "opencode",
    },
  },
  codex: {
    name: "Codex",
    templateDirs: ["common", "codex"],
    configDir: ".codex",
    supportsAgentSkills: true,
    cliFlag: "codex",
    defaultChecked: false,
    hasPythonHooks: true,
    templateContext: {
      cmdRefPrefix: "$",
      executorAI: "Bash scripts or tool calls",
      userActionLabel: "Skills",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "codex",
    },
  },
  pi: {
    name: "Pi Agent",
    templateDirs: ["common", "pi"],
    configDir: ".pi",
    supportsAgentSkills: true,
    cliFlag: "pi",
    defaultChecked: false,
    hasPythonHooks: false,
    templateContext: {
      cmdRefPrefix: "/mini-trellis-",
      executorAI: "Bash scripts or tool calls",
      userActionLabel: "Slash commands",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "pi",
    },
  },
  /**
   * DeepSeek Harness — pull-based. Skills live in `.dsh/skills/`.
   * There is no project SessionStart file this CLI may write.
   * `~/.dsh/sessions` transcripts are not parsed.
   */
  dsh: {
    name: "DeepSeek Harness",
    templateDirs: ["common"],
    configDir: ".dsh",
    cliFlag: "dsh",
    defaultChecked: false,
    hasPythonHooks: false,
    templateContext: {
      cmdRefPrefix: "/mini-trellis-",
      executorAI: "Bash scripts or tool calls",
      userActionLabel: "Skills",
      agentCapable: true,
      hasHooks: false,
      cliFlag: "dsh",
    },
  },
  /**
   * Cursor — project skills plus a local sessionStart hook.
   * Cloud agents do not run sessionStart. Conversation history is not parsed.
   */
  cursor: {
    name: "Cursor",
    templateDirs: ["common"],
    configDir: ".cursor",
    cliFlag: "cursor",
    defaultChecked: false,
    hasPythonHooks: true,
    templateContext: {
      cmdRefPrefix: "/mini-trellis-",
      executorAI: "Bash scripts or tool calls",
      userActionLabel: "Skills",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "cursor",
    },
  },
};

export function getToolConfig(tool: AITool): AIToolConfig {
  return AI_TOOLS[tool];
}

export function getManagedPaths(tool: AITool): string[] {
  const config = AI_TOOLS[tool];
  const paths = [config.configDir];
  if (config.supportsAgentSkills) {
    paths.push(".agents/skills");
  }
  if (config.extraManagedPaths) {
    paths.push(...config.extraManagedPaths);
  }
  return paths;
}

export function getTemplateDirs(tool: AITool): TemplateDir[] {
  return AI_TOOLS[tool].templateDirs;
}
