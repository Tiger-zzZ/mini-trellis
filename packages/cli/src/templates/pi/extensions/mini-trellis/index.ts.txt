import { existsSync, readFileSync, readdirSync } from "node:fs";
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

function countSpecIndexes(root: string): number {
  const specDir = join(root, ".trellis", "spec");
  if (!exists(specDir)) return 0;
  try {
    return readdirSync(specDir).filter((name) =>
      exists(join(specDir, name, "index.md")),
    ).length;
  } catch {
    return 0;
  }
}

function readDeveloper(root: string): string | null {
  try {
    const p = join(root, ".trellis", ".developer");
    if (!exists(p)) return null;
    const name = readFileSync(p, "utf-8")
      .split(/\r?\n/)
      .find((line) => line.startsWith("name="))
      ?.slice("name=".length)
      .trim();
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
  const journal = activeJournal(root);
  const specCount = countSpecIndexes(root);
  return `<session-context>
mini-trellis memory is available on demand. Do not announce this hook.
Use \`mini-trellis mem recall <query>\` for relevant prior decisions or conventions;
include the affected path/identifier when useful. Unrelated edits need no history lookup.
Use \`mini-trellis mem read <ref>\` only if an excerpt lacks needed context or qualifiers.
Reuse evidence already in the current context; recall again after compact or when a
source changes or disappears. Never treat stale or missing sources as current rules.
Keep confirmed decisions in \`.trellis/research/<topic>.md\` and lasting rules in \`.trellis/spec/\`.
A rejected approach that later work should not retry can be recorded and labeled rejected.
Record with \`/mini-trellis-remember\` or \`python3 ./.trellis/scripts/add_session.py\`. Ordinary edits and unconfirmed
guesses are not new decisions. Do not create a git commit unless the user explicitly asks.
</session-context>` + (journal ? `\nJournal: ${journal}` : "") +
    (specCount ? `\nSpec indexes: ${specCount} available.` : "");
}

export default function trellisExtension(pi: {
  on?: (
    event: string,
    handler: (event: unknown, ctx?: PiExtensionContext) => unknown,
  ) => void;
}): void {
  if (process.env.TRELLIS_SUBAGENT_CHILD === "1") return;
  const root = findRoot(process.cwd() || homedir());

  pi.on?.("before_agent_start", (event) => {
    const cur = (event as { systemPrompt?: string }).systemPrompt ?? "";
    const startup = buildStartupContext(root);
    if (cur.includes(startup)) return { systemPrompt: cur };
    return {
      systemPrompt: [cur, startup].filter(Boolean).join("\n\n"),
    };
  });

  pi.on?.("context", () => {
    // keep extension loaded; no extra injection
  });

  void (0 as unknown as JsonObject);
}
