/**
 * mini-trellis scaffolding templates written into `.trellis/`.
 * Scripts are copied from this directory by copyTrellisDir, not via these exports.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readTemplate(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

export const configYamlTemplate = readTemplate("config.yaml");
export const gitignoreTemplate = readTemplate("gitignore.txt");
export const gitattributesTemplate = readTemplate("gitattributes.txt");
