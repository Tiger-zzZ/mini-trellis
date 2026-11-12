# Changelog

## Unreleased — v0.4.0 candidate

- Keeps supplied test outcomes unchanged and removes inferred development completion or planning status from session notes.
- Serializes recording within a checkout; verifies managed index structure and the exact saved record, reports partial writes, and repairs missing rows on retry without duplicating the journal or rewinding later records.
- Includes topic content versions in new topic-linked retry identities while preserving legacy marker recovery. Detects merged duplicate journal numbers and retains the existing journal layout.
- Aligns recall, recording and the shared SessionStart hook on the nearest initialized project, bounded by independent Git roots. Keeps runtime diagnostics inside that project.
- Clarifies short linked recording replies and the first-use loop: save a real rule, use it in a new development session, correct the same topic and use the updated rule.

Scope and remaining acceptance gates are in the [v0.4.0 draft](docs/releases/v0.4.0.md). The independent-record storage prototype is local research and is not the default format.

## v0.3.8

- Manual `refresh` and automatic refresh after `upgrade` share one Y/N confirmation for managed files with content conflicts. Y applies the replacements; N, empty input and EOF keep project files. JSON and non-interactive runs report files requiring confirmation; `--dry-run` previews the changes.
- Records rendered host templates in the init manifest, fixing clean Codex installations with a non-default Python command being reported as locally modified on refresh.
- Adds `init --omp` and `refresh --omp` for native Oh My Pi extension, prompt and skill discovery, reusing the Pi startup entry.
- Fixes Pi remember prompts dropping text supplied after `/mini-trellis-remember`; Pi and OMP templates now pass arguments explicitly. Adds bilingual setup and recording examples.
- Adds `init --kiro` and `refresh --kiro` for Kiro CLI V3 / IDE 1.x, with project skills and a standalone SessionStart hook. Includes migration, diagnostics and uninstall.
- Runs project refresh automatically after a successful `upgrade` in the current initialized project, using a new process from the newly installed global package. Other directories receive the CLI upgrade only.
- `upgrade --dry-run` previews the CLI upgrade and project refresh.

See the [v0.3.8 release notes](docs/releases/v0.3.8.md).

## v0.3.7 — 2026-11-09

- Adds `init --zcode` and `refresh --zcode` for Z.ai ZCode, with shared project skills and a SessionStart entry. ZCode and Codex use the same skills under `.agents/skills/`.
- Supports recording confirmed decisions, updating existing topics, organizing supplied Markdown/text and recalling project knowledge in ZCode. After compact, `AGENTS.md` guides on-demand reading of saved knowledge.
- Preserves user configuration, hooks and other skills during installation and refresh. Desktop users review the project hook in Settings → Hooks before starting a new session.
- Preserves Chinese and other multibyte UTF-8 characters across read boundaries in Claude Code, Codex and Pi JSONL histories.
- Reports malformed or truncated event records with the source file and affected line, retains valid records, and marks partial recall results as incomplete.

See the [v0.3.7 release notes](docs/releases/v0.3.7.md).

## v0.3.6

- Extends the shared `mini-trellis-session-insight` skill to organize explicitly selected supported sessions or supplied Markdown/text exports into existing project documents. No new service, command, native history format or automatic scan.
- Preserves source attribution, user confirmations, corrections, negations and scope; distinguishes implemented behavior from agreed requirements and suggestions. Reports material conflicts and incomplete evidence instead of silently promoting them to current rules.
- Verifies actual topic, journal and index writes; keeps the original document language, skips unchanged repeat material, and uses `--no-commit` for historical organizing even with legacy auto-commit enabled.
- Ships the same on-demand reference through fresh install and refresh for every host, with updated discovery hints and bilingual usage examples.
- Fixes OpenCode V1 recall repeatedly scanning the shared SQLite message/part tables for each candidate session. Each recall now prepares the shared store once and releases it after traversal, including on extraction failure.

See the [0.3.6 release notes](docs/releases/v0.3.6.md).

## v0.3.5 — 2026-11-05

