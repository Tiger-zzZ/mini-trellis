# 贡献指南

这是 Trellis 0.6.17 的 AGPL-3.0 公开 fork。保留 Mindfold 版权和 `COPYRIGHT` 里的修改声明。

## 范围

mini-trellis 是轻量的项目记忆层：spec、research、journal 和跨会话召回。贡献应帮助 Agent 保存与查找可复用知识，同时保持安装和日常使用简单。

支持的平台与能力差异见 [Agent 配置](docs/agents_CN.md)。

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

## 文档修改

`docs/` 的双语指南是官网正文来源。同步修改中英文文件，再使用 `scripts/sync-docs-site.py` 生成官网页面。首页与版式在官网仓库维护；历史版本记录保留其对应版本的信息。

本地同步和验证方式见[文档维护](docs/maintenance-workflow.md#documentation-source)。纯文档修改检查链接、正文同步和官网构建即可，无需运行无关的产品测试套件。
