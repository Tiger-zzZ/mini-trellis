# 检索与召回

查找项目问题的依据时使用 `recall`；需要定位一段具体对话时，使用 `search`、`list` 和 `context`。

## 查找来源并展开

```bash
mini-trellis mem recall "回调 重试"
mini-trellis mem read "<ref-from-recall>"
```

`recall` 默认最多返回三条命中，标准输出预算为 3,000 字符，包含引用和状态。`read` 的整批输出预算为 4,000 字符。两者均可使用 `--max-chars`，`recall` 还支持 `--limit`。

以下是输出形态示例：

```text
[doc] .trellis/spec/backend/callbacks.md:1  § 回调重试  strong
  ref: <ref-from-recall>
  transient 失败总共最多尝试四次，包含首次。
```

使用时复制实际返回的 `ref`。引用包含来源位置，后续读取时可以提示来源已变化。标记为 `superseded` 的结果会指向替代笔记，见[决定变化后](writing-notes_CN.md#changed-decisions)。

<a id="sources"></a>
## 文档来源

| 位置 | 发现范围 |
| --- | --- |
| `.trellis/spec/`、`research/`、`workspace/` | Markdown，包括被 Git 忽略的项目知识 |
| 仓库根目录 | `README*.md`、`AGENTS.md`、`CLAUDE.md` |
| `docs/` 和 `doc/` | Markdown 与 MDX，按文本读取 |
| 相对 Markdown 链接 | 在仓库内进行一层有限扩展 |

普通文档遵循 `.gitignore`。运行状态、脚本、疑似密钥文件和依赖/构建目录被排除。发现过程设有文件数量、大小、深度和时间限制，部分搜索会通过告警与 `incomplete` 标明。

本地对话读取支持 Claude Code、Codex、OpenCode V1 和 Pi，平台差异见 [Agent 配置](agents_CN.md#capabilities)。

## 选择有效查询词

使用资料中出现的词或标识符，例如“回调 重试”、API 名称或文件名。宽泛查询效果不佳时，换成模块中更有辨识度的词。正文包含答案的现行笔记，可以排在主要依靠标题命中的归档笔记之前；查旧资料时仍可使用明确的路径或标识符。

## 定位一段对话

```bash
mini-trellis mem search "回调 重试" --platform claude
mini-trellis mem list --platform claude --json --limit 10
mini-trellis mem context <完整会话-id> --platform claude --grep "重试"
```

会话命令默认限定当前项目。使用 `--cwd /path/to/project` 选择其他项目，或在会话命令中用 `--global` 扩大范围。`recall` 始终按项目检索，不接受 `--global`。平台参数筛选对话来源，项目文档仍参与召回。

`mem projects` 列出已发现的项目路径。文本输出可能缩短会话 ID，查询上下文时从 JSON 结果复制完整 ID。ID 有歧义时，根据提示进一步限定项目和平台。

<a id="compact"></a>
## compact 之后

Claude Code 和 Codex 的 compact 交接提示可以携带当前会话 ID。按提示执行命令，并使用对应平台参数：

```bash
mini-trellis mem context <完整会话-id> --platform codex
```

未指定 `--grep` 时，存在压缩边界的会话会返回最近一次压缩前的有限轮次。更早的条件可以用 `--grep "关键词"` 定位。压缩摘要被排除在关键词匹配和相邻摘录之外。Codex 在下一条用户消息开始时交付 compact 提示。

OpenCode V1 和 Pi 需要先用 `mem list` 选定会话，再以完整 ID 调用 `context`；它们提供历史查找，尚无精确 compact 边界交接。其他 Agent 可以通过 `recall` 继续使用已保存的项目文档。

## 理解结果状态

- `truncated`：实际内容或命中数量超过返回条数或输出预算。
- `incomplete`：部分来源未能完整搜索。判断是否有记录前，先阅读告警。
- `session-history-missing` / `session-history-unreadable`：未找到选定历史，或文件无法读取。
- `opencode-v2-history-unsupported`：已跳过 V2 对话；项目文档和 V1 历史仍可检索。

接下来可查阅[命令参数](commands_CN.md#mem-options)或[故障排查](troubleshooting_CN.md)。