- Defaults new OpenCode projects to V2 context hooks while preserving existing V1 projects and explicit V1 compatibility. Init, refresh and migrate accept `--opencode-version 1|2`; ordinary refresh follows installed assets. Explicit switches preview file changes, reject edited or unowned entries, and preserve user plugins. OpenCode package configuration merges preserve host SDK pins and user dependencies; uninstall also preserves this shared package configuration.
- Adds one `--codebuddy` integration shared by CLI and IDE: project SessionStart, remember and shared skills. Settings merge preserves user hooks, environment and permissions; invalid configuration stops updates before writes. Migration removes known Trellis registrations and uninstall preserves unrelated settings.
- Distinguishes generated assets, observed hook execution and model delivery in diagnostics. OpenCode runs in headless mode and refreshes retained ephemeral entries without changing stored user messages.
- Reports unsupported OpenCode V2 conversation history explicitly while retaining V1 history and project-document recall. CodeBuddy conversation history is not parsed.
- Normalizes retained OpenCode V1 context to one current entry; rejects non-file host asset destinations before installation and avoids treating path mentions as CodeBuddy hook registrations.

Setup, protocol selection and history boundaries are in the [release notes](docs/releases/v0.3.5.md).

## v0.3.4 — 2026-11-04

- Migration and adding a host restore a missing `.trellis/.gitignore`, keeping developer identity and runtime state local without replacing existing user ignore rules.
- Cursor configuration checks reject invalid JSON shapes without replacing user hooks and report a missing mini-trellis `sessionStart` registration.
- Project descriptions keep renamed symbol and path references current without adding a journal entry for the rename alone. Confirmed decisions and unused configuration values stay separate from implemented capabilities.
- Cursor's local `sessionStart` entry is verified on Cursor 3.27.22. The session-insight skill also points to `AGENTS.md` and `mini-trellis mem recall`. Hook logs alone do not prove model delivery or use. Cursor-managed cloud agents do not run `sessionStart`; self-hosted machines remain unverified. Cursor conversation history is not parsed.
- `add_session.py --topic` accepts a root `README*.md` and Markdown under `docs/` or `doc/`, in addition to spec and research notes. An existing install gets that check after `mini-trellis refresh`.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.3.4.md).

## v0.3.2 — 2026-11-01

- A user question that only restates the query no longer crowds out a note that states the rule, including a question that repeats an id such as `TASK-4419`. A turn is treated as only a question when every word is a query term or a request word. A fact with no confirmation word, a `Confirmed:` line, a numeric correction, and a Chinese rejection stay eligible. Reordering document bodies does not move a session hit out of the place coverage gave it.
- A note whose body states the rule ranks ahead of archived tasks whose titles repeat the query, including migrated tasks that also discuss the topic in their own body. The heading is not counted as the body. An archived body still stays ahead of a current title that only says TODO. An archived path or unique id still returns that history. Declared successors are unchanged.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.3.2.md).

## v0.3.1 — 2026-10-20

- DeepSeek Harness installs short project skills under `.dsh/skills/`. There is no project SessionStart hook. The model calls `mem recall`, then `mem read` when the excerpt is not enough, and `mini-trellis-remember` after a confirmed decision. Compressed transcripts in `~/.dsh/sessions` are not read.
- Cursor installs the same short skills and reuses the local `sessionStart` hook. Cloud agents do not run `sessionStart`. Cursor conversation history is not parsed.
- OpenCode and Pi still do not name the current session after compact.

- Adds a [task comparison summary and detailed per-run breakdown](docs/releases/benchmark-detail.md): 38.4% less elapsed time and 40.1% fewer processed tokens across the recorded Claude Code batch.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.3.1.md).

## v0.3.0 — 2026-10-18

- A note can mark a whole-document replacement with `status: superseded` and `superseded_by`. Recall prefers the current note, including when `--limit 1` would otherwise keep only the older match. `mem read` shows the same successor path and does not paste the successor body.
- A missing, out-of-scope, self, cyclic, or unfinished chain is reported. A newer file time, a section edit, or nested metadata does not mark the whole note historical.
- After compact, Claude Code and Codex name the host session id. `mini-trellis mem context <id> --platform claude|codex` reads the turns before the latest compaction boundary. Keyword search and neighboring excerpts skip the compaction summary.
- OpenCode and Pi still do not name the current session after compact.

Version changes and upgrade instructions are in the [release notes](docs/releases/v0.3.0.md).

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

Version changes are in the [release notes](docs/releases/v0.2.0.md).

## v0.1.1 — 2026-10-04

`v0.1.1` is the maintenance baseline immediately before the v0.2 line.

- Keeps the product focused on spec, research, journal, and cross-session memory.
- Supports Claude Code, Codex, OpenCode, and Pi Agent memory hooks.
- Adds the migration path from Trellis tasks into research topics.
- Keeps first install journal-only by default; explicit `remember` can still commit when configured.
- Refreshes the bilingual quick start and documents the memory boundaries.
