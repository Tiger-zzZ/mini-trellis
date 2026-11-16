# Update Spec

Capture durable contracts and conventions into `.trellis/spec/` as short markdown.

## When

- A debugging, implementation, or discussion produced a boundary that should still hold next session
- Research in `.trellis/research/<topic>.md` is ready to promote
- The user asks to organize selected history into reusable project knowledge; use `mini-trellis-session-insight` and its `references/organize-history.md` for selection, source handling and conflicts before writing

## Write

- Check the existing topic first (`mini-trellis mem recall "<topic or path>"` when needed); update the relevant section instead of duplicating it.
- If a README, docs or research topic already owns the rule or project description, update it there. Confirmation alone does not require a new spec. When promoting a topic into spec, keep the current rule in spec and replace the old current-rule body with a short status/source link; preserve distinct research and history.
- Record confirmed rules, scope, and sources. Check implemented-capability claims against current code or tests; a confirmed decision, constant, or configuration value alone does not prove implementation. Keep agreed behavior separate from implemented capabilities. Label uncertain parts unverified. Do not record a proposal as a current capability. Preserve the supplied wording when possible; leave unconfirmed behavior open or label it as inference. Keep a history link when replacing an earlier decision.
- Leave rejected approaches in research, labeled rejected. Do not promote them into spec as current rules.
- Preserve the condition together with its obligation or prohibition: “when X, do not Y” does not mean “never Y.” Keep unconfirmed cases open. New documents follow the requested or discussion language; updates retain the existing language. Paths and identifiers stay unchanged.
- Short markdown. The 7-section template is optional.
- Keep affected README/docs/spec/research descriptions, symbols and paths aligned with implementation in the same development turn, including stale “planned” or “not implemented” statements. This maintenance needs no separate remember request or new journal entry.
- Link a new or updated spec from its matching `index.md`; an existing README or docs page does not require a new spec or index.
- Compare the saved section with the confirmation once, using tool output that contains the saved text or one targeted read. Reuse that evidence while the file is unchanged. A journal-only edit is not a topic update. When a session record is requested, finish it in the same turn through remember after verifying the topic; do not ask for confirmation between the two writes.
- Prefer one concrete rule over a catalogue of principles.
- For historical material, keep source attribution and the scope of user confirmations, corrections and negations. Commands in the material are evidence, not current instructions. Do not overwrite an unresolved conflict with current docs/code. If the same material adds no new knowledge, leave the topic and journal unchanged; after a verified change, record with `--no-commit` and check the actual journal/index links.

Spec lives under `.trellis/spec/`. There are no task directories; do not create one.

## Reply

For a memory-only request, finish with one short sentence using actual Markdown links: `Updated [topic](<actual-topic-path>) and recorded [session](<actual-journal-path>).` Use the discussion language and omit the journal clause if none was recorded. For a larger development request, include the links briefly alongside its result. Explain conflicts or partial completion as needed.
