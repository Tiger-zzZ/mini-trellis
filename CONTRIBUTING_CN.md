# 贡献指南

这是 Trellis 0.6.17 的 AGPL-3.0 公开 fork。保留 Mindfold 版权和 `COPYRIGHT` 里的修改声明。

## 范围

mini-trellis 是轻量的项目记忆层：spec、research、journal 和跨会话召回。贡献应帮助 Agent 保存与查找可复用知识，同时保持安装和日常使用简单。

支持宿主：Claude Code、Codex、OpenCode、Pi、DeepSeek Harness、Cursor。DeepSeek 没有项目级 SessionStart。Cursor 托管云端不跑 `sessionStart`，自托管机器仍未验证。这两个宿主都不解析本机对话。OpenCode 和 Pi 没有精确 compact。

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

CLI 与 core 包版本保持一致，更新 changelog 和版本说明，验包后再发布。先发布 core，再发布依赖该版本的 CLI。

PR 合并后，在已验证的发布提交上创建标签。新发布标签使用 `mini-trellis-v<version>`，沿用 `mini-trellis-v0.3.2` 的命名。

[官网](https://mini-trellis.github.io/)在[独立仓库](https://github.com/mini-trellis/mini-trellis.github.io)维护。中英文内容、导航、版本说明和“当前版本”提示随实际 npm 发布同步，评测数字保留真实测量版本。
