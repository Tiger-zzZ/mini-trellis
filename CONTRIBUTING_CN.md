# 贡献指南

这是 Trellis 0.6.17 的 AGPL-3.0 公开 fork。保留 Mindfold 版权和 `COPYRIGHT` 里的修改声明。

## 范围

v1 是记忆层：spec、research、journal、mem。不要加回四阶段任务流、额外宿主，或会改写项目文件的 `update`。

支持宿主：Claude Code、Codex、OpenCode、Pi。

## 本地

```bash
pnpm install
pnpm --filter mini-trellis-core build
pnpm --filter mini-trellis typecheck
pnpm --filter mini-trellis test
```

`.trellis/` 不进仓库，它是每个贡献者自己的记忆层。`pnpm build` 之后跑一次
`node packages/cli/bin/mini-trellis.js init -u <你> --claude`，`.claude/` 里的 SessionStart hook 才有东西可读。

不要写到 Trellis `main`。在 `mini-trellis` 分支工作。
