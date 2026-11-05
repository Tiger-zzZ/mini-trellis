/* global process */
import { TrellisContext, debugLog } from "../../lib/trellis-context.js"
import { buildSessionContext } from "../../lib/session-utils.js"
import { writeRuntimeStatus } from "../../lib/runtime-status.js"

const MARKER = "<session-context>\nmini-trellis SessionStart context."

// OpenCode 2.2.0 Plugin.define is an identity function. Plain JS avoids an
// install-time SDK dependency; the loader validates this id/setup definition.
export default {
  id: "mini-trellis",
  async setup(ctx) {
    await ctx.session.hook("context", async event => {
      let directory
      try {
        if (process.env.TRELLIS_HOOKS === "0" || process.env.TRELLIS_DISABLE_HOOKS === "1") return
        const session = await ctx.session.get({ sessionID: event.sessionID })
        directory = session.location?.directory
        if (typeof directory !== "string") throw new Error("Session location is unavailable")
        const memory = new TrellisContext(directory)
        if (!memory.isTrellisProject()) return
        const text = buildSessionContext(memory, { sessionID: event.sessionID })
        // Each outgoing request is ephemeral. Rebuild from the current project,
        // replacing our own previous entry if another hook retained it.
        event.system = event.system.filter(part => !(part?.type === "text" && part.text?.startsWith(MARKER)))
        event.system.push({ type: "text", text })
        writeRuntimeStatus(directory, "ok", text.length)
      } catch (error) {
        const category = error instanceof Error ? error.name : "UnknownError"
        debugLog("session", "V2 context hook failed:", category)
        if (directory) writeRuntimeStatus(directory, "error", 0, category)
      }
    })
  },
}
