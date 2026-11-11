# Day-to-day use

Use mini-trellis when previous decisions matter, and record conclusions that will help a later change. The examples below follow one callback fix from lookup to reuse.

## Look up the existing rule

```bash
mini-trellis mem recall "callback idempotency"
```

Read the source and its conditions. Expand a returned reference when the excerpt is missing context:

```bash
mini-trellis mem read "<ref-from-recall>"
```

If nothing matches, inspect the current code and relevant documentation. [Search guidance](recall.md) explains source coverage and warnings.

## Make and verify the change

Implement the fix with your usual tools. Keep the test result and any new conclusion that a future change should use. For example: repeated callbacks return the first result, and a regression test now covers duplicate delivery.

## Save the conclusion

```text
Update the existing callback spec with the confirmed idempotency rule.
Add the rejected approach and its reason to the research note.
Use mini-trellis-remember to record the changed files, verification result,
and links to these topics.
```

Check the actual topic and journal. The topic holds the current explanation; the journal records this session's changes and verification. New installations leave Git commits to you.

## Keep the project description current

Update the relevant section of the existing README, docs page, or spec. Check implemented behavior against current code or tests. Put agreed future work in a clearly identified section. Keep the file's original language, and update paths or symbol names affected by a rename.

A formatting change or rename can be handled as a normal documentation edit. Use a journal entry when the work adds knowledge worth finding later. See [writing and updating knowledge](writing-notes.md).

## Reuse it in the next session

```text
Use the project's recorded callback rule to add a retry-limit test.
Find the current note with mini-trellis mem recall, read its conditions,
and use that source in the implementation.
```

When the rule changes, update the topic before recording the new decision. A new session should retrieve the revised text and its source.

## More guides

<a id="opencode-v1-and-v2"></a>
[OpenCode V1 and V2 setup](agents.md#opencode)

<a id="codebuddy-cli-and-ide"></a>
[CodeBuddy CLI and IDE setup](agents.md#codebuddy)

<a id="pi-and-omp"></a>
[Pi / OMP setup](agents.md#pi-and-omp)

<a id="kiro"></a>
[Kiro setup](agents.md#kiro)

<a id="upgrade-and-refresh"></a>
[Upgrade and refresh](upgrade.md)

<a id="zcode-zai"></a>
[ZCode setup](agents.md#zcode)

<a id="cursor"></a>
[Cursor setup](agents.md#cursor)

<a id="organize-selected-history-into-project-knowledge"></a>
<a id="turn-selected-chats-into-project-knowledge"></a>
[Organize selected history](history.md)

<a id="after-compact"></a>
[After compact](recall.md#compact)

<a id="when-something-looks-wrong"></a>
[Troubleshooting](troubleshooting.md)
