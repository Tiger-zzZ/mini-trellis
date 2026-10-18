/**
 * Persisted Codex session reader.
 *
 * Layout: `~/.codex/sessions/**\/rollout-<ts>-<id>.jsonl`. Metadata is read
 * from the first event's `payload`; the filename timestamp is a fallback
 * `created`.
 *
 * Compaction: a top-level `compacted` event marks where Codex cut its own
 * context. Its `payload.replacement_history` is NOT a summary — measured over
 * 1865 local rollouts it is a verbatim retained slice of the conversation
 * (268k `message/user` items, 3 `message/assistant`). In a resumed session it
 * is the only place the earlier conversation exists at all. So the boundary is
 * marked, the already-collected turns are kept, and `replacement_history` is
 * merged in with occurrence-counted dedupe — turns already in the pool are not
 * re-added, turns only Codex retained are recovered.
 *
 * Multi-agent: `response_item` / `agent_message` events carry
 * `Message Type: NEW_TASK | MESSAGE | FINAL_ANSWER` envelopes. Only
 * `FINAL_ANSWER` has a plaintext payload; `NEW_TASK` / `MESSAGE` payloads are
 * `encrypted_content` and cannot be read back, which is reported rather than
 * papered over. `event_msg` / `agent_message` is a byte-identical duplicate of
 * the following `response_item` / `message` / `assistant` and stays excluded.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  compactionBoundaryTurn,
  stripInjectionTags,
  isBootstrapTurn,
  turnKey,
} from "../dialogue.js";
import { inRangeOverlap, sameProject } from "../filter.js";
import { readJsonl, readJsonlFirst } from "../internal/jsonl.js";
import { CODEX_SESSIONS, walkDir } from "../internal/paths.js";
import { parseTaskPyCommandsAll } from "../phase.js";
import { searchInDialogue } from "../search.js";
import type {
  DialogueRole,
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  MemWarning,
  SearchHit,
  TaskPyEvent,
} from "../types.js";

// ---------- loose external shapes ----------

interface CodexContentPart {
  type?: string;
  text?: string;
}

interface CodexCompactedItem {
  type?: string;
  role?: string;
  content?: CodexContentPart[];
}

interface CodexPayload {
  type?: string;
  role?: string;
  cwd?: string;
  id?: string;
  content?: CodexContentPart[];
  replacement_history?: CodexCompactedItem[];
  name?: unknown;
  arguments?: unknown;
}

interface CodexEvent {
  timestamp?: string;
  type?: string;
  payload?: CodexPayload;
}

function parseDialogueRole(v: unknown): DialogueRole | undefined {
  return v === "user" || v === "assistant" ? v : undefined;
}

/**
 * Recover the shell command string from a Codex `function_call` event's
 * `arguments` field. Codex versions vary in how they encode it:
 *
 *   - a raw shell string
 *   - a stringified JSON object with `cmd` / `command` (string) or
 *     `argv` (string[] — joined with spaces)
 *   - a raw object with the same `cmd` / `command` / `argv` shape
 *
 * Returns `undefined` when no command can be recovered.
 */
