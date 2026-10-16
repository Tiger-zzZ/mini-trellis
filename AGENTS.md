<!-- TRELLIS:START -->
# mini-trellis

This project uses mini-trellis as a memory layer. Working knowledge lives under `.trellis/`:

- `.trellis/spec/` — durable contracts (short markdown; read `index.md` first)
- `.trellis/research/` — topic inbox (`<topic>.md`; `README.md` is not a topic)
- `.trellis/workspace/` — per-developer journals

Record a session with `/mini-trellis:remember` (Claude/OpenCode), `/mini-trellis-remember` (Pi), or `$mini-trellis-remember` (Codex). Search past dialogue with `mini-trellis mem`. Promote lasting boundaries into spec with `mini-trellis-update-spec`.

mini-trellis does not create or drive tasks.

Managed by mini-trellis. Edits outside this block are preserved.
<!-- TRELLIS:END -->

## Cursor Cloud specific instructions

- Install and build with the root scripts in `package.json` and `CONTRIBUTING.md`: `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test`. `packages/cli/bin/mini-trellis.js` imports `dist/`, so build before running the CLI.
- `pnpm lint:py` reads `.trellis/scripts` (gitignored). Create it with `node packages/cli/bin/mini-trellis.js init -u <name> --claude -y` before that check. Init rewrites the managed block above; leave edits outside the block alone.
- This VM sets `commit.gpgsign=true` globally. Parallel git commits inside the integration tests then stall past Vitest's 10 second timeout. Run the suite as `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false pnpm test`. Leave the global signing setting in place so agent commits stay signed.
