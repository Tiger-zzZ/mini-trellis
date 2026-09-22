---
name: mini-trellis-session-insight
description: "Reach into past AI conversation history through the `mini-trellis mem` CLI. Use whenever the user asks 'how did we solve X last time', 'have we discussed this before', 'what was the decision on X', '上次怎么解的', '之前讨论过吗', or when continuing work across sessions. Returns raw past dialogue; decide whether to update spec, quote inline, or just internalize."
---

# Session Insight

How to call `mini-trellis mem` and when that is the right move. Capability, not a workflow. No required write-back.

## What it is

A local CLI that indexes past Claude Code, Codex, OpenCode, and Pi conversation logs. Nothing is uploaded.

```bash
mini-trellis mem search "<keyword>"
mini-trellis mem extract <session-id> --grep "<keyword>"
mini-trellis mem context <session-id> --turns 3 --around 2
mini-trellis mem list --cwd <project-path>
mini-trellis mem projects
```

Full flags: `mini-trellis mem help`.

## When

- The user asks whether a decision was already made
- A bug or topic feels familiar from an earlier session
- The user resumes after a gap ("where were we")

## When not

- The answer is already in the current turn, spec, git log, or open files
- The user asked not to dig through history

## After a hit

Treat output as raw material. Quote it, promote a durable boundary with `mini-trellis-update-spec`, or just use it. Do not invent a task directory.
