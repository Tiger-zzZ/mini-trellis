import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic-write.js";

const MANIFEST_PATH = ".trellis/.mini-trellis-manifest.json";
const MANIFEST_VERSION = 1;

export interface MiniTrellisManifest {
  version: number;
  files: Record<string, string>;
}

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function hashFile(filePath: string): string | null {
  try {
    return hashContent(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function readManifest(cwd: string): MiniTrellisManifest {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(cwd, MANIFEST_PATH), "utf8"),
    ) as Partial<MiniTrellisManifest>;
    if (
      parsed.version === MANIFEST_VERSION &&
      parsed.files &&
      typeof parsed.files === "object"
    ) {
      return { version: MANIFEST_VERSION, files: { ...parsed.files } };
    }
  } catch {
    // Missing or malformed manifests are treated as an empty ownership set.
  }
  return { version: MANIFEST_VERSION, files: {} };
}

export function writeManifest(
  cwd: string,
  manifest: MiniTrellisManifest,
): void {
  const filePath = path.join(cwd, MANIFEST_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileAtomic(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function updateManifestForTemplates(
  cwd: string,
  templates: Map<string, string>,
): MiniTrellisManifest {
  const manifest = readManifest(cwd);
  for (const [relative, content] of templates) {
    const actual = hashFile(path.join(cwd, ...relative.split("/")));
    if (actual === hashContent(content)) manifest.files[relative] = actual;
  }
  writeManifest(cwd, manifest);
  return manifest;
}

export { MANIFEST_PATH };
