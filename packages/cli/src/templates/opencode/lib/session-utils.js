/* global process */
import { existsSync, readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { execFileSync } from "child_process"
import { platform } from "os"
import { debugLog } from "./trellis-context.js"

const PYTHON_CMD = platform() === "win32" ? "python" : "python3"

const MAX_CONTEXT_CHARS = 4000

function loadTrellisConfig(directory, contextKey = null) {
  const scriptPath = join(directory, ".trellis", "scripts", "get_context.py")
  if (!existsSync(scriptPath)) {
    return { isMonorepo: false, packages: {}, specScope: null, activeTaskPackage: null, defaultPackage: null }
  }
  try {
    const output = execFileSync(PYTHON_CMD, [scriptPath, "--mode", "packages", "--json"], {
      cwd: directory,
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(contextKey ? { TRELLIS_CONTEXT_ID: contextKey } : {}),
      },
    })
    const data = JSON.parse(output)
    if (data.mode !== "monorepo") {
      return { isMonorepo: false, packages: {}, specScope: null, activeTaskPackage: null, defaultPackage: null }
    }
    const pkgDict = {}
    for (const pkg of (data.packages || [])) {
      pkgDict[pkg.name] = pkg
    }
    return {
      isMonorepo: true,
      packages: pkgDict,
      specScope: data.specScope || null,
      activeTaskPackage: data.activeTaskPackage || null,
      defaultPackage: data.defaultPackage || null,
    }
  } catch (e) {
    debugLog("session", "loadTrellisConfig error:", e.message)
    return { isMonorepo: false, packages: {}, specScope: null, activeTaskPackage: null, defaultPackage: null }
  }
}

function checkLegacySpec(directory, config) {
  if (!config.isMonorepo || Object.keys(config.packages).length === 0) {
    return null
  }

  const specDir = join(directory, ".trellis", "spec")
  if (!existsSync(specDir)) return null

  let hasLegacy = false
  for (const name of ["backend", "frontend"]) {
    if (existsSync(join(specDir, name, "index.md"))) {
      hasLegacy = true
      break
    }
  }
  if (!hasLegacy) return null

  const pkgNames = Object.keys(config.packages).sort()
  const missing = pkgNames.filter(name => !existsSync(join(specDir, name)))

  if (missing.length === 0) return null

  if (missing.length === pkgNames.length) {
    return (
      `[!] Legacy spec structure detected: found \`spec/backend/\` or \`spec/frontend/\` ` +
      `but no package-scoped \`spec/<package>/\` directories.\n` +
      `Monorepo packages: ${pkgNames.join(", ")}\n` +
      `Please reorganize: \`spec/backend/\` -> \`spec/<package>/backend/\``
    )
  }
  return (
    `[!] Partial spec migration detected: packages ${missing.join(", ")} ` +
    `still missing \`spec/<pkg>/\` directory.\n` +
    `Please complete migration for all packages.`
  )
}

function resolveSpecScope(config) {
  if (!config.isMonorepo || Object.keys(config.packages).length === 0) {
    return null
  }

  const { specScope, activeTaskPackage, defaultPackage, packages } = config
  if (specScope == null) return null

  if (specScope === "active_task") {
    if (activeTaskPackage && activeTaskPackage in packages) return new Set([activeTaskPackage])
    if (defaultPackage && defaultPackage in packages) return new Set([defaultPackage])
    return null
  }

  if (Array.isArray(specScope)) {
    const valid = new Set()
    for (const entry of specScope) {
      if (entry in packages) {
        valid.add(entry)
      }
    }
    if (valid.size > 0) return valid
    if (activeTaskPackage && activeTaskPackage in packages) return new Set([activeTaskPackage])
    if (defaultPackage && defaultPackage in packages) return new Set([defaultPackage])
    return null
  }

  return null
}

function collectSpecIndexPaths(directory, allowedPkgs) {
  const specDir = join(directory, ".trellis", "spec")
  const paths = []

  const guidesIndex = join(specDir, "guides", "index.md")
  if (existsSync(guidesIndex)) {
    paths.push(".trellis/spec/guides/index.md")
  }

  if (!existsSync(specDir)) return paths

  try {
    const subs = readdirSync(specDir).filter(name => {
      if (name.startsWith(".") || name === "guides") return false
      try {
        return statSync(join(specDir, name)).isDirectory()
      } catch {
        return false
      }
    }).sort()

    for (const sub of subs) {
      const indexFile = join(specDir, sub, "index.md")
      if (existsSync(indexFile)) {
        paths.push(`.trellis/spec/${sub}/index.md`)
      } else {
        if (allowedPkgs !== null && !allowedPkgs.has(sub)) continue
        try {
          const nested = readdirSync(join(specDir, sub)).filter(name => {
            try {
              return statSync(join(specDir, sub, name)).isDirectory()
            } catch {
              return false
            }
          }).sort()
          for (const layer of nested) {
            const nestedIndex = join(specDir, sub, layer, "index.md")
            if (existsSync(nestedIndex)) {
              paths.push(`.trellis/spec/${sub}/${layer}/index.md`)
            }
          }
        } catch {
          // Ignore directory read errors
        }
      }
    }
  } catch {
    // Ignore spec directory read errors
  }

  return paths
}

