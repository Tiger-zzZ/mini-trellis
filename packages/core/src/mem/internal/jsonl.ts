/**
 * Streaming JSONL / JSON readers for the persisted-session adapters.
 *
 * Zero-dependency on purpose — `@mindfoldhq/trellis-core` does not depend on
 * `zod`. The original CLI implementation validated every line against a Zod
 * schema; the external session formats were all declared `.loose()` with every
 * field `.optional()`, so the only thing the schema actually rejected was a
 * top-level non-object line — which the `0x7b` byte-prefix fast-reject already
 * filters. Adapters therefore receive each parsed line cast to a hand-written
 * loose interface and read fields defensively.
 */

import * as fs from "node:fs";
import { StringDecoder } from "node:string_decoder";

import type { MemWarning } from "../types.js";

const CHUNK = 256 * 1024;
const OPEN_BRACE = 0x7b; // '{'

/**
 * Walk JSONL objects with a bounded read buffer and an early-stop callback.
 * Malformed event records are skipped but reported through the warning sink.
 * Blank lines and non-JSON log preambles retain their existing skip behavior.
 */
export function readJsonl<T>(
  file: string,
  onLine: (obj: T) => unknown,
  warnings?: MemWarning[],
): void {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    warnings?.push({
      code: "session-history-unreadable",
      message: `cannot open session history ${file}`,
    });
    return;
  }
  const buf = Buffer.alloc(CHUNK);
  const decoder = new StringDecoder("utf8");
  let leftover = "";
  let lineNumber = 0;
  let malformed = 0;
  let firstMalformed = 0;
  const consume = (line: string): boolean => {
    lineNumber++;
    if (line.charCodeAt(0) !== OPEN_BRACE) return false;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      malformed++;
      if (!firstMalformed) firstMalformed = lineNumber;
      return false;
    }
    // Consumer errors must not be mistaken for malformed JSON, including at EOF.
    return onLine(raw as T) === "stop";
  };
  try {
    let stop = false;
    while (!stop) {
      const n = fs.readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) break;
      const chunk = leftover + decoder.write(buf.subarray(0, n));
      let from = 0;
      while (true) {
        const nl = chunk.indexOf("\n", from);
        if (nl === -1) {
          leftover = chunk.slice(from);
          break;
        }
        const line = chunk.slice(from, nl);
        from = nl + 1;
        if (consume(line)) {
          stop = true;
          break;
        }
      }
    }
    if (!stop) {
      leftover += decoder.end();
      if (leftover) consume(leftover);
    }
  } finally {
    fs.closeSync(fd);
    if (malformed) {
      // One bounded diagnostic per read, without copying transcript contents.
      warnings?.push({
        code: "session-history-incomplete",
        message: `${file}: skipped ${malformed} malformed JSONL records (first at line ${firstMalformed}); history is incomplete and may omit corrections.`,
      });
    }
  }
}

/** Read just the first parseable JSONL object (stops after one line). */
export function readJsonlFirst<T>(file: string): T | undefined {
  let result: T | undefined;
  readJsonl<T>(file, (obj) => {
    result = obj;
    return "stop";
  });
  return result;
}

/** Find the first JSONL object satisfying `predicate`, scanning at most
 * `maxLines` lines. */
export function findInJsonl<T>(
  file: string,
  predicate: (obj: T) => boolean,
  maxLines = 200,
): T | undefined {
  let count = 0;
  let hit: T | undefined;
  readJsonl<T>(file, (obj) => {
    count++;
    if (predicate(obj)) {
      hit = obj;
      return "stop";
    }
    if (count >= maxLines) return "stop";
  });
  return hit;
}

/** Read and JSON-parse a whole file; returns `undefined` on read / parse
 * failure. The caller is responsible for shape-checking the result. */
export function readJsonFile<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}
