/**
 * Claude Code templates — settings only.
 * Hooks come from shared-hooks/. Commands come from common/.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const settingsTemplate = readFileSync(
  join(__dirname, "settings.json"),
  "utf-8",
);

export interface SettingsTemplate {
  targetPath: string;
  content: string;
}

export function getSettingsTemplate(): SettingsTemplate {
  return {
    targetPath: "settings.json",
    content: settingsTemplate,
  };
}
