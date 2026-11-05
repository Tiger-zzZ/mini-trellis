import fs from "node:fs";
import type { OpenCodeVersion } from "./opencode-version.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** OpenCode itself pins its SDK here; preserve that and unrelated user keys. */
export function readOpenCodePackageIssue(
  filePath: string,
  version: OpenCodeVersion,
): string | null {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return "OpenCode package.json could not be read as JSON";
  }
  if (!isObject(value)) return "OpenCode package.json must be a JSON object";
  if (
    value.type !== undefined &&
    value.type !== "module" &&
    value.type !== "commonjs"
  )
    return "OpenCode package type must be module or commonjs";
  if (version === "2" && value.type === "commonjs")
    return "OpenCode V2 requires module type; existing commonjs configuration is kept";
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const dependencies = value[field];
    if (dependencies === undefined) continue;
    if (
      !isObject(dependencies) ||
      Object.values(dependencies).some(
        (dependency) => typeof dependency !== "string" || !dependency.trim(),
      )
    )
      return `OpenCode package ${field} must be an object of dependency strings`;
  }
  return null;
}
