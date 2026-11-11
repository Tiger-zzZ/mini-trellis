# Organize selected conversations

Use the `mini-trellis-session-insight` skill to turn a selected conversation or text export into project knowledge. Available since v0.3.6, it updates existing documents and links the result from a journal.

## Choose the source

Native history readers support Claude Code, Codex, OpenCode V1, and Pi. List sessions in the current project and copy the full ID from JSON:

```bash
mini-trellis mem list --platform claude --json --limit 10
```

For other agents, provide a Markdown or plain-text export. See [Agent setup](agents.md#capabilities) for supported sources.

## Ask for a focused review

```text
Use mini-trellis-session-insight to organize the callback discussion in
Claude session <full-session-id>. Update the relevant README, docs, spec,
or research note. Keep the sources, confirmed decisions, corrections,
and exceptions. Ask me about any unresolved substantive conflict.
```

Or supply an export:

```text
Use mini-trellis-session-insight to organize exports/callback-chat.md.
Use this export as the historical source and update the existing
project documents about callbacks.
```

The agent reads the selected material in portions, checks current documentation and relevant code or tests, then separates implemented behavior, confirmed future work, and proposals. Old commands are treated as historical evidence.

## Check the result

- The existing topic contains the useful conclusion, with its conditions and sources.
- Corrections and rejected proposals are represented accurately.
- The original document language is preserved.
- The journal links to the updated files.
- Unread material, unclear speakers, missing sources, and unresolved conflicts are identified.

The skill uses `--no-commit` for its journal entry. Repeating the same request without new knowledge produces no additional note or journal. On a partial failure, complete the missing part after checking the files already written.

## Use the result in another session

```bash
mini-trellis mem recall "callback retries"
```

Ask the agent to apply the saved rule to a small change, and verify that the rule and its exceptions appear in the result. This checks both the saved document and its usefulness in a later session.

## Read history directly

`mem context` returns a bounded excerpt. To review an entire supported conversation, use `mem extract` and read the export in sections:

```bash
mini-trellis mem extract <full-session-id> --platform claude > /tmp/callback-history.md
```

`extract` has no output-size budget. Choose an appropriate private location for the export and remove it after use. Session discovery and excerpts are described in [Search and recall](recall.md).
