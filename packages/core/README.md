# mini-trellis-core

The `mem` primitives behind the [mini-trellis](https://github.com/Tiger-zzZ/mini-trellis) CLI: discover project Markdown, search documents by default, select `source: "history"` for local Claude Code / Codex / OpenCode V1 / Pi / Factory Droid conversations or `source: "all"` for both, and read source excerpts on demand. The CLI performs this retrieval against local files. A coding agent can include retrieved excerpts in requests to its configured model provider.

```ts
import { recallMem, readMemRefs } from "mini-trellis-core/mem";
```

Most people want the CLI instead: `npm install -g mini-trellis`.

AGPL-3.0-only. See `LICENSE` and `COPYRIGHT`.
