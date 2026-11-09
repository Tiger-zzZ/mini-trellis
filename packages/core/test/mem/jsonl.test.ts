import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readJsonl } from "../../src/mem/internal/jsonl.js";
import { MEM_PLATFORMS } from "../../src/mem/platforms.js";
import type { MemWarning } from "../../src/mem/types.js";

let root: string;
let file: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mem-jsonl-"));
  file = path.join(root, "session.jsonl");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("JSONL integrity", () => {
  it.each([
    ["不", 1],
    ["不", 2],
    ["🙂", 1],
    ["🙂", 2],
    ["🙂", 3],
  ] as const)("preserves %s split after byte %i", (character, split) => {
    const prefix = '{"text":"';
    const text =
      "a".repeat(256 * 1024 - Buffer.byteLength(prefix) - split) +
      character +
      "重试";
    fs.writeFileSync(file, JSON.stringify({ text }));
    const rows: unknown[] = [];
    const warnings: MemWarning[] = [];
    readJsonl(file, (row) => rows.push(row), warnings);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { text: string }).text === text).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("reports damaged records without leaking their contents and keeps valid rows", () => {
    fs.writeFileSync(
      file,
      '{"text":"old rule"}\n{"secret":"private-broken\n{"text":"valid later rule"}\n{"text":"latest correction',
    );
    const rows: unknown[] = [];
    const warnings: MemWarning[] = [];
    readJsonl(file, (row) => rows.push(row), warnings);
    expect(rows).toEqual([{ text: "old rule" }, { text: "valid later rule" }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("session-history-incomplete");
    expect(warnings[0].message).toContain("2 malformed JSONL records");
    expect(warnings[0].message).toContain("line 2");
    expect(warnings[0].message).not.toContain("private-broken");
  });

  it("does not claim to have inspected records after an intentional early stop", () => {
    fs.writeFileSync(file, '{"text":"first"}\n{"broken');
    const warnings: MemWarning[] = [];
    readJsonl(file, () => "stop", warnings);
    expect(warnings).toEqual([]);
  });

  it("propagates consumer errors on a valid final line without a newline", () => {
    fs.writeFileSync(file, '{"text":"complete"}');
    expect(() =>
      readJsonl(file, () => {
        throw new Error("consumer failed");
      }),
    ).toThrow("consumer failed");
  });

  it.each(["claude", "codex", "pi"] as const)(
    "forwards %s extraction, context and search warnings",
    (platform) => {
      const records = {
        claude: {
          type: "user",
          message: { role: "user", content: "Confirmed: 2 attempts" },
        },
        codex: {
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Confirmed: 2 attempts" }],
          },
        },
        pi: {
          type: "message",
          id: "first",
          message: { role: "user", content: "Confirmed: 2 attempts" },
        },
      };
      fs.writeFileSync(
        file,
        JSON.stringify(records[platform]) + '\n{"correction":"4 attempts',
      );
      const session = { id: "fixture", platform, cwd: root, filePath: file };
      const adapter = MEM_PLATFORMS[platform];
      for (const read of [
        (warnings: MemWarning[]) => adapter.extract(session, warnings),
        (warnings: MemWarning[]) => adapter.collect(session, warnings).turns,
      ]) {
        const warnings: MemWarning[] = [];
        expect(read(warnings)).toEqual([
          { role: "user", text: "Confirmed: 2 attempts" },
        ]);
        expect(warnings.map((w) => w.code)).toContain(
          "session-history-incomplete",
        );
      }
      const warnings: MemWarning[] = [];
      expect(adapter.search(session, "attempts", warnings).count).toBe(1);
      expect(warnings.map((w) => w.code)).toContain(
        "session-history-incomplete",
      );
    },
  );
});
