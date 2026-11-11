# 安装与快速开始

在 Git 项目根目录操作。项目中已安装 Trellis 时，先阅读[迁移指南](migration_CN.md)。

## 环境要求

- Node.js 18.17 或更新版本
- Python 3.9 或更新版本（macOS/Linux 使用 `python3`，Windows 使用 `python`）
- Git，以及一个支持的编程 Agent

## 安装 CLI

```bash
npm install -g mini-trellis
mini-trellis --version
```

## 初始化项目

选择实际使用的 Agent，将 `your-name` 替换为开发者名称：

```bash
mini-trellis init -u your-name --claude
mini-trellis doctor
```

同一个项目可以使用多个工具：

```bash
mini-trellis init -u your-name --claude --codex
```

v0.3.8 支持 `--claude`、`--codex`、`--cursor`、`--opencode`、`--pi`、`--omp`、`--kiro`、`--dsh`、`--codebuddy` 和 `--zcode`。信任设置及平台差异见 [Agent 配置](agents_CN.md)。

初始化创建 `.trellis/`、受管说明块和所选 Agent 的集成文件，保留已有项目知识。开发日志位于 `.trellis/workspace/<name>/`。初始化完成后，按项目惯例检查并提交文件变更。

## 保存第一条知识

开启新的 Agent 会话。以下示例假设团队已经确认回调行为，可以这样提出记录请求：

```text
记录这条项目约定：每个回调携带幂等键，重复回调返回第一次的结果。
更新已有的回调规范；没有合适的文件时创建一篇短 spec。
然后使用 mini-trellis-remember，在本次开发日志中链接这条决定。
```

Claude Code 的记录命令是 `/mini-trellis:remember`。其他工具的入口见[命令参考](commands_CN.md#skills)。

检查主题正文是否包含约定，以及日志是否链接到该文件。示例项目可以使用 `.trellis/spec/backend/callbacks.md`；已有 README 或 docs 页面同样可以承载知识。

## 在新会话中找回

```bash
mini-trellis mem recall "回调 幂等"
```

结果包含来源、短摘录和 `ref`。需要更多细节时，复制结果中的真实引用：

```bash
mini-trellis mem read "<ref-from-recall>"
```

至此已经完成一次完整使用：保存决定、开启新会话、找回原文。接下来阅读[日常使用](using_CN.md)；如果没有看到预期结果，按[故障排查](troubleshooting_CN.md)检查。
