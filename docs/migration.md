# Migrating from Trellis

[Back to README](../README.md)

Trellis and mini-trellis share `.trellis/`. Use the migration command to replace the existing integration instead of installing both into the same project. Back up project knowledge and host configuration, including ignored files, before proceeding.

```bash
mini-trellis migrate --dry-run   # preview migration changes
mini-trellis migrate             # confirm migration; defaults to no
```

It rewrites the four host surfaces with mini-trellis's versions, deletes the Trellis-only instruction files (skills, commands, agents, per-turn injectors, `workflow.md`, `task.py`), replaces the Trellis block in `AGENTS.md`, and drops `.trellis/.version` so the Trellis CLI stops offering to update the project back to the four-phase workflow.

Host configuration is not replaced as a whole file:

- `.claude/settings.json` and `.codex/hooks.json` lose Trellis hooks that point at `inject-*.py`, `statusline.py`, or an old `session-start.py`, then receive mini-trellis's SessionStart entry. User hooks, `env`, and other fields stay.
- `.pi/settings.json` loses `./extensions/trellis/index.ts` and `npm:pi-subagents`. Other extensions and packages stay.
- `.codex/config.toml` loses the Trellis notes and `[agents] max_depth = 1`, then receives the mini-trellis project config. User-owned keys are appended after it.

If an earlier migration deleted the scripts but left `inject-*.py` in the hook config, running `mini-trellis migrate` again removes those entries.

Task material moves from `.trellis/tasks/` into research topics:

- Each task directory becomes one research topic: `.trellis/tasks/<name>/` → `.trellis/research/<name>/`, and archived ones go to `.trellis/research/archive/YYYY-MM/<name>/`. Date prefixes and directory names are kept, preserving relative links within the retained task content. Links to files moved into `legacy/` or deleted, such as `../prd.md`, are not repaired.
- Each topic retains its `research/` subtree and `design.md` structure. Other task-root material — `task.json`, `prd.md`, `implement*`, `check.jsonl`, `drafts/`, and unrecognised files — is archived to `.trellis/research/<topic>/legacy/` or deleted according to the choice made at the start of migration. Archive is the default, including with `--yes`.
- Repo-relative `.trellis/tasks/…` mentions inside the notes that stay are repointed by their full source paths. Stale pre-archive paths are repaired only when the task name is unique. Ambiguous or unsupported references are left unchanged and counted; references to other repositories are not rewritten.
- The `current_task` pointer in `.trellis/.runtime/sessions/*.json` is cleared, and `.trellis/tasks/` is removed once it is empty.

If a topic destination already exists under `.trellis/research/`, or a task root already contains `legacy`, migrate stops before touching anything and lists the collisions. Move or rename those entries before retrying. Migration directories must be real directories, not symlinks. Unprocessed entries, including dangling symlinks, keep `tasks/` from being removed and are reported. Note symlinks are never followed for rewriting.

Before migration, back up project knowledge and custom configuration, including Git-ignored files. The migration command does not create backups; files selected for deletion are permanently removed.

### What you get afterwards

- `.trellis/spec/`, `research/`, and `workspace/` are left alone. Your spec content survives, including any `backend/`/`frontend/` docs Trellis wrote; these remain searchable. SessionStart supplies a short entry, and articles are retrieved on demand.
- `.trellis/config.yaml` and `.trellis/scripts/` get overwritten with mini-trellis's versions. Re-apply any local edits.
- Migrated task directories are topics under `.trellis/research/` now; `mem recall` searches active and archived notes without listing all topics at startup. `.trellis/tasks/` is removed only if no unprocessed entries remain.
- `.trellis/.version` is removed and mini-trellis never writes one, so the Trellis CLI stays quiet in that project.
