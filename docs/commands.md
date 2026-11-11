# Commands and skills

Run project commands from the repository root. `mini-trellis --help`, `<command> --help`, and `mini-trellis mem help` show the installed CLI's reference.

## Project commands

| Command | Purpose | Options |
| --- | --- | --- |
| `init` | Create project knowledge directories and agent integration files | `-u, --user <name>`, agent flags, `-y`, `-f`, `-s` |
| `migrate` | Convert a Trellis installation | `--dry-run`, `-y`, `--opencode-version <version>` |
| `upgrade` | Update the global CLI and refresh the current initialized project | `--dry-run`, `--tag <tag-or-version>` |
| `refresh` | Update managed project files | `--dry-run`, `--json`, agent flags, `--opencode-version <version>` |
| `doctor` | Inspect configuration, files, and the last observed hook result | `--json` |
| `platforms` | List configured agents | `--json` |
| `uninstall` | Remove the project's integration and all of `.trellis/` | `--dry-run`, `-y` |

Agent flags in v0.3.8: `--claude`, `--codex`, `--cursor`, `--opencode`, `--pi`, `--omp`, `--kiro`, `--dsh`, `--codebuddy`, `--zcode`. Init and refresh accept these flags. `--opencode-version` is also available on init; its value is `1` or `2`.

For init, `-y` accepts defaults, `-s` skips existing files, and `-f` overwrites existing files. Prefer ordinary init and review its prompts when adding an integration. Refresh applies normal managed updates directly; replacements requiring confirmation are listed in one `[y/N]` prompt. See [upgrade and refresh](upgrade.md).

**Uninstall deletes knowledge under `.trellis/`, including spec, research, and journals.** Back up the content first and inspect `uninstall --dry-run`. See [upgrade and removal](upgrade.md).

## Memory commands

| Command | Reads | Typical use |
| --- | --- | --- |
| `mem recall "query"` | Project documents and local conversations | Find a decision or rule |
| `mem read "ref" ["ref" ...]` | Sources referenced by recall | Expand one or more excerpts |
| `mem list` | Local session metadata | Select a session |
| `mem search "keyword"` | Local conversation text | Find the discussion |
| `mem context <session-id>` | Selected conversation turns | Read a bounded excerpt |
| `mem extract <session-id>` | Cleaned conversation | Review or export a session |
| `mem projects` | Known local projects | Find the project path |

<a id="mem-options"></a>
## Memory options

| Option | Applies to | Meaning / default |
| --- | --- | --- |
| `--cwd <path>` | recall, read, list, search, context, extract | Choose the project; defaults to the working directory |
| `--platform <name>` | recall and session commands | `claude`, `codex`, `opencode`, `pi`, or `all`; defaults to all |
| `--global` | list, search, context, extract | Include all projects; recall rejects this option |
| `--since`, `--until` | Session selection | Inclusive date bounds (`YYYY-MM-DD`) |
| `--limit N` | recall, list, search, projects | Defaults: recall 3, list/search 50, projects 30 |
| `--grep "words"` | context, extract | Match turns; multiple words use AND |
| `--turns N` | context | Matching turns to return; default 3 |
| `--around N` | context | Neighboring turns per match; default 1 |
| `--max-chars N` | recall, read, context | Output budget; defaults 3000 / 4000 / 6000 |
| `--include-children` | search, context | Merge OpenCode V1 child sessions into parents |
| `--phase <name>` | extract | `brainstorm`, `implement`, or `all`; defaults to all |
| `--json` | All memory commands except help | Machine-readable output |

Recall's platform filter affects transcript sources; documents still participate. Dates filter session commands, not the unified recall results. Read accepts refs from the selected project. Extract is unbounded and does not use `--max-chars`.

```bash
mini-trellis mem recall "callback retries" --limit 5 --max-chars 5000
mini-trellis mem list --platform codex --json --limit 10
mini-trellis mem context <full-session-id> --platform codex --grep "retry" --turns 3
mini-trellis mem search "callback" --cwd /path/to/project
```

<a id="skills"></a>
## Agent skills

These are instructions used inside the coding agent, rather than additional `mini-trellis` CLI subcommands.

| Skill | Use it for |
| --- | --- |
| `mini-trellis-remember` | Update the topic and record the session with links and verification |
| `mini-trellis-update-spec` | Maintain a durable project convention |
| `mini-trellis-session-insight` | Organize selected conversations or text exports into project documents |

| Agent | Recording entry |
| --- | --- |
| Claude Code / OpenCode | `/mini-trellis:remember` |
| Codex / ZCode | `$mini-trellis-remember` or the named skill |
| Pi / OMP / Kiro | `/mini-trellis-remember` |
| Cursor / DeepSeek Harness | `mini-trellis-remember` skill |
| CodeBuddy | Named skill; CLI also supports `/mini-trellis:remember` |

Use the other skills by name in your request. See [Agent setup](agents.md) for integration-specific configuration.
