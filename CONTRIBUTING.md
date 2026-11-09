# Contributing to mini-trellis

This is a public AGPL-3.0 fork of Trellis 0.6.17. Keep the Mindfold copyright
and this modification notice.

## Scope

mini-trellis is a lightweight project memory layer: spec, research, journal,
and cross-session recall. Contributions should help agents save and find
reusable knowledge while keeping setup and daily use simple.

Supported hosts: Claude Code, Codex, OpenCode, Pi, DeepSeek Harness, Cursor, CodeBuddy, and ZCode. DeepSeek has no project SessionStart. Cursor-managed cloud agents do not run `sessionStart`; self-hosted machines remain unverified. Neither of those hosts parses local conversation history. OpenCode and Pi have no precise compact.

## How to work

```bash
pnpm install
pnpm --filter mini-trellis-core build
pnpm --filter mini-trellis typecheck
pnpm --filter mini-trellis test
```

`.trellis/` is not tracked here: it is each contributor's own memory layer.
After `pnpm build`, run `node packages/cli/bin/mini-trellis.js init -u <you> --claude`
once so the SessionStart hook in `.claude/` has something to read.

Create a feature branch from the current development branch, make your changes,
and submit a pull request.

## Release checks

Follow the [maintenance and release workflow](docs/maintenance-workflow.md) for acceptance, PR merges, tags and website updates. CLI and core share the same version. Tag the merged, verified main commit as `vX.Y.Z` (for example, `v0.3.7`). The maintainer publishes npm manually, core first and CLI second.

The [documentation site](https://mini-trellis.github.io/) has a [separate repository](https://github.com/mini-trellis/mini-trellis.github.io). Update both languages, navigation, release notes and the current-version notice with the release. Keep benchmark numbers tied to the version actually measured.
