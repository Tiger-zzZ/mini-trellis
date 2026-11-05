import { mkdirSync, renameSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

/** Best-effort diagnostics without prompt text, session identifiers or secrets. */
export function writeRuntimeStatus(directory, status, outputChars = 0, errorCategory) {
  const target = join(directory, ".trellis", ".runtime", "hooks", "opencode.json")
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    mkdirSync(join(directory, ".trellis", ".runtime", "hooks"), { recursive: true })
    writeFileSync(temporary, JSON.stringify({ schema: 1, platform: "opencode", last_hook_at: new Date().toISOString(), last_status: status, last_output_chars: outputChars, ...(errorCategory ? { last_error_category: errorCategory } : {}) }) + "\n")
    renameSync(temporary, target)
  } catch {
    try { rmSync(temporary, { force: true }) } catch { /* Diagnostics must not block a session. */ }
  }
}
