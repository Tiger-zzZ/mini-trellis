import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES, PATHS } from "../constants/paths.js";
import { copyTrellisDir } from "../templates/extract.js";
import {
  configYamlTemplate,
  gitignoreTemplate,
  gitattributesTemplate,
} from "../templates/trellis/index.js";
import {
  agentProgressIndexContent,
  guidesIndexContent,
  miniMemoryGuideContent,
  researchReadmeContent,
} from "../templates/markdown/index.js";
import { writeFile, ensureDir } from "../utils/file-writer.js";
import { replacePythonCommandLiterals } from "./shared.js";

const JOURNAL_MERGE_UNION_PATTERN = /journal-\*\.md\s+merge=union/;

export interface WorkflowOptions {
  packages?: {
    name: string;
    path: string;
    isSubmodule?: boolean;
    isGitRepo?: boolean;
  }[];
}

export function ensureGitattributes(cwd: string): void {
  const targetPath = path.join(cwd, ".gitattributes");

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, gitattributesTemplate);
    return;
  }

  const existing = fs.readFileSync(targetPath, "utf-8");
  if (JOURNAL_MERGE_UNION_PATTERN.test(existing)) {
    return;
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  fs.writeFileSync(targetPath, existing + separator + gitattributesTemplate);
}

/**
 * Create the mini-trellis memory skeleton under `.trellis/`.
 * Does not write task.py, workflow.md, tasks/, or channel agents.
 */
export async function createWorkflowStructure(
  cwd: string,
  _options?: WorkflowOptions,
): Promise<void> {
  ensureDir(path.join(cwd, DIR_NAMES.WORKFLOW));

  await copyTrellisDir("scripts", path.join(cwd, PATHS.SCRIPTS), {
    executable: true,
  });

  await writeFile(
    path.join(cwd, DIR_NAMES.WORKFLOW, ".gitignore"),
    gitignoreTemplate,
  );
  await writeFile(
    path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml"),
    configYamlTemplate,
  );

  ensureGitattributes(cwd);

  ensureDir(path.join(cwd, PATHS.WORKSPACE));
  await writeFile(
    path.join(cwd, PATHS.WORKSPACE, "index.md"),
    replacePythonCommandLiterals(agentProgressIndexContent),
  );

  const researchDir = path.join(cwd, DIR_NAMES.WORKFLOW, "research");
  ensureDir(researchDir);
  await writeFile(path.join(researchDir, "README.md"), researchReadmeContent);
  ensureDir(path.join(researchDir, "archive"));

  const guidesDir = path.join(cwd, PATHS.SPEC, "guides");
  ensureDir(guidesDir);
  await writeFile(path.join(guidesDir, "index.md"), guidesIndexContent);
  await writeFile(
    path.join(guidesDir, "mini-memory.md"),
    miniMemoryGuideContent,
  );
}
