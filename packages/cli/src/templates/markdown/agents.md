<!-- TRELLIS:START -->
# mini-trellis

This project uses mini-trellis as a memory layer. Working knowledge lives under `.trellis/`:

- `.trellis/spec/` — durable contracts (short markdown; read `index.md` first)
- `.trellis/research/` — topic inbox (`<topic>.md`; `README.md` is not a topic)
- `.trellis/workspace/` — per-developer journals

Record a session with `/mini-trellis:remember` (Claude/OpenCode), `/mini-trellis-remember` (Pi/OMP/Kiro/Antigravity/Droid), `$mini-trellis-remember` (Codex/ZCode), or the `mini-trellis-remember` skill (Cursor and DeepSeek Harness). When earlier decisions or relevant project rules are needed, use `mini-trellis mem recall "<topic or path>"`; expand evidence with `mini-trellis mem read "<ref>"`. No search is required for unrelated work. Promote lasting boundaries into spec with `mini-trellis-update-spec`.

When the user confirms or corrects a project rule, save it through remember even without an explicit “remember” request, unless they ask not to save. An agreed future policy is recorded as agreed, not implemented. Also record reusable findings or a useful session/compact handoff. Questions, reviews, ordinary edits and unconfirmed proposals need no new record. New installs write notes without an automatic git commit; use `mini-trellis doctor` to check host wiring and `mini-trellis refresh --dry-run` before refreshing assets.

Keep one current rule in the document that already owns it. Preserve conditions with their rules: “when X, do not Y” must not become “never Y.” Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

For a confirmed update, use remember to edit the existing topic, verify the saved section once, record the journal link, and check the new entry/index row. Complete these authorized steps in the same turn without asking again between writes. Reuse returned file contents while unchanged instead of repeating reads. Journal-only success is not topic success; report partial writes accurately. New notes follow the requested or discussion language; updates preserve the document language.

For a memory-only update, reply with one short sentence using actual topic and journal Markdown links; expand for conflicts or partial writes. In a development task, include the links briefly with the requested result. Update affected README/docs/spec/research descriptions, including stale implementation status, in the same turn as the code. This maintenance needs no separate remember request or new journal entry.

When recall excerpts already answer the question with source and qualifiers, cite them and stop. Expand only missing context; do not repeat a lookup or fall back to dialogue-only `search` merely to reconfirm sufficient evidence.

Use project knowledge or supply Markdown/text exports when working with earlier ZCode, Kiro, OMP, or Antigravity conversations. To organize selected past sessions or supplied exports into project knowledge, use `mini-trellis-session-insight`, update existing documents, and preserve sources.

mini-trellis does not create or drive tasks.

Managed by mini-trellis. Edits outside this block are preserved.
<!-- TRELLIS:END -->
