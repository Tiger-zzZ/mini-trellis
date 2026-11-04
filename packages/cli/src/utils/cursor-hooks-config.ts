import fs from "node:fs";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Check the shape needed to merge Cursor hooks without replacing user data. */
export function readCursorHooksConfigIssue(
  filePath: string,
  requireSessionStart = false,
): string | null {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    return error instanceof SyntaxError
      ? "existing file is not valid JSON"
      : "Cursor hooks config could not be read";
  }
  if (!isObject(value)) return "Cursor hooks config must be a JSON object";
  if (
    value.version !== undefined &&
    (typeof value.version !== "number" ||
      !Number.isInteger(value.version) ||
      value.version < 1)
  ) {
    return "Cursor hooks version must be a positive integer";
  }
  if (value.hooks !== undefined && !isObject(value.hooks)) {
    return "Cursor hooks must be an object";
  }
  const hooks = value.hooks as Record<string, unknown> | undefined;
  const startup = hooks?.sessionStart;
  if (
    startup !== undefined &&
    (!Array.isArray(startup) ||
      startup.some((entry: unknown) => {
        if (!isObject(entry)) return true;
        const text = entry.type === "prompt" ? entry.prompt : entry.command;
        return typeof text !== "string" || !text.trim();
      }))
  ) {
    return "Cursor sessionStart must be an array of command or prompt hooks";
  }
  if (
    requireSessionStart &&
    (!Array.isArray(startup) ||
      !startup.some(
        (entry: unknown) =>
          isObject(entry) &&
          (entry.type === undefined || entry.type === "command") &&
          typeof entry.command === "string" &&
          entry.command
            .replaceAll("\\", "/")
            .includes(".cursor/hooks/session-start.py"),
      ))
  ) {
    return "mini-trellis sessionStart is not registered; run mini-trellis init --cursor";
  }
  return null;
}
