# Changelog

## v0.2.2 — 2026-10-14

- Migration now removes Trellis hook commands, the legacy Pi extension, and the Codex `max_depth = 1` pin before writing mini-trellis host config. User hooks and custom settings stay. A second run can repair config left behind after the scripts were already deleted.
- Session start no longer carries the topic-writing procedure. Recall guidance stays in the short entry; write steps stay in the remember command. A compact restart points back at local session history.
- Recording guidance can keep a rejected approach that a later session should not retry, labeled as rejected rather than as a current rule.
- Removes unused Trellis task-engine modules from the installed script templates. `migrate` and `refresh` delete leftover copies in an existing project. `get_context.py` remains because OpenCode still uses it to resolve monorepo spec scope.
- Document discovery in `mem recall` no longer triggers false `doc-search-incomplete` warnings on large migrated repositories with >200 internal links or deep non-Markdown evidence directories, and ranks active research notes ahead of migrated `legacy/` task files.
- `mini-trellis doctor` renders `unknown` checks with `?` instead of `✗`.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.2.2.md).

## v0.2.1 — 2026-10-13

- Adds automatic project Markdown discovery and unified `mem recall` / `mem read` alongside local conversation history, with bounded scans and source verification.
- Uses a short startup entry and on-demand excerpts; preserves conditions, negations, original document language and existing topics.
- Links recorded journal sessions to actual spec/research files, reports the actual journal/index paths, and distinguishes those writes from topic updates.
- Defaults new installations to file-only recording; preserves existing configuration. Adds recent hook and recording diagnostics, keeping unobserved delivery `unknown`.
- Batches Git ignore checks for large documentation directories without dropping scope, symlink or incomplete-scan safeguards.
- Pins the banner dependency to a Node 18 compatible release so fresh production installs respect the advertised minimum runtime.
- Validates recording, recall and interactive compact recovery in Claude Code and Codex.

Version changes, host validation and upgrade instructions are in the [release notes](docs/releases/v0.2.1.md).

## v0.2.0 — 2026-10-04

v0.2 makes the memory layer safer to install into an existing project and easier to verify:

- Adds `mini-trellis doctor` with JSON output and an explicit unknown state for host delivery that needs a real session check.
- Adds `mini-trellis refresh` and `refresh --dry-run`; claimed, unchanged assets can be refreshed while local edits and invalid configuration are preserved.
- Merges the mini-trellis AGENTS block and Claude/Codex/Pi JSON entries without overwriting user settings.
- Records a small managed asset manifest during init so later refreshes can distinguish templates from local edits.
- Limits automatic context to 4,000 characters, skips duplicate OpenCode injection, and states when the model should record knowledge.
- Keeps new installs journal-only by default and removes the project-level Codex recursion setting from the new template.

The diagrams and the v0.3 direction remain in [`docs/roadmap.md`](docs/roadmap.md).

Host validation: Codex CLI 0.159.2 completed a real hook-to-journal run. Claude Code 2.1.281's hook contract passes locally, while the configured proxy rejected the full API turn because its 1m context capability was unavailable; see [`docs/releases/v0.2.0.md`](docs/releases/v0.2.0.md).

## v0.1.1 — 2026-10-04

`v0.1.1` is the maintenance baseline immediately before the v0.2 line.

- Keeps the product focused on spec, research, journal, and cross-session memory.
- Supports Claude Code, Codex, OpenCode, and Pi Agent memory hooks.
- Adds the migration path from Trellis tasks into research topics.
- Keeps first install journal-only by default; explicit `remember` can still commit when configured.
- Refreshes the bilingual quick start and documents the memory boundaries.
