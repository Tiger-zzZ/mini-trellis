/* global process */
/**
 * Trellis Session Start Plugin
 *
 * Injects compact SessionStart context into the copy of the latest user
 * message that OpenCode sends to the model. Uses
 * `experimental.chat.messages.transform` so TUI / Web / SQLite history
 * stay untouched (issue #553).
 */

import { TrellisContext, debugLog, isTrellisSubagent } from "../lib/trellis-context.js"
import {
  MESSAGES_TRANSFORM_HOOK,
  platformInputFromMessages,
  prependEphemeralText,
} from "../lib/context-visibility.js"
import { buildSessionContext } from "../lib/session-utils.js"
import { writeRuntimeStatus } from "../lib/runtime-status.js"

// OpenCode 1.2.x expects plugins to be factory functions (see inject-subagent-context.js comment).
export default async ({ directory }) => {
  const ctx = new TrellisContext(directory)
  debugLog("session", "Plugin loaded, directory:", directory)

  return {
    [MESSAGES_TRANSFORM_HOOK]: async (_input, output) => {
      try {
        const messages = output?.messages
        const platformInput = platformInputFromMessages(messages)
        const agent = platformInput?.agent || "unknown"
        debugLog("session", "messages.transform called, agent:", agent)

        if (isTrellisSubagent(platformInput)) {
          debugLog("session", "Skipping trellis subagent turn:", agent)
          return
        }

        if (process.env.TRELLIS_HOOKS === "0" || process.env.TRELLIS_DISABLE_HOOKS === "1") {
          debugLog("session", "Skipping - TRELLIS_HOOKS disabled")
          return
        }

        if (!ctx.isTrellisProject()) return

        const context = buildSessionContext(ctx, platformInput)
        // Normalize all retained entries, even when one already matches.
        // Otherwise an older conflicting entry can survive beside it.
        debugLog("session", "Built context, length:", context.length)
        if (prependEphemeralText(messages, context)) writeRuntimeStatus(directory, "ok", context.length)
        else writeRuntimeStatus(directory, "skipped", 0, "no-user-message")
      } catch (error) {
        const category = error instanceof Error ? error.name : "UnknownError"
        debugLog("session", "Error in messages.transform:", category)
        writeRuntimeStatus(directory, "error", 0, category)
      }
    },
  }
}
