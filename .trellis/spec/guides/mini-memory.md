# Mini-Trellis Memory Layer

> SessionStart orients from journal, spec indexes, and research. It does not create or drive tasks.

## Layers

| Layer | Path | Role |
|-------|------|------|
| Journal | `.trellis/workspace/<dev>/journal-*.md` | Git-durable session notes |
| Research | `.trellis/research/<topic>.md` | Topic inbox. `README.md` is not a topic |
| Spec | `.trellis/spec/**/index.md`, then linked files | Durable contracts. Short markdown |
| Dialogue | `mini-trellis mem list\|search\|context\|extract` | Cross-session chat |

## SessionStart contract

- Inject the active journal path, spec **index** paths, and research topic files.
- Do **not** list individual spec articles — only `index.md`.
- Do **not** inject `.trellis/research/archive/`.
- Compact source: remind `/mini-trellis:remember` if durable notes from the compacted window are missing.

## Remember

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Short title" \
  --commit - \
  --summary "What happened, what was decided, what to reuse"
```

If the session produced reusable research, write `.trellis/research/<topic>.md`. Promote a note into `.trellis/spec/` only if the boundary still holds, then link it from the matching `index.md`. Cold research: `git mv` into `.trellis/research/archive/`.

## Don't

- Treat `.trellis/research/README.md` as a topic.
- Expect SessionStart to inline a spec article; read it on demand from the index.
