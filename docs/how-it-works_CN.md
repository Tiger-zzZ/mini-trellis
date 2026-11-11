# 工作原理

mini-trellis 连接项目文档、Agent 技能和本地对话历史。Markdown 文件保存知识，CLI 查找相关段落，编程 Agent 在开发中读取和更新这些内容。

## 知识保存在项目中

| 内容 | 位置 | 示例 |
| --- | --- | --- |
| 项目约定 | `.trellis/spec/` | 回调必须携带幂等键。 |
| 调研依据 | `.trellis/research/` | 重试策略的选择原因、来源和备选方案。 |
| 开发日志 | `.trellis/workspace/<name>/` | 修改内容、验证结果和主题链接。 |
| 已有文档 | 根目录 README、`docs/`、`doc/` | 当前架构与使用说明。 |
| 对话依据 | Agent 本机会话目录 | 当时讨论某项决定的原文。 |

已有项目文档继续在原处维护。日志链接到当前主题，完整说明保留在主题正文中。详见[编写知识](writing-notes_CN.md)。

## 启动入口指向知识位置

支持启动集成的 Agent 会收到一段简短说明，其中包括日志位置、spec 索引和调研入口，再根据当前工作读取相关文档。

注入时机因平台而异：Claude Code 使用 SessionStart；OpenCode V2 在每次模型请求中重建短入口；DeepSeek Harness 通过项目说明和技能使用知识。差异见[平台能力表](agents_CN.md#capabilities)。启动文本大小需要结合平台和版本测量。

## 先检索，再展开原文

```bash
mini-trellis mem recall "回调 重试"
mini-trellis mem read "<ref-from-recall>"
```

`recall` 搜索项目 Markdown 和已支持的本地对话记录，返回短摘录与来源引用；`read` 展开引用。检索在本地按词项和标识符匹配，直接使用资料中的文字，无需配置 Embedding 服务。

## 随项目变化更新知识

规则变化时，更新原有文档。调研笔记可以保留之前的判断依据和放弃的方案。整篇文档被替换时，通过 `superseded_by` 记录关系，帮助召回定位当前笔记。

Agent 的 `remember`、`update-spec` 和 `session-insight` 技能指导这些编辑，分工见[命令与技能](commands_CN.md#skills)。规划、编码和审查沿用项目自己的开发方式。

## 本地存储与共享

CLI 读取本地文件。项目知识可以通过 Git 审阅和共享，原始对话保留在各 Agent 的本地存储中。编程 Agent 读取的摘录可能随上下文发送到其配置的模型服务。需要共享或忽略哪些文件，见[配置与共享](configuration_CN.md#sharing)。
