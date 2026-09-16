/**
 * One descriptor per mem platform. `sessions.ts` loops this table instead of
 * growing a seventh if-chain / switch / prepare-release special case.
 */

import {
  claudeExtractDialogue,
  claudeListSessions,
  claudeSearch,
  collectClaudeTurnsAndEvents,
} from "./adapters/claude.js";
import {
  codexExtractDialogue,
  codexListSessions,
  codexSearch,
  collectCodexTurnsAndEvents,
} from "./adapters/codex.js";
import {
  collectDevinTurnsAndEvents,
  devinExtractDialogue,
  devinListSessions,
  devinSearch,
  prepareDevinSessionStore,
  releaseDevinSessionStore,
} from "./adapters/devin.js";
import {
  collectGrokTurnsAndEvents,
  grokExtractDialogue,
  grokListSessions,
  grokSearch,
} from "./adapters/grok.js";
import {
  opencodeExtractDialogue,
  opencodeListSessions,
  opencodeSearch,
  prepareOpencodeSessionStore,
  releaseOpencodeSessionStore,
} from "./adapters/opencode.js";
import {
  collectPiTurnsAndEvents,
  piExtractDialogue,
  piListSessions,
  piSearch,
} from "./adapters/pi.js";
import {
  collectZcodeTurnsAndEvents,
  prepareZcodeSessionStore,
  releaseZcodeSessionStore,
  zcodeExtractDialogue,
  zcodeListSessions,
  zcodeSearch,
} from "./adapters/zcode.js";
import type {
  DialogueTurn,
  MemFilter,
  MemSessionInfo,
  MemSourceKind,
  MemWarning,
  SearchHit,
  TaskPyEvent,
} from "./types.js";

export interface MemTurnsAndEvents {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
}

export interface MemPlatformAdapter {
  list: (f: MemFilter, warnings: MemWarning[]) => MemSessionInfo[];
  extract: (s: MemSessionInfo, warnings: MemWarning[]) => DialogueTurn[];
  search: (
    s: MemSessionInfo,
    kw: string,
    warnings: MemWarning[],
  ) => SearchHit;
  collect: (s: MemSessionInfo, warnings: MemWarning[]) => MemTurnsAndEvents;
  phaseSupported: boolean;
  prepare?: (dbPath: string, warnings: MemWarning[]) => void;
  release?: () => void;
}

export const MEM_PLATFORMS: Record<MemSourceKind, MemPlatformAdapter> = {
  claude: {
    phaseSupported: true,
    list: (f) => claudeListSessions(f),
    extract: (s) => claudeExtractDialogue(s),
    search: (s, kw) => claudeSearch(s, kw),
    collect: (s) => collectClaudeTurnsAndEvents(s),
  },
  codex: {
    phaseSupported: true,
    list: (f) => codexListSessions(f),
    extract: (s, warnings) => codexExtractDialogue(s, warnings),
    search: (s, kw) => codexSearch(s, kw),
    collect: (s, warnings) => collectCodexTurnsAndEvents(s, warnings),
  },
  grok: {
    phaseSupported: true,
    list: (f) => grokListSessions(f),
    extract: (s, warnings) => grokExtractDialogue(s, warnings),
    search: (s, kw) => grokSearch(s, kw),
    collect: (s, warnings) => collectGrokTurnsAndEvents(s, warnings),
  },
  opencode: {
    phaseSupported: false,
    list: (f, warnings) => opencodeListSessions(f, warnings),
    extract: (s, warnings) => opencodeExtractDialogue(s, warnings),
    search: (s, kw, warnings) => opencodeSearch(s, kw, warnings),
    collect: (s, warnings) => ({
      turns: opencodeExtractDialogue(s, warnings),
      events: [],
    }),
    prepare: prepareOpencodeSessionStore,
    release: releaseOpencodeSessionStore,
  },
  pi: {
    phaseSupported: true,
    list: (f) => piListSessions(f),
    extract: (s) => piExtractDialogue(s),
    search: (s, kw) => piSearch(s, kw),
    collect: (s) => collectPiTurnsAndEvents(s),
  },
  zcode: {
    phaseSupported: true,
    list: (f, warnings) => zcodeListSessions(f, warnings),
    extract: (s, warnings) => zcodeExtractDialogue(s, warnings),
    search: (s, kw, warnings) => zcodeSearch(s, kw, warnings),
    collect: (s, warnings) => collectZcodeTurnsAndEvents(s, warnings),
    prepare: prepareZcodeSessionStore,
    release: releaseZcodeSessionStore,
  },
  devin: {
    phaseSupported: true,
    list: (f, warnings) => devinListSessions(f, warnings),
    extract: (s, warnings) => devinExtractDialogue(s, warnings),
    search: (s, kw, warnings) => devinSearch(s, kw, warnings),
    collect: (s, warnings) => collectDevinTurnsAndEvents(s, warnings),
    prepare: prepareDevinSessionStore,
    release: releaseDevinSessionStore,
  },
};
