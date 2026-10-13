# Changelog

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
