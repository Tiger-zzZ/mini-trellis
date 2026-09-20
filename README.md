# mini-trellis

A memory layer for AI coding agents. A trimmed fork of [Trellis](https://github.com/mindfold-ai/Trellis) 0.6.17.

## Why this fork exists

Trellis gave me four things I rely on every day: spec, research notes, session journals, and a way to search past AI conversations. It also shipped a full four-phase task workflow: task.py, PRD gates, sub-agent review. Over time I noticed I was routing around the workflow and only ever using the memory parts.

So this fork cuts the workflow and keeps the memory. The "mini" is the point.

Credit where due: the heavy lifting is all Trellis. Standing on the shoulders of giants, my main contribution was deleting code.

## What's kept

| Path | What it is |
|------|------------|
| `.trellis/spec/` | Durable contracts, short markdown; read `index.md` first |
| `.trellis/research/<topic>.md` | Research inbox; `git mv` stale notes into `research/archive/` |
| `.trellis/workspace/<you>/journal-*.md` | Session notes, auto-committed by remember |
| `mini-trellis mem search <kw>` | Past chat from Claude / Codex / OpenCode / Pi |

## Install

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
# also: --codex --opencode --pi
```

Python ≥ 3.9 is required for the journal scripts and SessionStart hooks. Codex SessionStart needs `[features].hooks = true` in `~/.codex/config.toml`, then a one-time `/hooks` approval.

Upgrade the CLI with `mini-trellis upgrade`. There is no `update` command that rewrites project files.

## Record a session

- Claude / OpenCode: `/mini-trellis:remember`
- Codex: `$mini-trellis-remember`
- Pi: `/mini-trellis-remember`

Promote a lasting boundary into spec with the `mini-trellis-update-spec` skill.

## License

AGPL-3.0. Original copyright Mindfold LLC; this fork's modification notice is in `COPYRIGHT`.
