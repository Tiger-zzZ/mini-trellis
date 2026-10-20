import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { scoreMemoryFixture } from "./score-memory.ts";

describe("memory fixture 0.3.2", () => {
  it("scores mem recall on the four public questions", () => {
    const report = scoreMemoryFixture();
    expect(report.repeats).toBe(3);
    expect(report.questions).toHaveLength(4);
    for (const question of report.questions) {
      expect(question.rows).toHaveLength(3);
      for (const row of question.rows) {
        expect(row.correct, `${question.id}: ${row.failure}`).toBe(true);
        expect(row.failure).toBeNull();
        expect(row.timeout).toBe(false);
        expect(row.oldCli).toBe(false);
        expect(row.turns).toBeNull();
        expect(row.tokens).toEqual({ input: null, output: null, cache: null });
        expect(row.injectedChars).toBeGreaterThan(0);
        expect(row.wallClockMs).toBeGreaterThanOrEqual(0);
      }
    }
    const [plain, lineage, rejected, compact] = report.questions;
    expect(plain?.rows.every((row) => row.explicitNoHit)).toBe(true);
    expect(lineage?.rows.every((row) => row.currentNoteInTop)).toBe(true);
    expect(lineage?.rows.every((row) => row.supersededNoteLater)).toBe(true);
    expect(rejected?.rows.every((row) => row.currentNoteInTop)).toBe(true);
    expect(compact?.rows.every((row) => row.currentNoteInTop)).toBe(true);
    expect(report.agentLoops.comet.ran).toBe(false);
    expect(report.agentLoops["trellis-0.7.0-beta.4"].phaseWorkflow).toBe(true);

    const out = process.env.MEMORY_EVAL_OUT;
    if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  });
});
