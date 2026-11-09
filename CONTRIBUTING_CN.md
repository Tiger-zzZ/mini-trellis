# 贡献指南

这是 Trellis 0.6.17 的 AGPL-3.0 公开 fork。保留 Mindfold 版权和 `COPYRIGHT` 里的修改声明。

## 范围

mini-trellis 是轻量的项目记忆层：spec、research、journal 和跨会话召回。贡献应帮助 Agent 保存与查找可复用知识，同时保持安装和日常使用简单。

支持宿主：Claude Code、Codex、OpenCode、Pi、DeepSeek Harness、Cursor、CodeBuddy、ZCode。DeepSeek 没有项目级 SessionStart。Cursor 托管云端不跑 `sessionStart`，自托管机器仍未验证。这两个宿主都不解析本机对话。OpenCode 和 Pi 没有精确 compact。

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

## 发布核对

验收、PR 合并、标签和官网更新遵循[维护与发布工作流](docs/maintenance-workflow.md)。CLI 与 core 包版本保持一致。PR 合并后，在已验证的 main 提交上创建 `vX.Y.Z` 标签，例如 `v0.3.7`。npm 由维护者手动发布，顺序为 core、CLI。

[官网](https://mini-trellis.github.io/)在[独立仓库](https://github.com/mini-trellis/mini-trellis.github.io)维护。中英文内容、导航、版本说明和当前版本提示随版本同步，评测数字保留真实测量版本。
