---
name: mini-trellis-session-insight
description: "Find project knowledge and past AI conversation history through the `mini-trellis mem` CLI. Use for earlier decisions, cross-session continuation, or an explicit request to organize selected past sessions or supplied Markdown/text exports into reusable project knowledge (整理历史会话、从聊天整理项目文档). Returns source-linked evidence; on request, updates existing documents through update-spec and remember."
---

# Session Insight

How to call `mini-trellis mem` and when that is the right move. Capability, not a workflow. No required write-back.

## What it is

Open the relevant entry in `.trellis/index.md` when the current context needs project knowledge. By default `mem recall` searches project Markdown locally. Use `--source history` for original wording, rejected alternatives or an undocumented discussion, and `--source all` when both documents and dialogue matter. It reads native conversation logs from Claude Code, Codex, OpenCode V1, Pi, and Factory Droid. For Antigravity, OpenCode V2, CodeBuddy, Cursor, DeepSeek Harness, ZCode, Kiro, and OMP, use `mini-trellis mem recall` to find saved project knowledge. To review a specific conversation from one of these hosts, read a Markdown or plain-text export supplied by the user.

```bash
mini-trellis mem recall "<topic or path>"
# Only when the excerpts leave a question unresolved:
mini-trellis mem read "<ref from recall>" "<another ref>"
```

Full flags: `mini-trellis mem help`.

## When

- The user asks whether a decision was already made
- A bug or topic feels familiar from an earlier session
- The user resumes after a gap ("where were we")
- The user explicitly asks to organize selected history or supplied text into project documents

## When not

- The answer is already in the current turn, spec, git log, or open files
- The user asked not to dig through history

## After a hit

Treat output as raw material. Quote it, promote a durable boundary with `mini-trellis-update-spec`, or just use it. Do not invent a task directory.

## Organize selected history (only on request)

Read [Organize selected history](references/organize-history.md) for this request. Use the selected sessions or supplied Markdown/text, preserve sources and corrections, and update the existing README/docs/spec/research through `mini-trellis-update-spec` and the host's remember guidance. This request authorizes saving clearly confirmed, applicable knowledge; ask together about material conflicts or missing decisions. No new knowledge means no note or journal entry. Ordinary lookup still requires no write-back.

## Evidence and limits

If a relevant entry leaves a gap, start with a few space-separated topic words or exact identifiers. Two to five is a useful starting point. Use the language of the titles or passages you have seen. If an excerpt already answers the question with its source and necessary conditions/negations, cite it and stop. `read` is not a mandatory verification step. Use it for missing context, especially a proposal, rejection or condition in neighboring turns. Preserve speakers and chronological order. Reuse refs exactly; they include a source fingerprint. If a source changed or moved, recall again rather than trusting old text. Do not repeat the same lookup or run the legacy dialogue-only `search/context` after sufficient evidence merely to confirm it again; those commands remain available for explicit dialogue-only work.

`weak` describes lexical overlap. If hits are unrelated, missing a condition, contradictory, or absent, expand a relevant ref or try one rewrite for that gap using a term or language from the material. A sufficient excerpt ends that lookup.

`incomplete` means part of the requested source scope could not be scanned. A `history-gap` warning identifies missing content in a readable transcript, including pre-compact replies and encrypted messages. Check these warnings even when the scan finished. `truncated` concerns the returned hits or excerpts. Absence of a hit leaves the historical question open.

Write new notes in the user's requested language, otherwise the discussion language. Preserve an existing document's language and original identifiers. Update the existing topic before creating another; journal entries should link to the topic rather than duplicate it.