function readDeveloper(directory) {
  try {
    const content = readFileSync(join(directory, ".trellis", ".developer"), "utf-8")
    for (const line of content.split(/\r?\n/)) {
      if (line.startsWith("name=")) return line.slice("name=".length).trim()
    }
  } catch {
    // Ignore missing developer file
  }
  return "(not initialized)"
}

function runGit(directory, args) {
  try {
    return execFileSync("git", args, {
      cwd: directory,
      timeout: 3000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch {
    return ""
  }
}

function buildCompactCurrentState(ctx, specIndexPaths) {
  const directory = ctx.directory
  const lines = []
  lines.push(`Developer: ${readDeveloper(directory)}`)

  const branch = runGit(directory, ["branch", "--show-current"]) || "(detached)"
  const dirtyCount = runGit(directory, ["status", "--porcelain"])
    .split(/\r?\n/)
    .filter(line => line.trim()).length
  lines.push(`Git: branch ${branch}; ${dirtyCount === 0 ? "clean" : `dirty ${dirtyCount} paths`}.`)

  const developer = readDeveloper(directory)
  const workspaceDir = join(directory, ".trellis", "workspace", developer)
  if (developer !== "(not initialized)" && existsSync(workspaceDir)) {
    try {
      const journals = readdirSync(workspaceDir)
        .filter(name => /^journal-\d+\.md$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
      const journal = journals[journals.length - 1]
      if (journal) {
        const journalPath = join(workspaceDir, journal)
        const lineCount = readFileSync(journalPath, "utf-8").split(/\r?\n/).length
        lines.push(`Journal: .trellis/workspace/${developer}/${journal}, ${lineCount} / 2000 lines.`)
      }
    } catch {
      // Ignore journal errors
    }
  }

  if (specIndexPaths.length > 0) {
    lines.push(`Spec indexes: ${specIndexPaths.length} available.`)
  }

  lines.push("Research: use `mini-trellis mem recall <query>` when relevant.")

  return lines.join("\n")
}

export function buildSessionContext(ctx, platformInput = null) {
  const directory = ctx.directory
  const contextKey = typeof ctx.getContextKey === "function"
    ? ctx.getContextKey(platformInput)
    : null

  const config = loadTrellisConfig(directory, contextKey)
  const allowedPkgs = resolveSpecScope(config)
  const paths = collectSpecIndexPaths(directory, allowedPkgs)

  const parts = []

  parts.push(`<session-context>
mini-trellis SessionStart context. Orient from journal, spec, and research.
</session-context>`)

  const legacyWarning = checkLegacySpec(directory, config)
  if (legacyWarning) {
    parts.push(`<migration-warning>\n${legacyWarning}\n</migration-warning>`)
  }

  parts.push("<current-state>")
  parts.push(buildCompactCurrentState(ctx, paths))
  parts.push("</current-state>")

  parts.push("<guidelines>")
  parts.push(
    "Memory: use `mini-trellis mem recall <query>` for prior decisions, rejected " +
    "approaches, and project rules. If the excerpt answers the question with its " +
    "source and conditions, cite it and stop; use `mini-trellis mem read <ref>` " +
    "only for missing context. Do not repeat a sufficient lookup.\n" +
    "Research lives in `.trellis/research/`; durable rules belong in `.trellis/spec/`.\n" +
    "Record a confirmed decision, a rejected approach worth not retrying, or a useful " +
    "handoff with `/mini-trellis:remember` or `python3 ./.trellis/scripts/add_session.py`. " +
    "Do not record every turn, and do not create a git commit unless the user asks.\n"
  )


  parts.push("</guidelines>")

  parts.push(`<ready>
Context loaded. Use journal, spec, research, and \`mini-trellis mem\` on demand. Remember at session end or after compact.
</ready>`)

  const context = parts.join("\n\n")
  if (context.length <= MAX_CONTEXT_CHARS) return context
  const tail = context.slice(-300)
  return context.slice(0, MAX_CONTEXT_CHARS - tail.length - 80) +
    "\n[mini-trellis context truncated; read files on demand]\n" + tail
}

function getTrellisMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {}
  }

  const trellis = metadata.trellis
  if (!trellis || typeof trellis !== "object") {
    return {}
  }

  return trellis
}

function markPartAsSessionStart(part) {
  const metadata = part.metadata && typeof part.metadata === "object"
    ? part.metadata
    : {}
  part.metadata = {
    ...metadata,
    trellis: {
      ...getTrellisMetadata(metadata),
      sessionStart: true,
    },
  }
}

function hasSessionStartMarker(part) {
  if (!part || part.type !== "text" || typeof part.text !== "string") {
    return false
  }

  return getTrellisMetadata(part.metadata).sessionStart === true
}

export function hasInjectedTrellisContext(messages) {
  if (!Array.isArray(messages)) {
    return false
  }

  return messages.some(message => {
    if (!message?.info || message.info.role !== "user" || !Array.isArray(message.parts)) {
      return false
    }

    return message.parts.some(hasSessionStartMarker)
  })
}

export async function hasPersistedInjectedContext(client, directory, sessionID) {
  try {
    const response = await client.session.messages({
      path: { id: sessionID },
      query: { directory },
      throwOnError: true,
    })
    return hasInjectedTrellisContext(response.data || [])
  } catch (error) {
    debugLog(
      "session",
      "Failed to read session history for dedupe:",
      error instanceof Error ? error.message : String(error),
    )
    return false
  }
}

export function markContextInjected(part) {
  markPartAsSessionStart(part)
}
