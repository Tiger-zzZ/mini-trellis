/* global process */
/**
 * Trellis Workflow State Injection Plugin
 *
 * Mini-trellis: per-turn workflow breadcrumbs are disabled.
 * OpenCode 1.2.x still loads every plugin factory; return no hooks.
 */

import { debugLog } from "../lib/trellis-context.js"

export default async ({ directory }) => {
  debugLog(
    "workflow-state",
    "Disabled: mini-trellis does not inject per-turn workflow breadcrumbs, directory:",
    directory,
  )
  return {}
}
