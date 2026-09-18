/**
 * AI Tool Types and Registry — mini-trellis v1 hosts only.
 */

export type AITool = "claude-code" | "codex" | "opencode" | "pi";

export type TemplateDir = "common" | "claude" | "codex" | "opencode" | "pi";

export type CliFlag = "claude" | "codex" | "opencode" | "pi";

export interface TemplateContext {
  cmdRefPrefix: "/trellis:" | "/trellis-" | "$";
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
      cmdRefPrefix: "/trellis:",
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
      cmdRefPrefix: "/trellis:",
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
      cmdRefPrefix: "/trellis-",
      executorAI: "Bash scripts or tool calls",
      userActionLabel: "Slash commands",
      agentCapable: true,
      hasHooks: true,
      cliFlag: "pi",
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
