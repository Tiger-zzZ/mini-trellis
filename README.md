# mini-trellis

Minimal memory layer for AI coding agents. Fork of [Trellis](https://github.com/mindfold-ai/Trellis) 0.6.17.

Keeps four things: **spec**, **research**, **journal**, and **cross-session dialogue search**. Drops the four-phase task workflow.

License: AGPL-3.0. Original copyright Mindfold LLC; this fork adds a modification notice in `COPYRIGHT`.

## Install

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
# also: --codex --opencode --pi
```

Python ≥ 3.9 is required for journal scripts and SessionStart hooks.

## Use

| Path | What it is |
|------|------------|
| `.trellis/spec/` | Durable contracts (short markdown; read `index.md` first) |
| `.trellis/research/<topic>.md` | Topic inbox. Move stale notes to `research/archive/` |
| `.trellis/workspace/<you>/journal-*.md` | Session notes |
| `mini-trellis mem search <kw>` | Past chat from Claude / Codex / OpenCode / Pi |

Record a session:

- Claude / OpenCode: `/mini-trellis:remember`
- Pi: `/mini-trellis-remember`
- Codex: `$mini-trellis-remember` (skill)

Promote a lasting boundary into spec with the `mini-trellis-update-spec` skill.

## Hosts

Claude Code, Codex, OpenCode, Pi. Same data directory: `.trellis/`.

Codex SessionStart needs user-level `[features].hooks = true` in `~/.codex/config.toml`, then a one-time `/hooks` approval.

## CLI

```
mini-trellis init
mini-trellis mem list|search|context|extract|projects
mini-trellis platforms
mini-trellis upgrade
mini-trellis uninstall
```

There is no `update` command that rewrites project files. Upgrade the CLI with `mini-trellis upgrade`.
