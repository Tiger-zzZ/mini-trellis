# Writing and updating knowledge

Start with the document that already explains the topic. Write the decision, its conditions, and the evidence a future reader needs.

## Choose a location

| Material | Recommended home |
| --- | --- |
| Project purpose, modules, implemented behavior | Existing README or architecture guide |
| A rule future changes should follow | `.trellis/spec/` |
| An investigation, alternatives, or rejected approach | `.trellis/research/` |
| A session summary with links and verification | `.trellis/workspace/<name>/journal-*.md` |

Project documents under README, `docs/`, and `doc/` participate in recall. The [source reference](recall.md#sources) describes discovery in detail.

## A short spec

```markdown
# Callback idempotency

Every callback carries an idempotency key. Repeated delivery returns the
first result. The uniqueness check happens within the ledger transaction.

Verification: the duplicate-delivery test covers retries of the same key.
```

Link a new spec from the relevant directory's `index.md`. Keep each rule scoped to the module it affects. Ask the agent to use `mini-trellis-update-spec` when maintaining a durable convention.

## A research note

```markdown
# Callback retries

Decision: retry transient failures up to four total attempts, including
the first. Permanent failures receive one attempt.

Reason: the upstream service has confirmed idempotent handling.
Rejected: deduplication before the ledger transaction broke reconciliation.
Sources: link the provider documentation and the relevant code or test.
```

This is an illustrative note; replace the policy and sources with those confirmed for your project. Retain the conditions, rejected alternatives, and corrections that explain the decision.

## A journal entry

Use `mini-trellis-remember` after updating the topic. A useful journal names the changed files, the verification performed and its result, and links to the spec or research note. Routine formatting edits need no knowledge entry.

<a id="changed-decisions"></a>
## When a decision changes

Edit the affected section in place. If an entire note is replaced, retain the old note with top-level metadata:

```markdown
---
status: superseded
superseded_by: .trellis/research/current-retries.md
---
```

The target is a path relative to the repository root. Recall follows a bounded replacement chain and can show an excerpt from the current note. `mem read` reports the successor path; retrieve that source when you need its body.

Missing targets, paths outside document sources, cycles, and overly long chains are reported as lineage faults. A changed modification time alone does not establish a replacement relationship.

## Review before sharing

Check the current code or tests for claims about implemented behavior. Preserve the document's language and useful source links. Review the diff for credentials, private conversations, and project-specific information before adding it to a shared repository.
