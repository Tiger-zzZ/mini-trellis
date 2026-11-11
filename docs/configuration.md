# Configuration and sharing

Project settings live in `.trellis/config.yaml`. Defaults work for a new installation; add overrides for the behavior you want to change.

## Settings

| Key | Default | Purpose |
| --- | --- | --- |
| `session_auto_commit` | `false` | Commit journal/index changes after `add_session.py` |
| `session_commit_message` | `[mini-trellis] journal` | Message used for that commit |
| `max_journal_lines` | `2000` | Rotate a journal after this line threshold |
| `packages` | Unset | Map package names to paths for startup spec-index filtering |
| `default_package` | Unset | Default package choice when applicable |

```yaml
session_auto_commit: false
session_commit_message: "[mini-trellis] journal"
max_journal_lines: 2000
```

`session_auto_commit: true` stages and commits the recording files. Review a migrated project's setting before recording. The history-organizing skill uses `--no-commit` even when automatic journal commits are enabled.

## Monorepos

```yaml
packages:
  api:
    path: packages/api
  web:
    path: packages/web
default_package: api
```

Package settings help the startup entry select spec indexes. Unified recall discovers documents across the repository; these settings do not create separate search indexes or project permissions.

<a id="sharing"></a>
## Share project knowledge

Review conventions and research through normal Git changes. Use a distinct developer name for each contributor's journal directory. Team members can initialize the integrations for the agents they use.

The generated `.trellis/.gitignore` excludes local identity and runtime state. Existing ignore rules are preserved. Choose which knowledge and journals to track according to the repository's sharing policy; ignored files that were already tracked remain tracked until you change that explicitly.

Local agent transcripts remain on the machine where the agent stores them. Sharing Markdown through Git does not share those raw conversations. To make a useful decision available to teammates, save it in an appropriate project document.

## Data handling

The memory CLI reads local files and has no upload service. The coding agent can include retrieved text in requests to its configured model provider. Review excerpts, exported conversations, and shared Git changes according to your project's data policy.

## Manage integration files

Initialization and refresh merge supported agent configuration and keep unrelated settings. The manifest tracks generated assets; refresh reports locally edited assets as conflicts. Back up customizations and review the reported paths before resolving a conflict. See [upgrade and refresh](upgrade.md).
