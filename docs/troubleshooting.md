# Troubleshooting

Start with the project directory and installed version, then check configuration and actual recall separately.

```bash
mini-trellis --version
mini-trellis doctor
mini-trellis platforms --json
```

## Installation and hooks

| Finding | Next step |
| --- | --- |
| `legacy-trellis` | Review `mini-trellis migrate --dry-run` and the [migration guide](migration.md). |
| `memory-layer` | Check `.trellis/` and its scripts; initialize the intended project. |
| `instructions` | Check the managed block in `AGENTS.md`; run init for the intended agent. |
| No configured platform | Run init with the agent flag you use. |
| `<host>-runtime: unknown` | Start a new agent session after reviewing required trust prompts. The status means no runtime result has been observed yet. |
| `<host>-runtime: warn` | Read the reported error and inspect the indicated script or configuration. |
| `cursor-config` | Correct invalid JSON/hook structure, or restore the missing sessionStart registration with init. |
| `kiro-config` | Check `.kiro/hooks/mini-trellis.json` and its SessionStart registration; preview updates with `mini-trellis refresh --kiro --dry-run`. |
| `zcode-config` / `zcode-trust` | Check project hook registration and review trust in ZCode's hook panel or CLI. |

`doctor --json` exposes the same checks for scripts. After setup passes, ask the agent to recall a distinctive saved rule in a new session. Configuration success and retrieving the expected note are separate checks.

## A saved note is missing from recall

1. Confirm the file is saved and contains the expected words.
2. Run recall from the correct repository, or pass `--cwd`.
3. Check [document discovery](recall.md#sources) and `.gitignore` for ordinary docs.
4. Read `incomplete` warnings; increase `--max-chars` when results are truncated.
5. Try a specific identifier, path, or phrase from the source.

A platform filter selects transcript sources and still includes project documents. For unsupported native history, provide a text export to [session-insight](history.md).

## A session cannot be read

Use `mem list --platform <name> --json` in the intended project and copy the full ID. Add the same platform to `mem context`. If the session belongs to another project, select that project with `--cwd`.

`session-history-missing` can mean history has not reached disk. `session-history-unreadable` identifies a read failure. `opencode-v2-history-unsupported` identifies a skipped V2 source. Check the specific warning before changing the query.

## Refresh or migration reports a conflict

Back up customizations and inspect the exact paths in the report. Refresh lists content replacements and asks once `[y/N]`; `N`, Enter, or EOF leaves project files unchanged. Run refresh in a terminal to confirm replacements reported by `--json` or a non-interactive run. See [upgrade and refresh](upgrade.md). Migration stops on destination collisions or invalid supported host configuration; move or rename a conflicting topic only after reviewing its contents. Re-run `--dry-run` before applying the change.

## Report an issue

Include the mini-trellis version, agent and version, OS, command, expected result, actual output, and relevant `doctor` diagnostics. Remove credentials and private transcript text. A minimal source excerpt or reproducible example is more useful than a full conversation dump.

[Open an issue](https://github.com/Tiger-zzZ/mini-trellis/issues).
