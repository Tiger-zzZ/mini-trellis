import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic-write.js";

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Replace one managed marker block while preserving all user-authored text
 * around it. If the block is absent, append it to the existing file.
 */
export function mergeManagedBlock(
  existing: string,
  managed: string,
  startMarker: string,
  endMarker: string,
): string {
  const managedStart = managed.indexOf(startMarker);
  const managedEnd = managed.indexOf(endMarker, managedStart);
  if (managedStart < 0 || managedEnd < 0) {
    throw new Error("Managed content is missing its marker pair");
  }

  const block = managed
    .slice(managedStart, managedEnd + endMarker.length)
    .trimEnd();
  const existingStart = existing.indexOf(startMarker);
  const existingEnd =
    existingStart >= 0 ? existing.indexOf(endMarker, existingStart) : -1;

  if (existingStart >= 0 && existingEnd >= 0) {
    const before = existing.slice(0, existingStart).trimEnd();
    const after = existing.slice(existingEnd + endMarker.length).trimStart();
    return [before, block, after].filter(Boolean).join("\n\n") + "\n";
  }

  const trimmed = existing.trimEnd();
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

/** Merge a managed marker block on disk and report whether bytes changed. */
export function mergeManagedBlockFile(
  filePath: string,
  managed: string,
  startMarker: string,
  endMarker: string,
): boolean {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
  const merged = mergeManagedBlock(existing, managed, startMarker, endMarker);
  if (merged === existing) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileAtomic(filePath, merged);
  return true;
}

type JsonValue = unknown;
type JsonRecord = Record<string, JsonValue>;

function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Add missing template keys and array entries without overwriting user
 * settings. This is intentionally conservative: existing scalar values win.
 */
export function mergeJsonValues(
  existing: JsonValue,
  desired: JsonValue,
): JsonValue {
  if (Array.isArray(existing) && Array.isArray(desired)) {
    const merged = [...existing];
    for (const item of desired) {
      if (!merged.some((candidate) => jsonEqual(candidate, item)))
        merged.push(item);
    }
    return merged;
  }

  if (isRecord(existing) && isRecord(desired)) {
    const merged: JsonRecord = { ...existing };
    for (const [key, value] of Object.entries(desired)) {
      if (!hasOwn(existing, key)) merged[key] = value;
      else merged[key] = mergeJsonValues(existing[key], value);
    }
    return merged;
  }

  return existing;
}

/** Merge a JSON template on disk while preserving existing user values. */
export function mergeJsonFile(
  filePath: string,
  desiredContent: string,
): "written" | "unchanged" | "invalid" {
  let desired: JsonValue;
  try {
    desired = JSON.parse(desiredContent) as JsonValue;
  } catch {
    return "invalid";
  }

  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileAtomic(filePath, `${JSON.stringify(desired, null, 2)}\n`);
    return "written";
  }

  let existing: JsonValue;
  try {
    existing = JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonValue;
  } catch {
    return "invalid";
  }

  const merged = mergeJsonValues(existing, desired);
  const rendered = `${JSON.stringify(merged, null, 2)}\n`;
  if (rendered === fs.readFileSync(filePath, "utf8")) return "unchanged";
  writeFileAtomic(filePath, rendered);
  return "written";
}
