# `mini-trellis mem` CLI Reference

Authoritative flags. `mini-trellis mem help` should match this file.

## Subcommands

| Command | Purpose |
| ------ | ------ |
| `list` | List sessions. Default when none is given. |
| `search <keyword>` | Find sessions whose contents match a keyword. |
| `context <session-id>` | Top-N hit turns plus surrounding context. Pair with `--grep`. |
| `extract <session-id>` | Dump cleaned dialogue. Combine with `--grep`. |
| `projects` | List active project `cwd` values with session counts. |

## Flags

| Flag | Subcommands | Meaning |
| ---- | ----------- | ------- |
| `--platform claude\|codex\|opencode\|pi\|all` | all | Default `all`. |
| `--since YYYY-MM-DD` | list / search | Inclusive lower date bound. |
| `--until YYYY-MM-DD` | list / search | Inclusive upper date bound. |
| `--global` | list / search | Include every project on this machine. |
| `--cwd <path>` | list / search | Force a project cwd. |
| `--limit N` | list / search | Cap rows. Default `50`. |
| `--grep KW` | extract / context | Filter turns by keyword. |
| `--turns N` | context | Hit turns to return. Default `3`. |
| `--around N` | context | Surrounding turns per hit. Default `1`. |
| `--max-chars N` | context | Character budget. Default `6000`. |
| `--include-children` | search / context | Merge OpenCode sub-agent sessions into parent. |
| `--json` | all | Machine-readable JSON. |

```bash
mini-trellis mem search "deadlock" --global --limit 20
mini-trellis mem context <session-id> --grep "lock" --turns 5 --around 2
mini-trellis mem extract <session-id> --grep memory
```
