# Examples

These examples show what to save, how to find it later, and what to verify. Replace the illustrative rules with decisions confirmed for your project.

## Start with an empty repository

Follow [installation](install.md), then save one convention rather than drafting a large manual. For example, agree that CLI errors go to stderr while JSON results go to stdout. Ask `mini-trellis-update-spec` to write the rule and add an index link. In a new session, recall `CLI stdout stderr` and use it while implementing a command.

**Check:** the source states the rule and the new command follows it.

## Document an existing codebase

Ask the agent to inspect the current README, architecture guide, and relevant code. Update the existing document's purpose, implemented capabilities, modules, and constraints. Use [session-insight](history.md) for selected earlier discussions that explain a design choice.

**Check:** the documentation agrees with the code, and proposed work is clearly identified.

## Preserve a bug fix

After fixing duplicate callback handling, save the idempotency rule in the callback spec. Keep the failed alternative and its reason in research, and record the regression test result in the journal. In a later session, recall `callback idempotency` before changing retries.

**Check:** the returned source preserves the condition that made the fix correct.

## Share a decision across agents and teammates

Install the agents your team uses. Commit the reviewed topic document according to your repository's sharing policy. A teammate using another agent can recall the same Markdown after updating their checkout; the original private chat stays on its creator's machine.

**Check:** both agents retrieve the same current rule and source path. See [configuration and sharing](configuration.md).

## Continue after compact

Use the current-session command supplied by the Claude Code or Codex compact handoff. Retrieve durable rules separately through `mem recall`. For another platform, select supported local history manually or use the saved topic documents.

**Check:** the source includes the relevant condition. If history is missing or incomplete, inspect the warning and available documents before proceeding. See [compact recovery](recall.md#compact).
