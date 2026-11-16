# Mini-Trellis Memory Layer

> SessionStart orients from journal, spec indexes, and research. It does not create or drive tasks.

## Layers

| Layer | Path | Role |
|-------|------|------|
| Journal | `.trellis/workspace/<dev>/journal-*.md` | Per-developer session notes |
| Research | `.trellis/research/<topic>.md` | Topic inbox. `README.md` is not a topic |
| Spec | `.trellis/spec/**/index.md`, then linked files | Durable contracts. Short markdown |
| Recall | `mini-trellis mem recall "<query>"` | Project Markdown and cross-session dialogue |

## SessionStart contract

- Deliver a short memory entry and the active journal path; do not enumerate research topics or inject their bodies.
- Retrieve relevant rules and research on demand with `mini-trellis mem recall "<query>"`. Use `mini-trellis mem read "<ref>"` only when excerpts lack necessary context or conditions.
- Archived research remains searchable and is marked archived; it is not injected at startup.
- A note can declare successor lineage with front matter or a short preamble mark (`status: superseded` and/or `superseded_by: <repo-relative.md>`). A short chain is followed to the last current note inside the same document sources; recall can include one short excerpt of that note, and `mem read` shows the same path without its body. A missing, escaping, self, cyclic, or too-long target is reported and not treated as the current rule. Nested metadata, one edited section, a newer mtime, or a nearby source edit does not mark the whole note historical.
- After compact, restore the short entry and remember any confirmed conclusions that have not been saved.

## Remember

When the user confirms or corrects a project rule, use remember even without an explicit “remember” request, unless they ask not to save. Record future policy as agreed, not implemented. Finish the authorized update in one turn: update the document that already owns the rule, compare the saved section once, then record and verify its journal link. Reuse returned contents while unchanged. Existing README/docs/research/spec topics are valid homes; confirmation alone does not require a second copy in spec.

Keep conditions with their rules: “when X, do not Y” must not become “never Y.” Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Short title" \
  --commit - \
  --summary "What happened, what was decided, what to reuse" \
  --topic .trellis/research/example.md
```

Use the actual topic path; omit `--topic` for a handoff without a topic. The script writes journal/index and a relative topic link; it does not edit the topic. Verify the files before reporting completion. Skip ordinary changes and unconfirmed ideas. New notes follow the discussion language; updates keep the original document's language.

For a verified memory-only update, use one short sentence with actual topic and journal Markdown links; include them briefly with the result of a larger development request. Expand for a conflict or partial completion. A saved record does not establish that development or tests succeeded. A failed index update keeps the journal: repair the reported structure and retry the same command. Same-checkout recording is serialized; separate worktrees and direct topic edits still need conflict review.

When implementation changes make an existing README/docs/spec/research description stale, update the affected section and implementation status in the same development turn. This maintenance needs no separate remember request or new journal entry. Questions, reviews, ordinary edits and unconfirmed proposals need no memory report.

When promoting a boundary into `.trellis/spec/`, link it from the matching `index.md` and replace the old current-rule body with a short source/status link. Keep distinct research and history. Cold research can move into `.trellis/research/archive/`. When a whole note is replaced, leave a superseded mark on the old note pointing at the new path instead of deleting history:

```markdown
---
status: superseded
superseded_by: .trellis/research/new-topic.md
---
```
