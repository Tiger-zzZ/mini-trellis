# Changelog

## v0.1.1 — 2026-10-04

`v0.1.1` is the maintenance baseline before the v0.2 development line.

- Keeps the product focused on spec, research, journal, and cross-session memory.
- Supports Claude Code, Codex, OpenCode, and Pi Agent memory hooks.
- Adds the migration path from Trellis tasks into research topics.
- Keeps first install journal-only by default; explicit `remember` can still commit when configured.
- Refreshes the bilingual quick start and documents the memory boundaries.

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
