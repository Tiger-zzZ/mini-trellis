/**
 * Codex templates — hooks.json + config.toml.
 * SessionStart script comes from shared-hooks/.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

export interface ConfigTemplate {
  targetPath: string;
  content: string;
}

export function getHooksConfig(): string {
  return readTemplate("hooks.json");
}

export function getConfigTemplate(): ConfigTemplate {
  return {
    targetPath: "config.toml",
    content: readTemplate("config.toml"),
  };
}
