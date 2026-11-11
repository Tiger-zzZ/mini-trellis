<h1 align="center">
  <a href="https://mini-trellis.github.io/zh/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Tiger-zzZ/mini-trellis/main/docs/assets/wordmark-dark.svg" />
      <img src="https://raw.githubusercontent.com/Tiger-zzZ/mini-trellis/main/docs/assets/wordmark-light.svg" alt="mini-trellis" width="460" />
    </picture>
  </a>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/v/mini-trellis?style=flat-square&amp;logo=npm&amp;logoColor=white&amp;labelColor=173f35&amp;color=28785e" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/dm/mini-trellis?style=flat-square&amp;logo=npm&amp;logoColor=white&amp;label=downloads&amp;labelColor=173f35&amp;color=28785e" alt="npm downloads per month" /></a>
  <a href="https://mini-trellis.github.io/zh/"><img src="https://img.shields.io/badge/docs-website-28785e?style=flat-square&amp;logo=readthedocs&amp;logoColor=white&amp;labelColor=173f35" alt="Documentation website" /></a>
  <a href="https://github.com/Tiger-zzZ/mini-trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-64766f?style=flat-square&amp;labelColor=173f35" alt="AGPL-3.0 license" /></a>
</p>

<p align="center"><strong>让项目知识延续到下一次开发。</strong></p>

<p align="center">为编程 Agent 保存架构约定、调研结论与开发记录。<br/>在项目 Markdown 和本地对话中查找依据，随代码一起维护。</p>

<p align="center">
  <a href="https://mini-trellis.github.io/zh/docs/">文档</a> ·
  <a href="https://mini-trellis.github.io/zh/install/">快速开始</a> ·
  <a href="https://mini-trellis.github.io/zh/agents/">支持工具</a> ·
  <a href="https://mini-trellis.github.io/zh/faq/">常见问题</a> ·
  <a href="https://github.com/Tiger-zzZ/mini-trellis/blob/main/README.md">English</a>
</p>

## 为下一次开发留下依据

| 能力 | 用法 |
| --- | --- |
| **保存项目知识** | 在已有 README、docs、spec 和 research 中维护约定与结论，用日志链接本次工作。 |
| **统一检索来源** | `mem recall` 同时查项目文档和已支持的本地对话，返回摘录、路径与引用。 |
| **整理历史讨论** | `session-insight` 将选定会话或文本导出整理到已有项目文档。 |
| **持续更新决定** | 修改原主题，保留调研依据；整篇替换时记录新旧笔记的关系。 |
| **跨工具使用** | 不同 Agent 使用同一份项目 Markdown，支持的历史来源见平台能力表。 |

![项目中的约定、调研和验证记录，如何在后续会话中复用](https://raw.githubusercontent.com/Tiger-zzZ/mini-trellis/main/docs/assets/knowledge-zh.svg)

## 快速开始

需要 Node.js ≥ 18.17、Python ≥ 3.9 和 Git。在项目根目录执行：

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
mini-trellis doctor
```

开启新的 Agent 会话，记录一条已确认的决定：

```text
回调必须携带幂等键，重复回调返回第一次的结果。
把这条约定更新到现有规范，然后使用 mini-trellis-remember 记录主题链接。
```

后续会话查找这条约定，需要更多上下文时展开结果中的真实 `ref`：

```bash
mini-trellis mem recall "回调 幂等"
mini-trellis mem read "<ref-from-recall>"
```

[完整安装指南](https://mini-trellis.github.io/zh/install/)包含环境检查、信任设置和第一次使用的验证步骤。

## 支持的工具

Claude Code · Codex · Cursor · OpenCode V1/V2 · Pi · OMP · Kiro · DeepSeek Harness · CodeBuddy · ZCode

可以组合初始化参数，例如 `--claude --codex`。原始对话读取支持 Claude Code、Codex、OpenCode V1 和 Pi；全部平台的知识入口、记录命令和配置步骤见 [Agent 配置](https://mini-trellis.github.io/zh/agents/)。

## 文档

| 想完成什么 | 阅读入口 |
| --- | --- |
| 在日常开发中查找和记录决定 | [日常使用](https://mini-trellis.github.io/zh/using/) |
| 整理已有聊天记录 | [历史整理](https://mini-trellis.github.io/zh/history/) |
| 编写规范、调研和日志 | [编写知识](https://mini-trellis.github.io/zh/writing-notes/) |
| 查找命令参数和项目设置 | [命令与技能](https://mini-trellis.github.io/zh/commands/) · [配置](https://mini-trellis.github.io/zh/configuration/) |
| 从 Trellis 迁移，或维护已有安装 | [迁移](https://mini-trellis.github.io/zh/migration/) · [升级](https://mini-trellis.github.io/zh/upgrade/) |
| 定位安装或检索问题 | [故障排查](https://mini-trellis.github.io/zh/troubleshooting/) |

完整指南也保存在仓库的 [docs](https://github.com/Tiger-zzZ/mini-trellis/blob/main/docs/index_CN.md) 中。

## 常见问题

**已有 AGENTS.md / CLAUDE.md，如何配合？** 继续用作项目入口，详细知识在原有文档中维护，mini-trellis 提供记录技能与统一检索。

**哪些内容需要主动保存？** 以后还会用到的决定、调研与修复经验。普通修改沿用项目自己的开发流程。

**数据存在哪里？** CLI 读取本地文档和对话文件。项目知识可随 Git 共享；Agent 读取的摘录可能随上下文发送给其配置的模型服务。

[查看完整 FAQ](https://mini-trellis.github.io/zh/faq/)。

## 实测记录

在已公开的 Claude Code 对照实验中，mini-trellis v0.3.1 对比 Trellis v0.7.0-beta.4，六组任务各重复三次，累计耗时减少 **38.4%**，处理 Token 减少 **40.1%**。这是特定版本和配置下的历史测量；处理 Token 包含缓存读取，不能直接换算为费用。

测试环境、逐项结果和独立的注入字符实验见[性能评测](https://mini-trellis.github.io/zh/benchmarks/)。

## 贡献与许可

欢迎通过 [Issues](https://github.com/Tiger-zzZ/mini-trellis/issues) 提供使用反馈，或按[贡献指南](https://github.com/Tiger-zzZ/mini-trellis/blob/main/CONTRIBUTING_CN.md)提交改进。

采用 [AGPL-3.0](https://github.com/Tiger-zzZ/mini-trellis/blob/main/LICENSE) 许可。

## Star History

[![Star History](https://img.shields.io/badge/Star_History-view_chart-28785e?style=for-the-badge&logo=github&logoColor=white&labelColor=173f35)](https://www.star-history.com/?repos=Tiger-zzZ%2Fmini-trellis&type=date&legend=top-left)

[查看 Star 增长记录](https://www.star-history.com/?repos=Tiger-zzZ%2Fmini-trellis&type=date&legend=top-left)
