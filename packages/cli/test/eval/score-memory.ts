/**
 * Score mini-trellis 0.3.1 `mem recall` on the public memory fixture.
 * Agent turns, host tokens, and live Trellis/Comet rows stay empty.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recallMem, type RecallHit } from "mini-trellis-core/mem";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const NOTES = path.join(ROOT, "docs/eval/memory-0.3.2/notes");
const QUESTIONS_PATH = path.join(ROOT, "docs/eval/memory-0.3.2/questions.json");

const RESEARCH_FILES = [
  "idempotency.md",
  "idempotency-old.md",
  "batch-window.md",
  "retry-cap.md",
  "retry-summary.md",
] as const;

export interface QuestionFile {
  repeats: number;
  questions: Question[];
}

export type Question =
  | { id: string; prompt: string; query: string; kind: "no-history" }
  | {
      id: string;
      prompt: string;
      query: string;
      kind: "lineage";
      current: string;
      superseded: string;
      currentText: string;
      retiredText: string;
    }
  | {
      id: string;
      prompt: string;
      query: string;
      kind: "rejection";
      path: string;
      includes: string[];
    }
  | {
      id: string;
      prompt: string;
      query: string;
      kind: "pre-compact";
      path: string;
      includes: string;
      summary: string;
      summaryMustNotInclude: string;
    };

export interface RepeatRow {
  repeat: number;
  correct: boolean;
  turns: null;
  wallClockMs: number;
  currentNoteInTop: boolean | null;
  supersededNoteLater: boolean | null;
  explicitNoHit: boolean | null;
  injectedChars: number;
  tokens: { input: null; output: null; cache: null };
  failure: string | null;
  timeout: false;
  oldCli: false;
}

export interface MemoryEvalReport {
  fixture: "docs/eval/memory-0.3.2";
  repeats: number;
  recall: {
    tool: "mini-trellis";
    version: "0.3.1";
    mode: "mem-recall";
    tokenizer: null;
    injectedCharsMeaning: "JSON characters of one mem recall result, not host tokens";
  };
  agentLoops: {
    "mini-trellis-0.3.1": { ran: false; missing: "live agent loop" };
    "trellis-0.7.0-beta.4": {
      ran: false;
      phaseWorkflow: true;
      missing: "live agent loop";
    };
    comet: {
      ran: false;
      missing: "an environment that can run Comet on these notes";
    };
  };
  questions: {
    id: string;
    prompt: string;
    query: string;
    rows: RepeatRow[];
  }[];
}

function loadQuestions(): QuestionFile {
  return JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8")) as QuestionFile;
}

function materialize(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-eval-"));
  execFileSync("git", ["init", "-q", "-b", "main"], {
    cwd: root,
    stdio: "ignore",
  });
  const research = path.join(root, ".trellis", "research");
  fs.mkdirSync(research, { recursive: true });
  for (const name of RESEARCH_FILES) {
    fs.copyFileSync(path.join(NOTES, name), path.join(research, name));
  }
  return root;
}

function assertCompactFixture(): void {
  const text = fs.readFileSync(path.join(NOTES, "compact-demo.md"), "utf8");
  const marker = "<!-- compact-boundary -->";
  const at = text.indexOf(marker);
  if (at < 0) throw new Error("compact fixture is missing its boundary marker");
  const before = text.slice(0, at);
  const after = text.slice(at + marker.length);
  if (!before.includes("4 attempts")) {
    throw new Error("the retry limit is not before the compact boundary");
  }
  if (after.includes("4 attempts")) {
    throw new Error("the compact summary contains the retry limit");
  }
}

function inTop(hits: RecallHit[], rel: string): boolean {
  return hits.slice(0, 3).some((hit) => hit.path === rel);
}

function judge(
  question: Question,
  hits: RecallHit[],
): Omit<RepeatRow, "repeat" | "wallClockMs" | "injectedChars"> {
  const base = {
    turns: null,
    tokens: { input: null, output: null, cache: null },
    timeout: false as const,
    oldCli: false as const,
    failure: null,
  };
  if (question.kind === "no-history") {
    const explicitNoHit = hits.length === 0;
    const strong = hits.some((hit) => hit.strength === "strong");
    return {
      ...base,
      correct: explicitNoHit && !strong,
      currentNoteInTop: null,
      supersededNoteLater: null,
      explicitNoHit,
      failure: explicitNoHit && !strong ? null : "unexpected memory hit",
    };
  }
  if (question.kind === "lineage") {
    const currentAt = hits.findIndex((hit) => hit.path === question.current);
    const oldAt = hits.findIndex((hit) => hit.path === question.superseded);
    const current = hits[currentAt];
    const currentBefore = currentAt >= 0 && (oldAt < 0 || currentAt < oldAt);
    const usesCurrent =
      current?.excerpt.includes(question.currentText) === true &&
      current.excerpt.includes(question.retiredText) === false;
    const correct = currentBefore && usesCurrent && oldAt > currentAt;
    return {
      ...base,
      correct,
      currentNoteInTop: inTop(hits, question.current),
      supersededNoteLater: currentBefore && oldAt > currentAt,
      explicitNoHit: null,
      failure: correct
        ? null
        : "current limit was not ranked ahead of the retired note",
    };
  }
  if (question.kind === "rejection") {
    const hit = hits.find((item) => item.path === question.path);
    const text = hit?.excerpt ?? "";
    const correct = question.includes.every((part) => text.includes(part));
    return {
      ...base,
      correct,
      currentNoteInTop: inTop(hits, question.path),
      supersededNoteLater: null,
      explicitNoHit: null,
      failure: correct ? null : "rejection condition was not in the top note",
    };
  }
  const specific = hits.find((hit) => hit.path === question.path);
  const summaryAt = hits.findIndex((hit) => hit.path === question.summary);
  const specificAt = hits.findIndex((hit) => hit.path === question.path);
  const summary = hits[summaryAt];
  const correct =
    specific?.excerpt.includes(question.includes) === true &&
    specificAt >= 0 &&
    (summaryAt < 0 || specificAt < summaryAt) &&
    summary?.excerpt.includes(question.summaryMustNotInclude) !== true;
  return {
    ...base,
    correct,
    currentNoteInTop: inTop(hits, question.path),
    supersededNoteLater: null,
    explicitNoHit: null,
    failure: correct ? null : "retry limit was not ahead of the summary note",
  };
}

export function scoreMemoryFixture(): MemoryEvalReport {
  assertCompactFixture();
  const spec = loadQuestions();
  const root = materialize();
  try {
    const questions = spec.questions.map((question) => {
      const rows: RepeatRow[] = [];
      for (let repeat = 1; repeat <= spec.repeats; repeat += 1) {
        const started = performance.now();
        const result = recallMem({
          query: question.query,
          cwd: root,
          limit: 3,
        });
        const wallClockMs = Math.round(performance.now() - started);
        const payload = JSON.stringify(result);
        const judged = judge(question, result.hits);
        rows.push({
          repeat,
          wallClockMs,
          injectedChars: payload.length,
          ...judged,
        });
      }
      return {
        id: question.id,
        prompt: question.prompt,
        query: question.query,
        rows,
      };
    });
    return {
      fixture: "docs/eval/memory-0.3.2",
      repeats: spec.repeats,
      recall: {
        tool: "mini-trellis",
        version: "0.3.1",
        mode: "mem-recall",
        tokenizer: null,
        injectedCharsMeaning:
          "JSON characters of one mem recall result, not host tokens",
      },
      agentLoops: {
        "mini-trellis-0.3.1": { ran: false, missing: "live agent loop" },
        "trellis-0.7.0-beta.4": {
          ran: false,
          phaseWorkflow: true,
          missing: "live agent loop",
        },
        comet: {
          ran: false,
          missing: "an environment that can run Comet on these notes",
        },
      },
      questions,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
