/**
 * Public input / output types for `@mindfoldhq/trellis-core/mem`.
 *
 * This model serves persisted AI-session retrieval and dialogue-context
 * extraction only. It is intentionally separate from the channel event schema:
 * channel keeps its own event log as the source of truth, and v1 mem never
 * reads channel events.
 */

export const MEM_SOURCE_KINDS = ["claude", "codex", "opencode", "pi"] as const;
export type MemSourceKind = (typeof MEM_SOURCE_KINDS)[number];
export type MemSourceFilter = MemSourceKind | "all";
export type MemPhase = "brainstorm" | "implement" | "all";
export type DialogueRole = "user" | "assistant";

export interface DialogueTurn {
  role: DialogueRole;
  text: string;
  /**
   * `"marker"` annotates a compaction boundary rather than a spoken turn. It
   * stays in the pool so `extract` / `context` can show where the model's own
   * context was cut, and is skipped by search scoring — the platform's summary
   * restates turns that are now in the pool themselves, and counting both would
   * score the same topic twice.
   */
  kind?: "marker";
}

/**
 * Cross-cutting session selection filter. Every field is optional — `platform`
 * defaults to `"all"` and `limit` defaults to `50` when omitted. `cwd` scopes
 * to a project directory (and its descendants); leave it `undefined` for a
 * global search.
 */
export interface MemFilter {
  platform?: MemSourceFilter;
  since?: Date;
  until?: Date;
  cwd?: string;
  limit?: number;
}

/** Unified session metadata across platforms. JSON field names (`platform`,
 * `parent_id`, `filePath`) are kept stable for user-visible output. */
export interface MemSessionInfo {
  platform: MemSourceKind;
  id: string;
  title?: string;
  cwd?: string;
  created?: string;
  updated?: string;
  filePath: string;
  /** OpenCode only: parent session id (sub-agent chain). */
  parent_id?: string;
}

export interface SearchExcerpt {
  role: DialogueRole;
  snippet: string;
}

/** Per-session search hit: occurrence counts plus paragraph-aligned excerpts. */
export interface SearchHit {
  /** Total token occurrences across all matching turns. */
  count: number;
  /** Breakdown: user-turn occurrences. */
  userCount: number;
  /** Breakdown: assistant-turn occurrences. */
  asstCount: number;
  /** Size of the cleaned dialogue (denominator for relevance density). */
  totalTurns: number;
  excerpts: SearchExcerpt[];
}

/** Non-fatal warning surfaced from a core call — the caller decides how (and
 * whether) to render it. */
export interface MemWarning {
  code: string;
  message: string;
}

export interface MemSearchMatch {
  session: MemSessionInfo;
  /** Weighted-density relevance score. */
  score: number;
  hit: SearchHit;
  /** Sub-agent descendants merged into this match (OpenCode `--include-children`). */
  descendantsMerged: number;
}

export interface MemSearchResult {
  /** Ranked matches, already capped to the filter's `limit`. */
  matches: MemSearchMatch[];
  /** Total matching sessions before the display cap. */
  totalMatches: number;
  warnings: MemWarning[];
}

export interface MemContextTurn {
  idx: number;
  role: DialogueRole;
  text: string;
  isHit: boolean;
}

export interface MemContextResult {
  session: MemSessionInfo;
  query?: string;
  totalTurns: number;
  totalHitTurns: number;
  mergedChildren: number;
  budgetUsed: number;
  maxChars: number;
  turns: MemContextTurn[];
  warnings: MemWarning[];
}

export interface BrainstormWindow {
  label: string;
  /** inclusive */
  startTurn: number;
  /** exclusive */
  endTurn: number;
}

export interface MemDialogueGroup {
  label: string | null;
  turns: DialogueTurn[];
}

export interface MemExtractResult {
  session: MemSessionInfo;
  phase: MemPhase;
  windows: BrainstormWindow[];
  /** Total turns in the underlying cleaned dialogue, before any `grep` filter. */
  totalTurns: number;
  /** Per-window labeled groups (single unlabeled group for `phase: "all"`). */
  groups: MemDialogueGroup[];
  /** Flat concatenation of all groups' turns. */
  turns: DialogueTurn[];
  warnings: MemWarning[];
}

export interface MemProjectSummary {
  cwd: string;
  last_active: string;
  sessions: number;
  by_platform: Record<MemSourceKind, number>;
}

/** Parsed `task.py create|start` invocation recovered from a raw shell call. */
export type ParsedTaskPyCommand =
  | { action: "create"; slug?: string; titleArg?: string }
  | { action: "start"; taskDir?: string };

