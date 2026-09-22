import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

type JsonObject = Record<string, unknown>;

interface PiExtensionContext {
  ui?: {
    notify?: (msg: string, type?: "info" | "warning" | "error") => void;
  };
}

function exists(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (exists(join(dir, ".trellis"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function collectResearchTopics(root: string): string[] {
  const researchDir = join(root, ".trellis", "research");
  if (!exists(researchDir)) return [];
  try {
    return readdirSync(researchDir)
      .filter((name) => {
        if (name.startsWith(".") || name.toLowerCase() === "readme.md") return false;
        try {
          return statSync(join(researchDir, name)).isFile() && name.toLowerCase().endsWith(".md");
        } catch {
          return false;
        }
      })
      .sort()
      .map((name) => `.trellis/research/${name}`);
  } catch {
    return [];
  }
}

function collectSpecIndexPaths(root: string): string[] {
  const specDir = join(root, ".trellis", "spec");
  const paths: string[] = [];
  const guidesIndex = join(specDir, "guides", "index.md");
  if (exists(guidesIndex)) paths.push(".trellis/spec/guides/index.md");
  if (!exists(specDir)) return paths;
  try {
    for (const sub of readdirSync(specDir).sort()) {
      if (sub.startsWith(".") || sub === "guides") continue;
      const indexFile = join(specDir, sub, "index.md");
      if (exists(indexFile)) paths.push(`.trellis/spec/${sub}/index.md`);
    }
  } catch {
    // ignore
  }
  return paths;
}

function readDeveloper(root: string): string | null {
  try {
    const p = join(root, ".trellis", ".developer");
    if (!exists(p)) return null;
    const name = readFileSync(p, "utf-8").trim();
    return name || null;
  } catch {
    return null;
  }
}

function activeJournal(root: string): string | null {
  const developer = readDeveloper(root);
  if (!developer) return null;
  const workspaceDir = join(root, ".trellis", "workspace", developer);
  if (!exists(workspaceDir)) return null;
  try {
    const journals = readdirSync(workspaceDir)
      .filter((name) => /^journal-\d+\.md$/.test(name))
      .sort(
        (a, b) =>
          Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0),
      );
    const journal = journals[journals.length - 1];
    return journal ? `.trellis/workspace/${developer}/${journal}` : null;
  } catch {
    return null;
  }
}

function buildStartupContext(root: string): string {
  const spec = collectSpecIndexPaths(root);
  const research = collectResearchTopics(root);
  const journal = activeJournal(root);
  const lines: string[] = [
    "<session-context>",
    "mini-trellis SessionStart context. Orient from journal, spec, and research.",
    "</session-context>",
    "",
    "<current-state>",
  ];
  if (journal) lines.push(`Journal: ${journal}`);
  if (spec.length) lines.push(`Spec indexes: ${spec.length} available.`);
  lines.push(
    research.length
      ? `Research notes: ${research.length} in .trellis/research/.`
      : "Research notes: none yet. Write .trellis/research/<topic>.md.",
  );
  lines.push("</current-state>", "", "<guidelines>");
  lines.push(
    "Memory: journal is git-durable session notes (`/mini-trellis-remember` or `python3 ./.trellis/scripts/add_session.py`). Cross-session dialogue is `mini-trellis mem list|search|context|extract`.",
    "Research lives in `.trellis/research/<topic>.md`; promote durable boundaries into `.trellis/spec/` as short markdown.",
  );
  if (spec.length) {
    lines.push("", "## Spec indexes (read on demand)");
    for (const p of spec) lines.push(`- ${p}`);
  }
  if (research.length) {
    lines.push("", "## Research notes (read on demand)");
    for (const p of research) lines.push(`- ${p}`);
  }
  lines.push(
    "</guidelines>",
    "",
    "<ready>",
    "Context loaded. Use journal, spec, research, and `mini-trellis mem` on demand. Remember at session end or after compact.",
    "</ready>",
  );
  return lines.join("\n");
}

export default function trellisExtension(pi: {
  on?: (
    event: string,
    handler: (event: unknown, ctx?: PiExtensionContext) => unknown,
  ) => void;
}): void {
  if (process.env.TRELLIS_SUBAGENT_CHILD === "1") return;
  const root = findRoot(process.cwd() || homedir());
  const startup = buildStartupContext(root);

  pi.on?.("session_start", (_event, ctx) => {
    ctx?.ui?.notify?.(
      "mini-trellis context is available. Use /mini-trellis-remember to persist journal notes.",
      "info",
    );
  });

  pi.on?.("before_agent_start", (event) => {
    const cur = (event as { systemPrompt?: string }).systemPrompt ?? "";
    return {
      systemPrompt: [cur, startup].filter(Boolean).join("\n\n"),
    };
  });

  pi.on?.("context", () => {
    // keep extension loaded; no extra injection
  });

  void (0 as unknown as JsonObject);
}