export function commandFromCodexArguments(argsRaw: unknown): string | undefined {
  const fromObject = (obj: Record<string, unknown>): string | undefined => {
    const cmd = obj.cmd;
    if (typeof cmd === "string") return cmd;
    const command = obj.command;
    if (typeof command === "string") return command;
    const argv = obj.argv;
    if (Array.isArray(argv)) {
      const parts = argv.filter((a): a is string => typeof a === "string");
      if (parts.length) return parts.join(" ");
    }
    return undefined;
  };

  if (typeof argsRaw === "string") {
    try {
      const parsed: unknown = JSON.parse(argsRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return fromObject(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON — some Codex versions inline the raw shell string.
      return argsRaw;
    }
    return undefined;
  }

  if (argsRaw && typeof argsRaw === "object" && !Array.isArray(argsRaw)) {
    return fromObject(argsRaw as Record<string, unknown>);
  }

  return undefined;
}

// ---------- list ----------

export function codexListSessions(
  f: MemFilter,
  warnings: MemWarning[] = [],
): MemSessionInfo[] {
  if (!fs.existsSync(CODEX_SESSIONS)) return [];
  const out: MemSessionInfo[] = [];
  for (const file of walkDir(CODEX_SESSIONS)) {
    if (!file.endsWith(".jsonl")) continue;
    const base = path.basename(file, ".jsonl");
    const m = base.match(
      /^rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)$/,
    );
    try {
      fs.accessSync(file, fs.constants.R_OK);
      const tsFromName = m?.[1]
        ? new Date(
            m[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3") + "Z",
          ).toISOString()
        : undefined;

      const first = readJsonlFirst<CodexEvent>(file);
      const meta = first?.payload;
      const id = meta?.id ?? m?.[2] ?? base;
      const cwd = meta?.cwd;
      const created = first?.timestamp ?? tsFromName ?? "";

      if (f.cwd && !sameProject(cwd, f.cwd)) continue;
      const updated = fs.statSync(file).mtime.toISOString();
      if (!inRangeOverlap(created, updated, f)) continue;

      out.push({
        platform: "codex",
        id,
        cwd,
        created,
        updated,
        filePath: file,
      });
    } catch (error) {
      const id = m?.[2] ?? base;
      const message = error instanceof Error ? error.message : String(error);
      warnings.push({
        code: "session-history-unreadable",
        message: `cannot read session ${id} (${file}): ${message}`,
      });
    }
  }
  return out;
}

// ---------- extract ----------

function buildTurnFromMessage(
  role: DialogueRole,
  parts: CodexContentPart[] | undefined,
): DialogueTurn | null {
  const collected: string[] = [];
  let totalRaw = 0;
  for (const c of parts ?? []) {
    const txt = c.text;
    if (typeof txt !== "string") continue;
    if (c.type !== "input_text" && c.type !== "output_text") continue;
    totalRaw += txt.length;
    const cleaned = stripInjectionTags(txt);
    if (cleaned) collected.push(cleaned);
  }
  if (!collected.length) return null;
  const merged = collected.join("\n\n");
  if (isBootstrapTurn(merged, totalRaw)) return null;
  return { role, text: merged };
}

/**
 * Turn pool with occurrence-counted dedupe.
 *
 * A plain `Set` of texts would be wrong: `ok` / `继续` are sent dozens of times
 * in one real session and each is its own turn. Counting occurrences means a
 * `replacement_history` copy of a turn already in the pool is skipped exactly
 * once per copy, and genuine repeats survive.
 */
class CodexTurnPool {
  private turns: DialogueTurn[] = [];
  private readonly counts = new Map<string, number>();

  push(turn: DialogueTurn): void {
    this.turns.push(turn);
    this.bump(turn);
  }

  get length(): number {
    return this.turns.length;
  }

  toArray(): DialogueTurn[] {
    return this.turns;
  }

  private bump(turn: DialogueTurn): void {
    if (turn.kind === "marker") return;
    const k = turnKey(turn);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }

  /**
   * Merge the dialogue Codex retained across a compaction. Anything already in
   * the pool is dropped; the rest is inserted ahead of the collected turns,
   * because retained history is chronologically the prefix of what this file
   * shows. Returns the recovered turns so the caller can shift event indices.
   *
   * On a second or later compaction, "ahead of everything" also puts recovered
   * turns ahead of the earlier boundary marker, which is only an approximation
   * of where they belong. Measured over the 365 local rollouts with two or more
   * compactions: 32 items are recovered that late and all 32 are re-injected
   * AGENTS.md / plugin preamble, not dialogue. Revisit if that ever changes.
   */
  absorbRetainedHistory(items: readonly CodexCompactedItem[]): DialogueTurn[] {
    const consumed = new Map<string, number>();
    const recovered: DialogueTurn[] = [];
    for (const item of items) {
      if (item.type !== "message") continue;
      const role = parseDialogueRole(item.role);
      if (!role) continue;
      const turn = buildTurnFromMessage(role, item.content);
      if (!turn) continue;
      const k = turnKey(turn);
      const alreadyInPool = this.counts.get(k) ?? 0;
      const used = consumed.get(k) ?? 0;
      if (used < alreadyInPool) {
        consumed.set(k, used + 1);
        continue;
      }
      recovered.push(turn);
      consumed.set(k, used + 1);
    }
    if (recovered.length > 0) {
      this.turns = [...recovered, ...this.turns];
      for (const turn of recovered) this.bump(turn);
    }
    return recovered;
  }
}

/** Inter-agent envelope header, e.g. `Message Type: FINAL_ANSWER`. */
const AGENT_ENVELOPE_KIND = /^Message Type:\s*(\S+)/;

interface CodexAgentEnvelope {
  kind: string;
  /** Plaintext payload; empty when Codex encrypted it. */
  body: string;
  encrypted: boolean;
}

/**
 * Parse a `response_item` / `agent_message` envelope. The `input_text` part is
 * always the header (`Message Type` / `Task name` / `Sender` / `Payload:`); the
 * payload follows `Payload:` when it is plaintext, and sits in a sibling
 * `encrypted_content` part when it is not.
 */
function parseCodexAgentEnvelope(
  parts: CodexContentPart[] | undefined,
): CodexAgentEnvelope | null {
  let header = "";
  let encrypted = false;
  for (const part of parts ?? []) {
    if (part.type === "encrypted_content") {
      encrypted = true;
      continue;
    }
    if (part.type !== "input_text" && part.type !== "output_text") continue;
    if (typeof part.text === "string") header += part.text;
  }
  if (!header) return null;
  const kind = AGENT_ENVELOPE_KIND.exec(header)?.[1];
  if (!kind) return null;
  const marker = header.indexOf("Payload:");
  const body = marker === -1 ? "" : header.slice(marker + "Payload:".length);
  return { kind, body: body.trim(), encrypted };
}

/**
 * A `FINAL_ANSWER` travels sub-agent → parent, so from the reading session's
 * point of view it is assistant output; every other envelope is an instruction
 * flowing towards an agent, i.e. the user side.
 */
function agentEnvelopeRole(kind: string): DialogueRole {
  return kind === "FINAL_ANSWER" ? "assistant" : "user";
}

const WARN_ENCRYPTED_INTER_AGENT = "codex-inter-agent-encrypted";
const WARN_COMPACTION_LOSSY = "codex-compaction-assistant-dropped";

function pushWarningOnce(
  warnings: MemWarning[] | undefined,
  code: string,
  message: string,
): void {
  if (!warnings) return;
  if (warnings.some((w) => w.code === code)) return;
  warnings.push({ code, message });
}

export function codexExtractDialogue(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): DialogueTurn[] {
  return collectCodexTurnsAndEvents(s, warnings).turns;
}

export function codexSearch(s: MemSessionInfo, kw: string): SearchHit {
  // No warnings sink: search fans out over the whole corpus and a per-session
  // notice would be printed thousands of times.
  return searchInDialogue(codexExtractDialogue(s), kw);
}

/**
 * Codex twin of `collectClaudeTurnsAndEvents`. Single pass over the rollout
 * file; emits both the cleaned dialogue turns and the list of
 * `task.py create|start` invocations found inside `function_call` events whose
 * `name === "exec_command"` (or `"shell"`).
 *
 * Compaction keeps everything: collected turns stay, retained history is merged
 * ahead of them, and a boundary marker records the cut. Event `turnIndex`es
 * recorded before a compaction are shifted by the number of recovered turns so
 * brainstorm windows keep pointing at the same conversation.
 */
export function collectCodexTurnsAndEvents(
  s: MemSessionInfo,
  warnings?: MemWarning[],
): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
} {
  const pool = new CodexTurnPool();
  const events: TaskPyEvent[] = [];
  let encryptedInterAgent = 0;

  readJsonl<CodexEvent>(s.filePath, (obj) => {
    if (obj.type === "compacted") {
      const rh = obj.payload?.replacement_history;
      const recovered = Array.isArray(rh) ? pool.absorbRetainedHistory(rh) : [];
      if (recovered.length > 0) {
        for (const ev of events) ev.turnIndex += recovered.length;
        if (!recovered.some((t) => t.role === "assistant")) {
          pushWarningOnce(
            warnings,
            WARN_COMPACTION_LOSSY,
            `session ${s.id}: recovered ${recovered.length} pre-compaction turn(s) from Codex's retained history, but it retains user messages only — assistant replies from before the boundary are not in this file.`,
          );
        }
      }
      pool.push(
        compactionBoundaryTurn(
          recovered.length > 0
            ? `context compacted here; ${recovered.length} earlier turn(s) recovered from the platform's retained history`
            : `context compacted here; the platform's retained history added nothing beyond the turns above`,
        ),
      );
      return;
    }

    const p = obj.payload;
    if (!p) return;

    if (p.type === "agent_message" && obj.type === "response_item") {
      const envelope = parseCodexAgentEnvelope(p.content);
      if (!envelope) return;
      if (!envelope.body) {
        if (envelope.encrypted) encryptedInterAgent++;
        return;
      }
      const cleaned = stripInjectionTags(envelope.body);
      if (!cleaned) return;
      pool.push({ role: agentEnvelopeRole(envelope.kind), text: cleaned });
      return;
    }

    if (p.type === "function_call") {
      const fnName = p.name;
      if (fnName !== "exec_command" && fnName !== "shell") return;
      const cmd = commandFromCodexArguments(p.arguments);
      if (!cmd) return;
      const parsedAll = parseTaskPyCommandsAll(cmd);
      for (const parsed of parsedAll) {
        const ev: TaskPyEvent = {
          action: parsed.action,
          timestamp: obj.timestamp ?? "",
          turnIndex: pool.length,
          ...(parsed.action === "create"
            ? { slug: parsed.slug }
            : { taskDir: parsed.taskDir }),
        };
        events.push(ev);
      }
      return;
    }

    if (p.type !== "message") return;
    const role = parseDialogueRole(p.role);
    if (!role) return;
    const turn = buildTurnFromMessage(role, p.content);
    if (turn) pool.push(turn);
  });

  if (encryptedInterAgent > 0) {
    pushWarningOnce(
      warnings,
      WARN_ENCRYPTED_INTER_AGENT,
      `session ${s.id}: ${encryptedInterAgent} inter-agent message payload(s) are stored encrypted by Codex and cannot be read back — the instructions driving this multi-agent run are not recoverable from the rollout.`,
    );
  }

  return { turns: pool.toArray(), events };
}
