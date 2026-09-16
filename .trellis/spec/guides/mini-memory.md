# Mini-Trellis Memory Layer

> SessionStart orients from journal, spec indexes, and research. It does not create or drive Trellis tasks.

## Layers

| Layer | Path | Role |
|-------|------|------|
| Journal | `.trellis/workspace/<dev>/journal-*.md` | Git-durable session notes |
| Research | `.trellis/research/<topic>.md` | Topic inbox. `README.md` is not a topic |
| Spec | `.trellis/spec/**/index.md`, then linked files | Durable contracts. Short markdown; the 7-section template is optional |
| Dialogue | `trellis mem list\|search\|context\|extract` | Cross-session chat. Ignore `--phase` |

## SessionStart contract

- Inject the active journal path, spec **index** paths, and research topic files.
- Do **not** list individual spec articles — only `index.md`.
- Do **not** emit `<trellis-workflow>`, `<task-status>`, or Current task.
- Do **not** create, start, or archive Trellis tasks from this context.
- Compact source: remind `/trellis:remember` if durable notes from the compacted window are missing.

## Remember

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Short title" \
  --commit - \
  --summary "What happened, what was decided, what to reuse"
```

`--commit` already defaults to `-`. Default `session_auto_commit` is true; pass `--no-commit` unless you intend to stage tracked workspace files.

If the session produced reusable research, write `.trellis/research/<topic>.md`. Promote a note into `.trellis/spec/` only if the boundary still holds, then link it from the matching `index.md`.

## Don't

- Run `task.py` create / start / archive from SessionStart or `/trellis:remember`.
- Treat `.trellis/research/README.md` as a topic.
- Expect SessionStart to inline a spec article; read it on demand from the index.
