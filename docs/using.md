# Using it while you code

This is one callback-handler change: when to look something up, and when to write it down. Run the commands from the project root. The record command is `/mini-trellis:remember` in Claude Code and OpenCode, `$mini-trellis-remember` in Codex, and `/mini-trellis-remember` in Pi.

## Look it up before editing

```bash
mini-trellis mem recall "callback retries"
```

Each hit is a short excerpt with a path and a `ref`. Edit from the excerpt when it is enough. To open the note or the original conversation:

```bash
mini-trellis mem read "<ref>"
```

For conversations only, run `mini-trellis mem search "callback retries"`, then `mini-trellis mem context <session-id>` with a returned session ID.

If nothing matches, change the code. You do not create a task first.

## What to write down

Keep a conclusion only when a later session would need it.

| What happened | Where it goes | What to ask |
| --- | --- | --- |
| Callbacks must carry an idempotency key. | `.trellis/spec/` | Write this as a project convention and update the existing spec. |
| The provider allows at most two retries. | `.trellis/research/` | Update the research note with the conclusion, its conditions, and the doc link. |
| Deduplicating before the ledger made reconciliation wrong, so that approach was dropped. | The same research note | Label it rejected. Do not write it as a current rule. |
| Which files changed, and whether the test passed. | The journal under `.trellis/workspace/<you>/` | Run `remember` before the session ends. |

The journal records the work and the note path. The rule itself lives in spec or research. If a file already covers the topic, edit that file.

You can hand this to the agent:

```text
Confirmed: every callback carries an idempotency key, and a repeat returns the first result.
Deduplicating before the ledger was tried and broke reconciliation. Label that rejected.
Update the existing spec, add the provider doc link to the research note, then run remember.
```

`remember` updates the topic, then links it from the journal. A new install writes the files and does not create a Git commit.

## The next session

```bash
mini-trellis mem recall "callback idempotency"
```

Read the convention and the rejected approach, then edit. After `/compact`, the earlier turns remain in the local session. `mem recall` can find them, and `mem read` expands the one you need.

When a durable rule changes, say which one it replaces. Update the spec, and point the old research note at the new file.
