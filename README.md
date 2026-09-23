# mini-trellis

**A memory layer for AI coding agents.** A trimmed fork of [Trellis](https://github.com/mindfold-ai/Trellis) 0.6.17 that keeps spec, research, journal and cross-session recall, and drops everything else.

English | [简体中文](./README_CN.md)

<p>
<a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/v/mini-trellis.svg?style=flat-square&color=2563eb" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/dm/mini-trellis?style=flat-square&color=cb3837&label=downloads" alt="npm downloads" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/stargazers"><img src="https://img.shields.io/github/stars/Tiger-zzZ/mini-trellis?style=flat-square&color=f59e0b" alt="GitHub stars" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/issues"><img src="https://img.shields.io/github/issues/Tiger-zzZ/mini-trellis?style=flat-square" alt="GitHub issues" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/pulls"><img src="https://img.shields.io/github/issues-pr/Tiger-zzZ/mini-trellis?style=flat-square" alt="GitHub pull requests" /></a>
</p>

## Why this fork exists

Trellis gave me four things I rely on every day: spec, research notes, session journals, and a way to search past AI conversations. It also shipped a full four-phase task workflow: `task.py`, PRD gates, sub-agent review, a per-turn breadcrumb telling the model which phase it is in. Over time I noticed I was routing around the workflow and only ever using the memory parts.

Models have moved on too. A GPT 6 / Fable 5 class agent does not need a script telling it when to plan and when to verify. What it still cannot do is remember what we decided last week, or find the conversation where we already solved this bug. That gap is what this fork keeps.

So mini-trellis cuts the workflow and keeps the memory. The "mini" is the point.

Credit where due: the heavy lifting is all Trellis. Standing on the shoulders of giants, my main contribution was deleting code.

## Trellis vs mini-trellis

Trellis is an engineering framework: it decides how a task moves from PRD to implementation to review, and it drives that with hooks on every turn, sub-agents, and a task state machine. mini-trellis is only the memory underneath that framework. It never creates a task, never tells the model what phase it is in, and never dispatches a sub-agent. It injects a short orientation at session start, lets the model read spec and research on demand, and gives it two verbs: `remember` to write the journal, and `mem` to search past dialogue. Everything Trellis does *around* memory is left to the model and to you.

| | Trellis 0.6.17 | mini-trellis 0.1.0 |
|---|---|---|
| Purpose | Engineering framework: spec + task workflow + memory | Memory layer only |
| Hosts | 22 AI coding tools | Claude Code, Codex, OpenCode, Pi |
| Hooks | SessionStart + per-turn breadcrumb + PreToolUse sub-agent injection | SessionStart only |
| Task system | `task.py`, `tasks/`, PRD / jsonl gates, `workflow.md`, archive | None |
| Sub-agents | `trellis-research` / `implement` / `check` | None |
| Skills & commands shipped | ~10 skills, 3 commands, 3 agents | `remember`, `session-insight`, `update-spec` |
| CLI | init, update, workflow, channel, ablate, restore, mem, upgrade, uninstall, platforms | init, migrate, mem, upgrade, uninstall, platforms |
| Spec | 7-section templates per layer, generated at init | One short seed; you write short markdown |
| Research | Lives inside a task directory | First-class `.trellis/research/` inbox with a cold `archive/` |
| Journal trigger | Task archive, then `finish-work` | `remember`, plus a reminder after compact |
| Code shipped | ~110k lines across `packages/` | ~31k lines |
| License | AGPL-3.0 | AGPL-3.0 (unchanged) |

If you want an opinionated workflow with guard rails, use Trellis. If you want your agent to remember and stay out of the way, use this.

## What's kept

| Path | What it is |
|------|------------|
| `.trellis/spec/` | Durable contracts, short markdown; read `index.md` first |
| `.trellis/research/<topic>.md` | Research inbox; `git mv` stale notes into `research/archive/` |
| `.trellis/workspace/<you>/journal-*.md` | Session notes, auto-committed by remember |
| `mini-trellis mem search <kw>` | Past chat from Claude / Codex / OpenCode / Pi |

## How a session goes

1. **SessionStart** injects a few lines: your journal path, the spec index paths, the hot research topics. Paths only, never bodies. Nothing about tasks or phases.
2. **During the session** the model reads spec or research on demand, and reaches for `mini-trellis mem` when a question sounds like "didn't we already discuss this".
3. **At the end, or after a compact,** `remember` appends a session entry to your journal and commits it. If the session produced reusable research, it lands in `.trellis/research/<topic>.md`; a boundary that should still hold next week goes into spec via `mini-trellis-update-spec`.

## Install

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
# also: --codex --opencode --pi
```

Python ≥ 3.9 is required for the journal scripts and SessionStart hooks. Codex SessionStart needs `[features].hooks = true` in `~/.codex/config.toml`, then a one-time `/hooks` approval.

| Command | What it does |
|---|---|
| `mini-trellis init` | Write the memory skeleton and the host surfaces for the flags you pass |
| `mini-trellis mem list\|search\|context\|extract\|projects` | Search local session logs of the four hosts; nothing is uploaded |
| `mini-trellis migrate` | Convert a Trellis project (see below) |
| `mini-trellis upgrade` | Upgrade the global CLI via npm |
| `mini-trellis uninstall` | Remove the host files and `.trellis/` from a project |
| `mini-trellis platforms` | Show which hosts are configured here |

There is no `update` command that rewrites project files.

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

## Feedback

This was cut in a hurry. Please try it, complain freely in [issues](https://github.com/Tiger-zzZ/mini-trellis/issues), and send pull requests; see [CONTRIBUTING](./CONTRIBUTING.md) for the local setup. Thanks to the Trellis team, and to everyone on the forum who pushed for a smaller Trellis.

## License

AGPL-3.0. Original copyright Mindfold LLC; this fork's modification notice is in `COPYRIGHT`.
