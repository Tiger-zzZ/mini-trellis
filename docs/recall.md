# Search and recall

Use `recall` for a question about the project. Use `search`, `list`, and `context` when you need a particular conversation.

## Find a source and read it

```bash
mini-trellis mem recall "callback retries"
mini-trellis mem read "<ref-from-recall>"
```

Recall searches project documents by default. Use `--source history` for original remarks and rejected alternatives, or `--source all` to search documents and conversations together.

By default, recall returns up to three matches within a 3,000-character stdout budget, including references and status. Read uses a 4,000-character batch budget. Both accept `--max-chars`; recall also accepts `--limit`.

Illustrative output:

```text
[doc] .trellis/spec/backend/callbacks.md:1  § Callback retries  strong
  ref: <ref-from-recall>
  Transient failures receive at most four total attempts, including the first.
```

Copy the actual `ref` from your output. One document hit can show two matching sections with source line numbers. `read` expands both from the same reference and reports a changed source. Excerpts from nested Markdown sections include the enclosing headings and as much of their introduction as the budget allows. Archive and supersession labels carry through to `read`. See [changed decisions](writing-notes.md#changed-decisions).

<a id="sources"></a>
## Document sources

| Location | Discovery |
| --- | --- |
| `.trellis/spec/`, `research/`, `workspace/` | Markdown, including Git-ignored knowledge |
| Repository root | `README*.md`, `AGENTS.md`, `CLAUDE.md` |
| `docs/` and `doc/` | Markdown and MDX, read as text |
| Relative Markdown links | One bounded expansion level within the repository |

Ordinary documents respect `.gitignore`. Runtime files, scripts, secret-like filenames, and dependency/build directories are excluded. Discovery has file, size, depth, and time limits. Warnings and `incomplete` identify a partial search.

The local transcript readers cover Claude Code, Codex, OpenCode V1, Pi, and Factory Droid. Platform support is listed in [Agent setup](agents.md#capabilities).

## Choose a useful query

If the current context lacks project knowledge, open the relevant entry from `.trellis/index.md`. If the answer still lacks a condition or the hits conflict, expand a relevant ref or make one rewrite using the project's wording, including when there are nonzero hits. Stop once the evidence answers the question.

Use terms or identifiers present in the source, such as `callback retries`, an API name, or a filename. If a broad query is unhelpful, use a distinctive term from the module. For a Chinese query typed without spaces, a note with overlapping words in its body can rank ahead of an exact title match. Match strength describes lexical coverage. Use the excerpt's conditions and source status to decide whether a rule applies. Explicit paths and identifiers remain useful for finding older material.

## Locate a conversation

```bash
mini-trellis mem search "callback retries" --platform claude
mini-trellis mem list --platform claude --json --limit 10
mini-trellis mem context <full-session-id> --platform claude --grep "retry"
```

Session commands default to the current project. Use `--cwd /path/to/project` to select another project, or `--global` on session commands to broaden the scope. `recall` is always project-scoped and rejects `--global`. A platform filter narrows the conversations searched with `--source history` or `--source all`.

`mem projects` lists known project paths. Text output can shorten session IDs; copy the full ID from JSON for context lookup. Ambiguous IDs are reported so you can narrow the project and platform.

<a id="compact"></a>
## After compact

For Claude Code, Codex, and Factory Droid, the compact handoff can include the current session ID. Run the command it provides with the matching platform:

```bash
mini-trellis mem context <full-session-id> --platform codex
```

Without `--grep`, context selects a bounded set of turns before the latest compression boundary when available. Use `--grep "keyword"` for earlier conditions. Compression summaries are excluded from matching and surrounding excerpts. Codex delivers the compact hint at the next user message.

For OpenCode V1 and Pi, first select the session with `mem list`, then use its full ID with `context`. These integrations provide history lookup without an exact compact-boundary handoff. Other agents can continue using the saved project documents with `recall`.

## Interpret status

- `truncated`: more content or matches exist than fit the result limit or output budget.
- `incomplete` means the scan skipped part of the requested sources. `source` identifies the requested scope.
- A `history-gap` warning means a readable transcript omitted content, such as a pre-compact assistant reply, an encrypted payload, or a malformed record. Check warnings even when `incomplete` is false. An empty result only describes the available evidence.
- `session-history-missing` / `session-history-unreadable`: the selected history has not been found or cannot be read.
- `opencode-v2-history-unsupported`: V2 transcripts were skipped; project documents and V1 history are still searchable.

Next: [command options](commands.md#mem-options) or [troubleshooting](troubleshooting.md).
