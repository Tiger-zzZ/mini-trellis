# Agent setup

All listed integrations can use project Markdown. Startup delivery, raw conversation reading, and compact recovery depend on the platform. This page covers v0.3.8.

## Capabilities

| Agent | Init flag | Knowledge entry | Local history | Compact handoff |
| --- | --- | --- | --- | --- |
| Claude Code | `--claude` | SessionStart | Yes | Current session / boundary |
| Codex | `--codex` | Project hook, after trust | Yes | Current session / boundary |
| Cursor | `--cursor` | Local sessionStart and skills | — | Saved project documents |
| OpenCode V1 | `--opencode --opencode-version 1` | Plugin | Yes | Select session manually |
| OpenCode V2 | `--opencode` | Each outgoing request | — | Saved project documents |
| Pi | `--pi` | Extension and command | Yes | Select session manually |
| Oh My Pi (OMP) | `--omp` | Native extension and command | — | Saved project documents |
| Kiro CLI V3 / IDE 1.x | `--kiro` | SessionStart and skills | — | Saved project documents |
| DeepSeek Harness | `--dsh` | Instructions and skills | — | Saved project documents |
| CodeBuddy CLI / IDE | `--codebuddy` | SessionStart and skills | — | Saved project documents |
| ZCode | `--zcode` | SessionStart, after trust | — | Saved project documents |

A dash means native transcripts are not parsed. You can supply Markdown/text exports to [session-insight](history.md). Combine init flags to use more than one agent in a repository.

<a id="claude"></a>
## Claude Code

```bash
mini-trellis init -u your-name --claude
```

Review the project and hook prompts in Claude Code, then open a new session. Record with `/mini-trellis:remember`. Local history is read from Claude's project store, and `mem context --platform claude` can use the compact handoff's full session ID.

## Codex

```bash
mini-trellis init -u your-name --codex
```

1. Start Codex in the project and accept the project trust prompt.
2. Review and approve the project hook in `/hooks`.
3. If your Codex version requires it, enable `hooks = true` under `[features]` in user configuration.
4. Run `mini-trellis doctor` and start a new session.

Use `$mini-trellis-remember`. Project trust and hook trust are checked separately. For history lookup, use `--platform codex` and the full session ID from JSON or the compact hint.


## Cursor

```bash
mini-trellis init -u your-name --cursor -y
```

Init writes the managed block in `AGENTS.md`, three skills under `.cursor/skills/`, and a `.cursor/hooks.json` that registers only `sessionStart`. Record with the `mini-trellis-remember` skill. Recall with `mini-trellis mem recall`, then `mem read` when the excerpt is missing a condition.

The generated local `sessionStart` entry is verified on Cursor 3.27.22. To check the full setup, start a new chat and ask the agent to recall a saved rule. `AGENTS.md` plus `mem recall` also works when the short entry is unavailable. Cursor-managed cloud agents do not run `sessionStart`; self-hosted machines remain unverified. Cursor conversation history is not parsed.

First loop:

1. Run the init command above from the project root.
2. Open a new local agent chat. `mini-trellis doctor` should show `cursor` and `cursor-trigger` as ok. `cursor-runtime` stays unknown until a hook run is on disk.
3. Confirm one rule. Ask the agent to update the existing topic, or create a short spec if none exists, then use `mini-trellis-remember`. Check the topic text, the journal link, and the index.
4. Open another chat and run `mem recall` for that rule. The excerpt should keep the condition and the source.

`init` and `refresh` keep unrelated hooks in `.cursor/hooks.json`. A user `version` value is left as-is. If that file is not valid JSON or has an invalid hooks structure, init prints `Skipped .cursor/hooks.json` and leaves it, and refresh stops with a conflict. `doctor` reports `cursor-config` for those errors and for a missing mini-trellis `sessionStart` registration.

| What you see | What to do |
| --- | --- |
| Hooks log never says a project `sessionStart` hook loaded | Open the project root that contains `.cursor/hooks.json`. |
| `cursor-runtime` is unknown | No successful hook record yet. Start one local agent chat, then read `.trellis/.runtime/hooks/cursor.json`. |
| The hook succeeded and the model still has no recall instruction | Follow the project entry in `AGENTS.md` and ask for `mini-trellis mem recall` in a new chat. |
| `cursor-config` warns | Follow the detail: fix invalid JSON or hooks structure first, or run `init --cursor` to restore a missing registration. User hooks are kept. |
| Cursor-managed cloud agent | `sessionStart` does not run. Notes in the repo are still there; call `mem recall`. |

