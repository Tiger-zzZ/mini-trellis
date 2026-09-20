import { createTemplateReader, type HookTemplate } from "../template-utils.js";

const { getSettings, readTemplate } = createTemplateReader(import.meta.url);

export function getSettingsTemplate(): HookTemplate {
  return getSettings();
}

export function getExtensionTemplate(): string {
  return readTemplate("extensions/mini-trellis/index.ts.txt");
}
