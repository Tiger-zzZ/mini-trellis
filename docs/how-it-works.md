# How it works

mini-trellis connects project documents, agent skills, and local conversation history. Markdown files hold the knowledge; the CLI finds relevant passages; your coding agent uses and updates them during development.

## Knowledge lives in the project

| Content | Location | Example |
| --- | --- | --- |
| Conventions | `.trellis/spec/` | A callback requires an idempotency key. |
| Research | `.trellis/research/` | Why a retry policy was chosen, with sources and alternatives. |
| Journals | `.trellis/workspace/<name>/` | What changed, what was checked, and links to the topic. |
| Existing documentation | Root README files, `docs/`, `doc/` | Current architecture and user guides. |
| Conversation evidence | The agent's local session store | The original discussion behind a decision. |

Existing project documents remain in place. A journal links to the current topic instead of copying the whole explanation. See [writing knowledge](writing-notes.md).

## The startup entry points to knowledge

Supported integrations give the agent a short orientation: journal location, spec indexes, and research entry points. It can then retrieve the documents relevant to the work.

Injection timing depends on the agent. Claude Code uses SessionStart; OpenCode V2 rebuilds the short entry for each outgoing model request; DeepSeek Harness uses project instructions and skills. The [platform matrix](agents.md#capabilities) describes the differences. Startup size is therefore a measured property of a particular integration and version, rather than a universal constant.

## Recall first, expand when useful

```bash
mini-trellis mem recall "callback retries"
mini-trellis mem read "<ref-from-recall>"
```

`recall` searches project Markdown and supported local transcripts. It returns short excerpts with source references. `read` expands a reference. The search is local and lexical; it uses words and identifiers in the material. No embedding service is involved.

## Update the knowledge as the project changes

When a rule changes, update the existing document. Research can retain the previous reasoning and rejected approaches. For a whole document replacement, a `superseded_by` link records the relationship and helps recall identify the current note.

The agent's `remember`, `update-spec`, and `session-insight` skills guide these edits. Their roles are explained in [Commands and skills](commands.md#skills). Planning, coding, and review use your existing development process.

## Local storage and sharing

The CLI reads local files. Knowledge can be reviewed and shared through Git, while conversation history remains in each agent's local store. A coding agent may send the excerpts it reads to its configured model provider. See [configuration and sharing](configuration.md#sharing) for files to include or ignore.
