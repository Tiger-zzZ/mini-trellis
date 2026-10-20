/**
 * Cursor templates — project hooks.json only.
 * SessionStart script comes from shared-hooks/.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getHooksConfig(): string {
  return readFileSync(join(__dirname, "hooks.json"), "utf-8");
}
