# Contributing to mini-trellis

This is a public AGPL-3.0 fork of Trellis 0.6.17. Keep the Mindfold copyright
and this modification notice.

## Scope

mini-trellis is a lightweight project memory layer: spec, research, journal,
and cross-session recall. Contributions should help agents save and find
reusable knowledge while keeping setup and daily use simple.

See [Agent setup](docs/agents.md) for supported integrations and their capabilities.

## How to work

```bash
pnpm install
pnpm --filter mini-trellis-core build
pnpm --filter mini-trellis typecheck
pnpm --filter mini-trellis test
```

`.trellis/` is not tracked here: it is each contributor's own memory layer.
After `pnpm build`, run `node packages/cli/bin/mini-trellis.js init -u <you> --claude`
once so the SessionStart hook in `.claude/` has something to read.

Create a feature branch from the current development branch, make your changes,
and submit a pull request.

## Release checks

Follow the [maintenance and release workflow](docs/maintenance-workflow.md) for acceptance, PR merges, tags and website updates. CLI and core share the same version. Tag the merged, verified main commit as `vX.Y.Z` (for example, `v0.3.7`). The maintainer publishes npm manually, core first and CLI second.

## Documentation changes

The bilingual guides in `docs/` are the canonical source for the website. Update the English and Chinese files together, then generate the site pages with `scripts/sync-docs-site.py`. Homepage/layout changes belong to the website repository; release records retain the version they describe.

See [documentation maintenance](docs/maintenance-workflow.md#documentation-source) for local synchronization and validation. Documentation-only changes require link, source-sync, and site-build checks rather than the product test suite.
