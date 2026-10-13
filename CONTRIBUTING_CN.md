# 贡献指南

这是 Trellis 0.6.17 的 AGPL-3.0 公开 fork。保留 Mindfold 版权和 `COPYRIGHT` 里的修改声明。

## 范围

mini-trellis 是轻量的项目记忆层：spec、research、journal 和跨会话召回。贡献应帮助 Agent 保存与查找可复用知识，同时保持安装和日常使用简单。

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

从当前开发分支创建功能分支，完成修改后提交 PR。
