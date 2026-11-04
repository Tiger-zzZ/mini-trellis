# Contributing to mini-trellis

This is a public AGPL-3.0 fork of Trellis 0.6.17. Keep the Mindfold copyright
and this modification notice.

## Scope

mini-trellis is a lightweight project memory layer: spec, research, journal,
and cross-session recall. Contributions should help agents save and find
reusable knowledge while keeping setup and daily use simple.

Supported hosts: Claude Code, Codex, OpenCode, Pi, DeepSeek Harness, and Cursor. DeepSeek has no project SessionStart. Cursor-managed cloud agents do not run `sessionStart`; self-hosted machines remain unverified. Neither of those hosts parses local conversation history. OpenCode and Pi have no precise compact.

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

Keep the CLI and core package versions aligned, update the changelog and release notes, and verify the package contents before publishing. Publish core before the CLI, which depends on that version.

Use `mini-trellis-v<version>` for new release tags, following `mini-trellis-v0.3.2`. Local clones retaining upstream Trellis tags may contain `v0.3.3` and `v0.3.4`; those are not mini-trellis releases. Do not move them or push all local tags. Push only the intended tag at the verified release commit.

The [documentation site](https://mini-trellis.github.io/) has a [separate repository](https://github.com/mini-trellis/mini-trellis.github.io). Synchronize both languages, navigation, release notes, and the current-version notice with the published npm version. Keep benchmark numbers tied to the version actually measured.
