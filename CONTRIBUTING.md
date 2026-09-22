# Contributing to mini-trellis

This is a public AGPL-3.0 fork of Trellis 0.6.17. Keep the Mindfold copyright
and this modification notice.

## Scope

v1 is a memory layer: spec, research, journal, mem. Do not add the four-phase
task workflow, extra agent hosts, or an `update` command that rewrites project
files.

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

Do not write onto Trellis `main`. Work on the `mini-trellis` branch.
