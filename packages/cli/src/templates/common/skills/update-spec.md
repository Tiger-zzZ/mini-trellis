# Update Spec

Capture durable contracts and conventions into `.trellis/spec/` as short markdown.

## When

- A debugging, implementation, or discussion produced a boundary that should still hold next session
- Research in `.trellis/research/<topic>.md` is ready to promote

## Write

- Check the existing topic first (`mini-trellis mem recall "<topic or path>"` when needed); update the relevant section instead of duplicating it.
- If a README or docs page already states the project description, update that section when the confirmed boundary belongs there. Add a spec file only for a durable rule that has no home. Do not keep two copies.
- Record confirmed rules, scope, and sources. Check implemented-capability claims against current code or tests; a confirmed decision, constant, or configuration value alone does not prove implementation. Keep agreed behavior separate from implemented capabilities. Label uncertain parts unverified. Do not record a proposal as a current capability. Preserve the supplied wording when possible; leave unconfirmed behavior open or label it as inference. Keep a history link when replacing an earlier decision.
- Leave rejected approaches in research, labeled rejected. Do not promote them into spec as current rules.
- New documents follow the requested or discussion language; updates retain the existing language. Paths and identifiers stay unchanged.
- Short markdown. The 7-section template is optional.
- Keep symbol and path references current after a rename without rewriting unrelated sections or adding a journal entry for the rename alone.
- Link a new or updated spec from its matching `index.md`; an existing README or docs page does not require a new spec or index.
- Read back the changed rule before reporting success. A journal-only edit is not a topic update. For a requested session record, use `add_session.py --title "..." --summary "..." --topic <actual-topic-path>` after verifying the file.
- Prefer one concrete rule over a catalogue of principles.

Spec lives under `.trellis/spec/`. There are no task directories; do not create one.
