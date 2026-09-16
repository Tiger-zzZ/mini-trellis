# mini-trellis real test (2026-09-15)

Topic inbox note. Not a task. Promote durable contracts into `.trellis/spec/` only if they stay true.

## Scope

Verify the F16 installed-surface trim as a local memory layer:

- SessionStart no longer drives workflow / tasks
- `add_session.py` writes journal without creating or archiving a task
- `.trellis/research/` is a first-class inbox (README is not a topic)
- `update.skip` covers the trimmed files
- Product name for a later public trim: **mini-trellis**, license **AGPL-3.0**

## Commands run

```
python3 ./.trellis/scripts/init_developer.py anno
python3 ./.trellis/scripts/add_session.py \
  --title "mini-trellis real-test: journal write without task" \
  --commit - --no-commit \
  --summary "..."
printf '{"source":"startup","cwd":"..."}' | python3 .claude/hooks/session-start.py
printf '{"source":"compact","cwd":"..."}' | python3 .claude/hooks/session-start.py
```

`--no-commit` is required. Default `session_auto_commit` is true and would stage tracked workspace files.

`.trellis/.developer` is gitignored. New workspace `workspace/anno/` is untracked until someone explicitly commits it.

## Results

| Check | Result |
|-------|--------|
| init_developer `anno` | pass — gitignored `.developer`, created `workspace/anno/journal-1.md` |
| add_session without task | pass — Session 1, 42 lines, index Total Sessions = 1, `--commit -` |
| SessionStart startup | pass — no `<trellis-workflow>` / `<task-status>` / Current task; journal path present |
| SessionStart compact | pass — `/trellis:remember` reminder; README.md not listed as a topic |
| Claude hooks | pass — SessionStart only |
| Cursor hooks | pass — sessionStart + beforeShellExecution |
| Codex hooks.json | pass — `{ "hooks": {} }` |
| OpenCode workflow plugin | pass — factory returns `{}` |
| OpenCode subagent plugin | pass — Bash `TRELLIS_CONTEXT_ID` kept, Task rewrite early-return |
| Pi startup | pass — no create/continue/skip task; `trellis_subagent` execute returns disabled |
| `update.skip` | pass — 17 paths, all exist |
| `trellis mem` | blocked — global CLI 0.5.19, no `mem`; no local `packages/cli/dist` / `node_modules` |
| `trellis update --dry-run` | not run — same CLI mismatch |

## Not in this pass

- Do not rewrite `packages/cli/src/templates/` / `SHARED_HOOKS_BY_PLATFORM`
- Do not delete dead `task.py` / agents / `workflow.md`
- Do not decouple `trellis mem --phase`
- Do not git commit
- Do not rename npm packages yet (`@mindfoldhq/trellis` still on disk)

## SessionStart after research topic

Second dry-run (startup) after this file existed:

- `Research notes: 1 in .trellis/research/.`
- guidelines list `.trellis/research/mini-trellis-real-test.md`
- README still not listed
- no `<trellis-workflow>` / `<task-status>`

Journal Session 2 recorded the same with `--no-commit`.

## Go / no-go

Local memory-layer prototype: **yes**.

Publishable OSS v1 named mini-trellis: **not yet**. Remaining: `mem --phase`, dead-file cleanup or hide, template/`trellis update` story, matching CLI, package rename with AGPL notice to Mindfold LLC.