<a id="opencode"></a>
## OpenCode V1 and V2

Starting in 0.3.5, new projects default to OpenCode V2, the primary development target. Existing projects keep their installed protocol. No local binary or protocol prompt is required for a fresh install:

```bash
mini-trellis init -u your-name --opencode -y
```

For a V1 host, explicitly pass `--opencode-version 1`; V1 remains a legacy compatibility option. V1 uses `.opencode/plugins/session-start.js`; V2 uses `.opencode/plugins/mini-trellis/index.js`. The short memory entry and knowledge-writing rules are shared. V2 adds the entry to each outgoing model request; it does not persist the entry as a user message or preload all notes.

| Mechanism | V1 | V2 |
| --- | --- | --- |
| Plugin registration | Factory function returning hooks | `id` / `setup(ctx)` registering hooks |
| Short entry injection | `experimental.chat.messages.transform` edits message copies | `ctx.session.hook("context")` edits the request system context |
| Project location | Plugin instance `directory` | Actual session directory resolved from its ID |

Both adapters share entry generation and knowledge skills, and neither writes the entry into stored chat history. One protocol is active per project; teams using both V1 and V2 must explicitly select and switch, rather than activate both entries. See the [official migration guide](https://opencode.ai/v2/docs/build/plugins/migrate-v1/) for protocol differences.

Ordinary `refresh` follows the installed protocol, even after the local binary changes. To switch, review the exact file changes first:

```bash
mini-trellis refresh --opencode --opencode-version 2 --dry-run
mini-trellis refresh --opencode --opencode-version 2
```

Use `1` to switch back. Only an unchanged, manifest-owned old entry is removed. Modified or unowned plugin assets stop the switch before writes; unrelated plugins stay. The project package.json is merged, preserving the host SDK pin and user dependencies. Invalid package structure or an incompatible CommonJS type stops the update. Two active entries are a conflict. `doctor` reports a local binary/protocol mismatch and the last observed hook outcome; check a new conversation to verify that the entry is available to the agent.

Uninstall preserves the shared `.opencode/package.json`, including SDK dependencies used by the host or other plugins.

V1 1.18.29 and V2 2.2.0 are the protocol targets. The V1 SQLite reader does not parse V2's `session_v2`/`session_message` history. `opencode-v2-history-unsupported` means those conversations were skipped, even when there are no hits. Project Markdown and V1 history remain available. Do not treat this warning as evidence that the project has no memory.

<a id="codebuddy"></a>
## CodeBuddy CLI and IDE

Requires 0.3.5:

```bash
mini-trellis init -u your-name --codebuddy -y
```

Both interfaces use the same `.codebuddy/settings.json` and `.codebuddy/skills/`. The shared `mini-trellis-remember` skill is the common recording entry. CLI also loads `.codebuddy/commands/mini-trellis/remember.md` as `/mini-trellis:remember`, generated from the same instructions. There is one installation and one set of writing rules. In CodeBuddy, log in if requested and review any project/hook trust prompt. Mini-trellis does not change your API, model or global trust. Restart the chat after changing hook settings.

Record a confirmed decision with the `mini-trellis-remember` skill (or `/mini-trellis:remember` in CLI); update an existing topic before creating another. `mem recall`/`mem read` search saved project knowledge. CodeBuddy transcripts are not parsed.

Repeated init and refresh preserve user hooks, environment and permissions. Invalid JSON, settings arrays/null, malformed hook groups or matchers stop the host update without replacing files. `doctor` reports missing registration and observed runtime errors; no runtime record stays unknown.

<a id="zcode"></a>
## ZCode (Z.ai)

Install the three project skills under `.agents/skills/`, shared with Codex, and a SessionStart hook in `.zcode/config.json`:

```bash
mini-trellis init -u your-name --zcode -y
```

In ZCode Desktop, open **Settings → Hooks**, select this project, review `.zcode/hooks/session-start.py`, and choose **Trust**. Start a new session to load the project knowledge entry.

For a separately installed ZCode CLI, use the workspace path shown by the host:

```bash
zcode skills list --cwd . --json
zcode hooks trust review --workspace . --json
```

Review the command and script, then grant the returned `hookDeclarationDigest` and check the result:

```bash
zcode hooks trust grant --workspace . --hook-digest <reviewed-hookDeclarationDigest>
zcode hooks trust status --workspace . --json
mini-trellis doctor
```

Use `$mini-trellis-remember` or the named skill to record confirmed decisions. Existing topics keep their language, and journal entries link to the updated files. Use `mini-trellis-session-insight` to find project knowledge with `mem recall`/`mem read`, or organize supplied Markdown/text into project documents.

After compact, `AGENTS.md` guides the agent to the same saved knowledge and skills. ZCode Desktop 3.17.2 / core 0.17.1 invokes the entry at session startup; compact continues with the project guidance already provided by the host.

Init and refresh preserve your configuration, hooks and other skills. Review changed hook declarations in ZCode after refreshing. If a same-name skill already exists under `.zcode/skills/`, move or rename it before installing the shared skill. `doctor` shows project registration and the latest observed execution; use ZCode's hook panel or `trust status` to check trust.

<a id="pi"></a>
<a id="pi-and-omp"></a>
## Pi / Oh My Pi (OMP)

Use mini-trellis 0.3.8 or later. Choose the host you run:

```bash
# Pi
mini-trellis init -u your-name --pi -y
pi

# Oh My Pi (OMP)
mini-trellis init -u your-name --omp -y
omp
```

Run these commands from the project root. Pi uses `.pi/extensions/` and `.pi/prompts/`, with shared skills under `.agents/skills/`. OMP uses its native `.omp/extensions/`, `.omp/prompts/` and `.omp/skills/`. Both load the same short memory entry through `before_agent_start`; OMP discovers the installed assets automatically. To use both in one project, initialize with `--pi --omp`.

For an existing mini-trellis project, update its host assets with the new CLI:

```bash
mini-trellis refresh --pi
# Add or update OMP in the same project:
mini-trellis refresh --omp
```

Review Pi's project trust prompt, then start a new host session after installing or refreshing. Keep your model configured in Pi or OMP as usual. In the chat, either record the discussion with `/mini-trellis-remember` or supply the confirmed conclusion directly:

```text
/mini-trellis-remember Only idempotent callbacks auto-retry, at most 3 times; the first delay is 427 ms. Non-idempotent callbacks require manual handling.
```

The agent updates the existing topic, reads it back, then writes a journal entry linking to it. In a later session, ask the agent for the callback retry rule, or run `mini-trellis mem recall "callback retry"` in a terminal. `mini-trellis-session-insight` can organize a supplied Markdown/text export into the existing project documents; `mini-trellis-update-spec` maintains lasting contracts. Ask for either skill by name in the chat.

Pi local conversation history is searchable. OMP recall uses saved project Markdown; to organize an OMP conversation, supply a Markdown/text export. See the official [Pi prompt template](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/prompt-templates.md) and [OMP discovery](https://github.com/can1357/oh-my-pi/blob/v18.18.3/docs/extension-loading.md) documentation.

<a id="kiro"></a>
## Kiro CLI and IDE

Use Kiro CLI V3 or IDE 1.x with standalone project hooks:

```bash
mini-trellis init -u your-name --kiro -y
kiro-cli chat --v3
```

Open the project and accept Kiro's workspace trust prompt. `.kiro/hooks/mini-trellis.json` registers SessionStart, and `.kiro/skills/` contains remember, session-insight and update-spec. Start a new session to load the short project entry; use `/mini-trellis-remember` to save a confirmed decision and `mini-trellis mem recall <query>` to retrieve it later. After compact, use the saved project notes through `AGENTS.md` and recall.

`refresh --kiro` updates installed assets, and `doctor` checks registration and the latest execution. Existing Trellis projects use `mini-trellis migrate` to replace their Trellis skills, agents and workflow hook with this project entry. Kiro uses the [current standalone hook format](https://kiro.dev/docs/hooks/) and [Agent Skills](https://kiro.dev/docs/skills/).

<a id="dsh"></a>
## DeepSeek Harness

```bash
mini-trellis init -u your-name --dsh
```

The integration installs `.dsh/skills/` and project instructions. Use the `mini-trellis-remember` skill, and call `mem recall` when project knowledge is relevant. There is no project-level SessionStart integration, and the compressed DSH transcript format is not parsed.
