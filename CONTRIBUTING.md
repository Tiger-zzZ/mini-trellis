# Contributing to mini-trellis

This is a public AGPL-3.0 fork of Trellis 0.6.17. Keep the Mindfold copyright
and this modification notice.

## Scope

mini-trellis is a lightweight project memory layer: spec, research, journal,
and cross-session recall. Contributions should help agents save and find
reusable knowledge while keeping setup and daily use simple.

Supported hosts: Claude Code, Codex, OpenCode, Pi.

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
