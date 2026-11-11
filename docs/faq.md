# Frequently asked questions

## How does this work with AGENTS.md or CLAUDE.md?

Those files remain project entry points. mini-trellis adds a managed block, topic documents, recording skills, and retrieval across documents and supported local conversations. Keep useful instructions already in the project; put detailed knowledge in the document that owns the topic. See [how it works](how-it-works.md).

## What happens automatically, and what do I ask the agent to do?

After setup and any required trust approval, supported integrations provide a short knowledge entry. The agent can use its instructions and skills during development. Ask explicitly when a particular decision must be recorded or a source must be checked. [Quick start](install.md) shows a complete record-and-recall example.

## Do I need to record every session?

Record decisions, investigations, and fixes that will help a later change. A routine edit with no new reusable conclusion can use your normal workflow.

## Which skill should I use?

Use `remember` to update a topic and record the session, `update-spec` for durable project conventions, and `session-insight` to organize selected historical material. See [Commands and skills](commands.md#skills).

## Should I move existing documentation into .trellis?

Keep it where it is maintained. Root README files and Markdown/MDX in `docs/` and `doc/` are discovered alongside `.trellis` knowledge. Ordinary documents respect `.gitignore`; [.trellis knowledge has its own discovery rules](recall.md#sources).

## Can I use more than one coding agent?

Yes. Combine init flags or add another integration later. The agents share project Markdown. Raw transcript readers and startup mechanisms differ, as shown in the [platform matrix](agents.md#capabilities).

## Does support for an agent include reading its chat history?

Check the two capabilities separately. v0.3.8 reads native Claude Code, Codex, OpenCode V1, and Pi history. Other supported integrations use project knowledge, and can organize a supplied text export through [session-insight](history.md).

## Why does doctor pass but the agent miss a saved rule?

`doctor` checks configuration, files, and the last observed hook result. Next, open a new session and ask for `mem recall` using a distinctive phrase from the saved note. Verify the result and ask the agent to use it. This separates setup, search coverage, and use of the source. See [troubleshooting](troubleshooting.md).

## What if recall finds nothing?

Check the project path, query terms, source coverage, and warnings. A skipped or incomplete source is different from a complete search with no match. For native history, use `mem list --platform <name> --json` to check the session's project and full ID.

## How do I replace an old rule?

Edit the current topic in place. If a whole note is replaced, mark the old note `superseded` and link it with `superseded_by`. Keep historical reasoning in research or journals. See [changed decisions](writing-notes.md#changed-decisions).

## What can I recover after compact?

Saved Markdown is still available through recall. Claude Code and Codex also support a handoff to the current session's pre-compact history when the host supplies the ID. OpenCode V1 and Pi support manual session selection. See [compact recovery](recall.md#compact).

## Where does my data go?

The CLI reads local files. Markdown can be shared through your repository; raw transcripts stay in the agent's local storage. When the coding agent reads an excerpt, it can include it in requests to its model provider. See [data handling and sharing](configuration.md#sharing).

## Does recording create a Git commit?

New installations set `session_auto_commit: false`. Review this setting in older projects. The session-insight flow writes its journal with `--no-commit`. Details are in [configuration](configuration.md).

<a id="what-is-the-relationship-to-trellis"></a>
## Can I keep my knowledge when moving from Trellis?

Migration preserves project conventions, research, and development journals. The two integrations share `.trellis/`, so migration replaces the existing integration and archives old task material by default. Back up `.trellis/` and custom configuration, then preview the changes with `mini-trellis migrate --dry-run`. See the [migration guide](migration.md) for file handling.

## How should I interpret the benchmark numbers?

The published measurements compare specific versions, fixtures, and an agent/model configuration. Wall time, processed tokens, and injected characters are different measures. The [benchmark page](benchmarks.md) keeps their conditions and source records together.

## Will uninstall keep my notes?

**Project uninstall deletes `.trellis/`, including notes and journals.** Back up the content you need, then inspect `mini-trellis uninstall --dry-run`. See [removal instructions](upgrade.md).
