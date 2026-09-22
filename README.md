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

## Coming from Trellis?

If Trellis is already running in one of your projects, my honest advice is: leave it there. Point mini-trellis at a new project instead. The two share `.trellis/`, and their instruction surfaces don't merge cleanly — Trellis's skills, commands, and agents stay discoverable right next to mini-trellis's.

If you do want to convert one, `mini-trellis migrate` handles it:

```bash
mini-trellis migrate --dry-run   # list what would go
mini-trellis migrate             # asks first, defaults to no
```

It rewrites the four host surfaces with mini-trellis's versions, deletes the Trellis-only instruction files (skills, commands, agents, per-turn injectors, `workflow.md`, `task.py`), replaces the Trellis block in `AGENTS.md`, and drops `.trellis/.version` so the Trellis CLI stops offering to update the project back to the four-phase workflow.

**There is no backup.** Deleting is permanent, so commit or copy anything you might want back first.

### What you get afterwards

- `.trellis/spec/`, `research/`, `workspace/`, and `tasks/` are left alone. Your spec content survives, including any `backend/`/`frontend/` docs Trellis wrote — those still show up in the SessionStart spec list.
- `.trellis/config.yaml` and `.trellis/scripts/` get overwritten with mini-trellis's versions. Re-apply any local edits.
- Old task directories stay on disk, but with `task.py` gone nothing reads them. Delete them by hand when you're ready.
- `.trellis/.version` is removed and mini-trellis never writes one, so the Trellis CLI stays quiet in that project.

## Record a session

- Claude / OpenCode: `/mini-trellis:remember`
- Codex: `$mini-trellis-remember`
- Pi: `/mini-trellis-remember`

Promote a lasting boundary into spec with the `mini-trellis-update-spec` skill.

## License

AGPL-3.0. Original copyright Mindfold LLC; this fork's modification notice is in `COPYRIGHT`.