export interface TaskPyEvent {
  action: "create" | "start";
  timestamp: string;
  /** Index into the cleaned `DialogueTurn[]` at the time the shell call ran. */
  turnIndex: number;
  slug?: string;
  taskDir?: string;
}

// ---------- public API option bags ----------

export interface ListMemSessionsOptions {
  filter?: MemFilter;
  /** Optional sink for non-fatal source warnings while preserving the
   * historical array return type. */
  onWarning?: (warning: MemWarning) => void;
}

export interface SearchMemSessionsOptions {
  keyword: string;
  filter?: MemFilter;
  /** Merge OpenCode sub-agent descendants into their parent before searching. */
  includeChildren?: boolean;
}

export interface ReadMemContextOptions {
  sessionId: string;
  filter?: MemFilter;
  /** Multi-token AND keyword used to rank and anchor hit turns. */
  grep?: string;
  /** Number of hit turns to surface (default 3). */
  turns?: number;
  /** Turns of surrounding context on either side of each hit (default 1). */
  around?: number;
  /** Total character budget (default 6000). */
  maxChars?: number;
  includeChildren?: boolean;
}

export interface ExtractMemDialogueOptions {
  sessionId: string;
  filter?: MemFilter;
  /** Phase slice (default `"all"`). */
  phase?: MemPhase;
  /** Multi-token AND substring filter applied after phase slicing. */
  grep?: string;
}

export interface ListMemProjectsOptions {
  filter?: MemFilter;
  onWarning?: (warning: MemWarning) => void;
}

// ---------- unified recall (v0.2.1) ----------

/** Where a recall hit came from. Dialogue platforms stay separate so a result
 * names the host that recorded it. */
export type RecallSourceKind = MemSourceKind | "doc";

/** How strong the lexical match was. `weak` marks the single automatic
 * relaxation used when nothing matched strongly. */
export type RecallStrength = "strong" | "weak";

/**
 * One recall hit. The same shape covers a document section and a dialogue
 * window, so a caller renders either without knowing which store it came from.
 * Unknown fields are omitted rather than invented.
 */
export interface RecallHit {
  sourceKind: RecallSourceKind;
  /** Passed back to `readMemRefs` to expand this hit. */
  ref: string;
  title?: string;
  /** Document heading or dialogue speaker of the matched text. */
  section?: string;
  excerpt: string;
  /** Document location. Absent for dialogue hits. */
  path?: string;
  line?: number;
  /** Dialogue location. Absent for document hits. */
  sessionId?: string;
  turn?: number;
  /** The query terms that matched, strongest first. */
  matchedTerms: string[];
  strength: RecallStrength;
  /**
   * `archived` for research archive / migrated legacy hits;
   * `superseded` when a local lineage mark says so. Otherwise omitted.
   */
  status?: "archived" | "superseded";
  /**
   * Repo-relative successor path when `superseded_by` resolves to an allowed
   * in-project Markdown knowledge file. Never expanded into the excerpt.
   */
  supersededBy?: string;
  /** Source time when one is known. A file mtime is never used here. */
  sourceTime?: string;
}

export interface RecallResult {
  /** Ranked hits, capped at the requested limit. */
  hits: RecallHit[];
  /** Hits found before the cap. */
  totalHits: number;
  /** True when a bound was reached and something was left unscanned. */
  incomplete: boolean;
  /** Display cap reached; separate from incomplete scanning. */
  truncated: boolean;
  warnings: MemWarning[];
}

export interface RecallMemOptions {
  query: string;
  /** Project directory. Defaults to the working directory. */
  cwd?: string;
  /** Max hits to return (default 3). */
  limit?: number;
  /** Total compact-JSON evidence-record character budget across all hits (default 3000). */
  maxChars?: number;
  platform?: MemSourceFilter;
}

/** One expanded source, returned by `readMemRefs`. */
export interface RecallRead {
  ref: string;
  sourceKind: RecallSourceKind;
  title?: string;
  text: string;
  path?: string;
  sessionId?: string;
  /** Set when the source moved or changed since the ref was built. */
  changed?: boolean;
  truncated?: boolean;
  /** Present when the document carries a superseded lineage mark. */
  status?: "superseded";
  /**
   * Successor path hint only — never the successor body. Omitted when the
   * mark has no resolvable in-project Markdown target.
   */
  supersededBy?: string;
}

export interface RecallReadResult {
  reads: RecallRead[];
  truncated: boolean;
  warnings: MemWarning[];
}

export interface ReadMemRefsOptions {
  refs: readonly string[];
  cwd?: string;
  /** Total compact-JSON evidence-record budget for the batch (default 4000). */
  maxChars?: number;
}
