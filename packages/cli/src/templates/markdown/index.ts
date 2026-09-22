/**
 * Markdown templates for the mini-trellis memory skeleton.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readLocalTemplate(filename: string): string {
  return readFileSync(join(__dirname, filename), "utf-8");
}

export const agentsMdContent: string = readLocalTemplate("agents.md");

export const workspaceIndexContent: string =
  readLocalTemplate("workspace-index.md");

export const agentProgressIndexContent = workspaceIndexContent;

export const researchReadmeContent: string =
  readLocalTemplate("research-readme.md");

export const guidesIndexContent: string = readLocalTemplate(
  "spec/guides/index.md.txt",
);

export const miniMemoryGuideContent: string = readLocalTemplate(
  "spec/guides/mini-memory.md.txt",
);
