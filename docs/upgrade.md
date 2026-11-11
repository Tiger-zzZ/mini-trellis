# Upgrade, refresh, and uninstall

Update the CLI and project integration from the project root. Before changing managed files, back up custom configuration and knowledge, including Git-ignored files.

## Upgrade the CLI and refresh a project

```bash
mini-trellis upgrade --dry-run
mini-trellis upgrade
mini-trellis doctor
```

From 0.3.8 onward, after npm succeeds, `upgrade` calls the new CLI to refresh the current initialized project. Outside an initialized project it updates only the CLI; run `mini-trellis refresh` separately in other projects. Open a new agent session afterward.

The default tag follows the installed release channel (`latest`, `beta`, or `rc`); `--tag 0.3.8` selects a version explicitly. `--dry-run` previews the steps.

After `npm install -g mini-trellis@latest`, or an `upgrade` started by 0.3.7 or earlier, refresh the project once:

```bash
mini-trellis refresh --dry-run
mini-trellis refresh
mini-trellis doctor
```

Normal updates to recorded templates run directly. When local edits or missing previous-version records cause a content conflict, refresh lists the files and asks once `[y/N]`. Enter `Y` to replace the listed files and complete the update. `N`, Enter or EOF leaves the project unchanged. Shared JSON settings are merged, `AGENTS.md` keeps instructions outside the managed block, and project knowledge stays in place. A missing or damaged manifest can be rebuilt through the same confirmation.

`refresh --dry-run` previews the changes. For replacements requiring confirmation, `--json` and non-interactive runs report the affected files and return exit code 1; run `mini-trellis refresh` in a terminal to confirm and complete those replacements. Updates without content conflicts complete directly.

## Add an agent

```bash
mini-trellis init --zcode -y
mini-trellis doctor
```

Review the new integration's project/hook trust prompts. To refresh only one integration, use its flag, such as `mini-trellis refresh --codex --dry-run`.

## Switch the OpenCode protocol

Ordinary refresh preserves the installed protocol. Preview an explicit switch:

```bash
mini-trellis refresh --opencode --opencode-version 2 --dry-run
mini-trellis refresh --opencode --opencode-version 2
```

Use `1` to return to V1. A switch requires the replaced plugin assets to be unchanged and manifest-owned; custom or unowned entries are reported for review. See [OpenCode setup](agents.md#opencode).

## Uninstall from a project

**Uninstall deletes all of `.trellis/`, including spec, research, and journals, along with managed integration files.** Save the knowledge and custom configuration you want to keep before continuing.

```bash
mini-trellis uninstall --dry-run
mini-trellis uninstall
```

The interactive command asks for confirmation; `-y` skips that prompt. Removing the global npm package alone does not remove project files:

```bash
npm uninstall -g mini-trellis
```

Existing Trellis projects should use [migration](migration.md) before using the mini-trellis project maintenance commands.
