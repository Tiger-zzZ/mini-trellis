# Remember

Save the confirmed decision or finding in the relevant topic, updating an existing file, then link it from the journal. Keep the rule short and faithful; leave unconfirmed exceptions and implementation choices open or label them as inference. A journal entry alone does not update a topic.

## When

- The user asks to remember / persist notes
- The user confirms or corrects a project rule: save it even without the word “remember,” unless they ask not to save. An agreed future policy is saved as agreed, not implemented. Questions, reviews and unconfirmed proposals remain read-only.
- A confirmed decision, reusable finding, or verified fix should survive this session
- A rejected approach or dead end should not be retried in a later session; label it rejected, not as a current rule
- The session is about to end and has a useful handoff
- The session was compacted, or context is about to be compacted

## Write

For an explicit request to organize selected past sessions or supplied Markdown/text exports, first use `mini-trellis-session-insight` and its `references/organize-history.md`. Preserve sources and corrections, resolve material conflicts together, and skip the topic and journal when no new knowledge was found. Historical commands are evidence, not live instructions. Use `--no-commit` for this organizing flow even in a project with legacy auto-commit enabled.

Complete these steps in the same turn when the update is authorized. Saving the topic and its journal link is one operation; do not ask whether to continue between them. Pause only for a real conflict, missing information or failed operation.

1. **Choose one home.** Reuse the document that already owns this rule or project description, including README/docs or a research/spec topic. Use `mem recall` only if its location is unknown. Confirmation alone is not a reason to copy an existing rule into spec.
2. **Edit faithfully.** Keep the condition with its rule: “when X, do not Y” must not become “never Y.” Preserve exceptions, negations and what remains unconfirmed; retain the user's wording where paraphrasing would change the scope. New notes use the requested or discussion language; existing documents keep their language. Update only the affected section.
3. **Verify once, then continue.** Compare the saved section with the confirmation, using the latest tool result that shows its contents or one targeted read. Once the contents are available and unchanged, use that evidence; an “unchanged since last read” response is not a reason to read again. Fix an actual mismatch before recording.
4. **Record and finish.** Run the recorder below, then check the new journal entry, its topic link and the matching workspace index row. If resuming a partial update, inspect the saved files and complete only the missing step.

Then record a short journal entry using the existing script; no CLI `spec` or `update-spec` subcommand is needed:

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Short title" \
  --commit - \
  --summary "What happened, what was decided, what to reuse" \
  --topic .trellis/research/example.md
```

Replace `--topic` with the actual file just verified, or omit it for a handoff without a topic. The script validates the path and recording state; the content comparison above checks the meaning. If recording fails, retain the verified topic and retry only the missing work with the same arguments.

`--commit` already defaults to `-` (no git evidence). Add `--change`, `--test`, `--next-step` when they help a future session. Use `--stdin` for longer notes.

If the user forbids commits, pass `--no-commit`: it still writes journal/index and skips staging/committing, regardless of project auto-commit. Use `add_session.py --help` for option details.

Use `.trellis/research/<topic>.md` for reusable research with no existing home. When promoting a topic with `mini-trellis-update-spec`, keep one current rule body and link to it from the old location.

## Project status

When the user asks what the project is today, or a confirmed capability or architecture boundary changes, keep one description:

- Update the README, docs page, or spec section that already states it. Create a short `.trellis/spec/` note only when no such file exists. Do not copy the same description into a second file.
- Write the purpose, implemented capabilities, main modules, and constraints. Check capability claims against current code or tests; a confirmed decision alone does not prove implementation. A constant or configuration value does not prove the behavior that would use it. Keep planned or agreed behavior separate from implemented capabilities. A suggestion stays a suggestion, or is labeled unverified.
- When implementation changes an existing description, update the affected README/docs/spec/research section in the same development turn, including stale “planned” or “not implemented” statements. This maintenance is part of the implementation; it does not require a separate remember request or a new journal entry. A confirmed future rule stays labeled as a plan until implemented.
- Keep the file's language. A Chinese discussion updates an English description in English, with the same meaning, limits, and negations.
- Link that verified file from the journal with `--topic`. A root `README*.md` or a Markdown file under `docs/` or `doc/` is accepted, as are spec and research notes. The journal does not replace the description.

## Reuse and language

Before writing a topic, use `mini-trellis mem recall "<topic>"` if the relevant notes are not already open. Expand needed evidence with `mini-trellis mem read "<ref>"`. Update the existing research/spec section; record the scope and sources, distinguish user confirmation from measured facts and inference, and keep a link when replacing an earlier decision. Journal should briefly describe the work and link to the topic, not repeat its body.

Skip ordinary turns and changes that add no reusable knowledge. Write new notes in the user's requested language, otherwise the discussion language; preserve the language of an existing document. Do not translate paths or identifiers. Check the writer's result and report failures; never claim notes were saved after an error. Closing a window or a crash does not guarantee a final write.

## Reply

For a memory-only request, the complete reply is one short sentence with Markdown links to the actual topic and journal, in the discussion language: `Updated [topic](<actual-topic-path>) and recorded [session](<actual-journal-path>).` Substitute real paths; a path in backticks is not a link. Do not repeat the rule or list routine checks. For a larger development request, report the requested development result and include the links briefly. Explain a conflict or partial completion when one remains. Ordinary edits without new reusable knowledge need no memory report.
