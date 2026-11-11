# Install and get started

Start in the root of your Git repository. An existing Trellis installation should follow [the migration guide](migration.md).

## Requirements

- Node.js 18.17 or later
- Python 3.9 or later (`python3` on macOS/Linux, `python` on Windows)
- Git and a supported coding agent

## Install the CLI

```bash
npm install -g mini-trellis
mini-trellis --version
```

## Set up the project

Choose the agent you use, and replace `your-name` with your developer name:

```bash
mini-trellis init -u your-name --claude
mini-trellis doctor
```

You can combine flags:

```bash
mini-trellis init -u your-name --claude --codex
```

v0.3.8 supports `--claude`, `--codex`, `--cursor`, `--opencode`, `--pi`, `--omp`, `--kiro`, `--dsh`, `--codebuddy`, and `--zcode`. See [Agent setup](agents.md) for trust prompts and platform differences.

Initialization creates `.trellis/`, the managed instruction block, and the selected agent's integration files. Existing project knowledge is retained. A developer journal lives under `.trellis/workspace/<name>/`. Initialization writes files; review and commit the changes with your usual Git workflow.

## Save one useful decision

Open a new agent session. For this example, assume your team has agreed on the following callback behavior:

```text
Record this project rule: every callback carries an idempotency key;
repeated callbacks return the first result. Update the existing spec for
callbacks, or create a short spec if none exists. Then use
mini-trellis-remember to link this decision from the session journal.
```

In Claude Code, the recording command is `/mini-trellis:remember`. The [command reference](commands.md#skills) lists each agent's entry point.

Check that the topic contains the rule and that the journal links to it. Example projects can use `.trellis/spec/backend/callbacks.md`; an existing README or docs page is also a valid home.

## Find it in a new session

```bash
mini-trellis mem recall "callback idempotency"
```

The result contains a source, a short excerpt, and a `ref`. Expand the returned reference when you need more detail:

```bash
mini-trellis mem read "<ref-from-recall>"
```

You now have a complete first use: record a decision, start another session, and retrieve the source. Continue with [day-to-day use](using.md), or use [troubleshooting](troubleshooting.md) if the expected result is missing.
