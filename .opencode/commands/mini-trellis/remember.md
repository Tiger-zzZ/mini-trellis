# Remember

Record this session into the journal.

## When

- The user asks to remember / persist notes
- The session is about to end
- The session was compacted, or context is about to be compacted

## Write

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Short title" \
  --commit - \
  --summary "What happened, what was decided, what to reuse"
```

`--commit` already defaults to `-` (no git evidence). Add `--change`, `--test`, `--next-step` when they help a future session. Use `--stdin` for longer notes.

If this session produced reusable research, write `.trellis/research/<topic>.md` and mention that path in the summary. Promote durable boundaries into `.trellis/spec/` with `mini-trellis-update-spec` (short markdown).
