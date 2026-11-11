# Search and recall

Use `recall` for a question about the project. Use `search`, `list`, and `context` when you need a particular conversation.

## Find a source and read it

```bash
mini-trellis mem recall "callback retries"
mini-trellis mem read "<ref-from-recall>"
```

By default, recall returns up to three matches within a 3,000-character stdout budget, including references and status. Read uses a 4,000-character batch budget. Both accept `--max-chars`; recall also accepts `--limit`.

Illustrative output:

```text
[doc] .trellis/spec/backend/callbacks.md:1  § Callback retries  strong
  ref: <ref-from-recall>
  Transient failures receive at most four total attempts, including the first.
```

Copy the actual `ref` from your output. References encode source locations, and a later read can report that the source changed. A `superseded` result points to its replacement; see [changed decisions](writing-notes.md#changed-decisions).

<a id="sources"></a>
## Document sources

| Location | Discovery |
| --- | --- |
| `.trellis/spec/`, `research/`, `workspace/` | Markdown, including Git-ignored knowledge |
| Repository root | `README*.md`, `AGENTS.md`, `CLAUDE.md` |
| `docs/` and `doc/` | Markdown and MDX, read as text |
| Relative Markdown links | One bounded expansion level within the repository |

Ordinary documents respect `.gitignore`. Runtime files, scripts, secret-like filenames, and dependency/build directories are excluded. Discovery has file, size, depth, and time limits. Warnings and `incomplete` identify a partial search.

The local transcript readers cover Claude Code, Codex, OpenCode V1, and Pi. Platform support is listed in [Agent setup](agents.md#capabilities).

## Choose a useful query

Use terms or identifiers present in the source, such as `callback retries`, an API name, or a filename. If a broad query is unhelpful, use a distinctive term from the module. A current note containing the answer can rank ahead of an archived note that mainly matches the title. Explicit paths and identifiers remain useful for finding older material.

## Locate a conversation

```bash
mini-trellis mem search "callback retries" --platform claude
mini-trellis mem list --platform claude --json --limit 10
mini-trellis mem context <full-session-id> --platform claude --grep "retry"
```

Session commands default to the current project. Use `--cwd /path/to/project` to select another project, or `--global` on session commands to broaden the scope. `recall` is always project-scoped and rejects `--global`. A platform filter narrows transcript sources; project documents still participate in recall.

`mem projects` lists known project paths. Text output can shorten session IDs; copy the full ID from JSON for context lookup. Ambiguous IDs are reported so you can narrow the project and platform.

<a id="compact"></a>
## After compact

For Claude Code and Codex, the compact handoff can include the current session ID. Run the command it provides with the matching platform:

```bash
mini-trellis mem context <full-session-id> --platform codex
```

Without `--grep`, context selects a bounded set of turns before the latest compression boundary when available. Use `--grep "keyword"` for earlier conditions. Compression summaries are excluded from matching and surrounding excerpts. Codex delivers the compact hint at the next user message.

For OpenCode V1 and Pi, first select the session with `mem list`, then use its full ID with `context`. These integrations provide history lookup without an exact compact-boundary handoff. Other agents can continue using the saved project documents with `recall`.

## Interpret status

- `truncated`: more content or matches exist than fit the result limit or output budget.
- `incomplete`: some sources could not be fully searched. Read the warning before concluding that no record exists.
- `session-history-missing` / `session-history-unreadable`: the selected history has not been found or cannot be read.
- `opencode-v2-history-unsupported`: V2 transcripts were skipped; project documents and V1 history are still searchable.

Next: [command options](commands.md#mem-options) or [troubleshooting](troubleshooting.md).
