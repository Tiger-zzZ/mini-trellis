/**
 * Public surface for `mini-trellis-core/mem` — reusable retrieval and
 * dialogue-context extraction over persisted Claude Code / Codex / OpenCode /
 * Pi sessions.
 *
 *   import { searchMemSessions } from "mini-trellis-core/mem";
 *
 * v1 scope: persisted-session search and context extraction only. It does not
 * read channel / forum / thread event logs and has no cursor / pagination.
 */

export {
  listMemSessions,
  searchMemSessions,
  extractMemDialogue,
  MemSessionNotFoundError,
} from "./sessions.js";

export { readMemContext } from "./context.js";

export { queryTerms, matchTerms, excerptAround } from "./lexical.js";

export { discoverDocs, resolveProjectRoot } from "./docs.js";

export { recallMem, readMemRefs } from "./recall.js";

export { listMemProjects } from "./projects.js";

export { MEM_SOURCE_KINDS } from "./types.js";

export type {
  MemSourceKind,
  MemSourceFilter,
  MemPhase,
  DialogueRole,
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  SearchExcerpt,
  SearchHit,
  MemWarning,
  MemSearchMatch,
  MemSearchResult,
  MemContextTurn,
  MemContextAnchor,
  MemContextResult,
  BrainstormWindow,
  MemDialogueGroup,
  MemExtractResult,
  MemProjectSummary,
  ListMemSessionsOptions,
  SearchMemSessionsOptions,
  ReadMemContextOptions,
  ExtractMemDialogueOptions,
  ListMemProjectsOptions,
  RecallSourceKind,
  RecallStrength,
  RecallHit,
  RecallResult,
  RecallMemOptions,
  RecallRead,
  RecallReadResult,
  ReadMemRefsOptions,
} from "./types.js";
