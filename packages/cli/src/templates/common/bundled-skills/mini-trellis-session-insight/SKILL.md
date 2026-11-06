---
name: mini-trellis-session-insight
description: "Find project knowledge and past AI conversation history through the `mini-trellis mem` CLI. Use for earlier decisions, cross-session continuation, or an explicit request to organize selected past sessions or supplied Markdown/text exports into reusable project knowledge (整理历史会话、从聊天整理项目文档). Returns source-linked evidence; on request, updates existing documents through update-spec and remember."
---

# Session Insight

How to call `mini-trellis mem` and when that is the right move. Capability, not a workflow. No required write-back.

## What it is

A local CLI that searches project Markdown and Claude Code, Codex, OpenCode V1, and Pi conversation logs. OpenCode V2, CodeBuddy, Cursor, DeepSeek Harness and ZCode transcripts are not parsed; their saved project Markdown is still searchable. Documents are discovered automatically; no index service or configuration is needed. Nothing is uploaded.

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

Start with `recall` when earlier decisions or relevant project rules are needed; do not search on every turn. If an excerpt already answers the question with its source and necessary conditions/negations, cite it and stop. `read` is not a mandatory verification step. Use it for missing context, especially a proposal, rejection or condition in neighboring turns. Preserve speakers and chronological order. Reuse refs exactly; they include a source fingerprint. If a source changed or moved, recall again rather than trusting old text. Do not repeat the same lookup or run the legacy dialogue-only `search/context` after sufficient evidence merely to confirm it again; those commands remain available for explicit dialogue-only work.

`weak` is lexical overlap, not a confirmed answer. `incomplete` means some sources were not searched; `truncated` means the output budget or result limit was reached. Check warnings before claiming no memory exists. One keyword rewrite can help; do not loop indefinitely or infer semantic search.

Write new notes in the user's requested language, otherwise the discussion language. Preserve an existing document's language and original identifiers. Update the existing topic before creating another; journal entries should link to the topic rather than duplicate it.
