# 整理历史对话

使用 `mini-trellis-session-insight` 技能，把选定会话或文本导出整理成项目知识。该能力自 v0.3.6 提供，会更新已有文档，并在日志中链接整理结果。

## 选择材料

原始历史读取支持 Claude Code、Codex、OpenCode V1 和 Pi。在当前项目列出会话，从 JSON 结果复制完整 ID：

```bash
mini-trellis mem list --platform claude --json --limit 10
```

其他 Agent 可以提供 Markdown 或纯文本导出。来源支持情况见 [Agent 配置](agents_CN.md#capabilities)。

## 提出明确的整理请求

```text
使用 mini-trellis-session-insight 整理 Claude 会话 <完整会话-id> 中的回调讨论。
更新相关 README、docs、spec 或 research，保留来源、确认的决定、纠正和例外。
存在实质冲突时，集中向我确认。
```

也可以指定导出文件：

```text
使用 mini-trellis-session-insight 整理 exports/callback-chat.md。
以这份导出作为历史材料，更新已有的回调项目文档。
```

Agent 分段阅读选定材料，结合当前文档及相关代码或测试核对，将已实现行为、已确认的后续工作和提案分开。历史命令作为当时讨论的依据处理。

## 检查整理结果

- 已有主题包含有用的结论、适用条件和来源。
- 后续纠正与放弃的方案得到准确保留。
- 文档沿用原有语言。
- 开发日志链接到更新后的文件。
- 未读材料、说话人不明、来源缺失和未解决冲突得到说明。

技能以 `--no-commit` 写入日志。同一请求没有新增知识时，不重复创建笔记或日志。部分写入失败时，先检查已经保存的内容，再完成缺失部分。

## 在另一个会话中使用

```bash
mini-trellis mem recall "回调 重试"
```

让 Agent 按保存的规则完成一个小改动，并核对规则和例外是否体现在结果中。这一步同时检查文档是否保存，以及后续会话能否使用。

## 直接查看历史

`mem context` 返回有限长度的摘录。需要完整检查已支持的会话时，可用 `mem extract` 导出后分段阅读：

```bash
mini-trellis mem extract <完整会话-id> --platform claude > /tmp/callback-history.md
```

`extract` 不限制输出体积。请为导出选择合适的私有位置，使用后清理。会话查找和摘录方式见[检索与召回](recall_CN.md)。
