# 命令与技能

项目命令在仓库根目录执行。`mini-trellis --help`、`<命令> --help` 和 `mini-trellis mem help` 显示当前安装版本的帮助。

## 项目命令

| 命令 | 用途 | 参数 |
| --- | --- | --- |
| `init` | 创建项目知识目录与 Agent 集成文件 | `-u, --user <name>`、平台参数、`-y`、`-f`、`-s` |
| `migrate` | 转换 Trellis 安装 | `--dry-run`、`-y`、`--opencode-version <version>` |
| `upgrade` | 更新全局 CLI，并刷新当前已初始化项目 | `--dry-run`、`--tag <标签或版本>` |
| `refresh` | 更新受管项目文件 | `--dry-run`、`--json`、平台参数、`--opencode-version <version>` |
| `doctor` | 检查配置、文件和最近观察到的 Hook 结果 | `--json` |
| `platforms` | 列出已配置的 Agent | `--json` |
| `uninstall` | 删除项目集成与整个 `.trellis/` | `--dry-run`、`-y` |

v0.3.8 的平台参数为 `--claude`、`--codex`、`--cursor`、`--opencode`、`--pi`、`--omp`、`--kiro`、`--dsh`、`--codebuddy`、`--zcode`，可用于 init 和 refresh。init 同样支持 `--opencode-version`，参数值为 `1` 或 `2`。

init 的 `-y` 接受默认选项，`-s` 跳过已有文件，`-f` 覆盖已有文件。添加集成时建议使用普通 init 并检查提示。refresh 直接更新常规受管文件；需要覆盖确认时，列出文件并统一询问 `[y/N]`。详见[升级与刷新](upgrade_CN.md)。

**卸载会删除 `.trellis/` 中的全部知识，包括规范、调研和日志。** 请先备份，再检查 `uninstall --dry-run`。详见[升级与卸载](upgrade_CN.md)。

## 记忆命令

| 命令 | 读取内容 | 典型用途 |
| --- | --- | --- |
| `mem recall "查询"` | 项目文档与本地对话 | 查找决定或规则 |
| `mem read "ref" ["ref" ...]` | recall 引用指向的来源 | 展开一条或多条摘录 |
| `mem list` | 本地会话信息 | 选择会话 |
| `mem search "关键词"` | 本地对话正文 | 查找讨论 |
| `mem context <会话-id>` | 选定会话的轮次 | 阅读有限长度摘录 |
| `mem extract <会话-id>` | 整理后的对话 | 完整检查或导出会话 |
| `mem projects` | 已发现的本地项目 | 查找项目路径 |

<a id="mem-options"></a>
## 记忆命令参数

| 参数 | 适用命令 | 含义与默认值 |
| --- | --- | --- |
| `--cwd <path>` | recall、read、list、search、context、extract | 选择项目，默认当前工作目录 |
| `--platform <name>` | recall、会话命令 | `claude`、`codex`、`opencode`、`pi` 或 `all`，默认 all |
| `--global` | list、search、context、extract | 包含所有项目；recall 不接受该参数 |
| `--since`、`--until` | 会话筛选 | 包含边界的日期范围，格式 `YYYY-MM-DD` |
| `--limit N` | recall、list、search、projects | 默认分别为 3、50、50、30 |
| `--grep "词项"` | context、extract | 按词项筛选轮次，多个词使用 AND |
| `--turns N` | context | 返回的命中轮次，默认 3 |
| `--around N` | context | 每条命中的相邻轮次，默认 1 |
| `--max-chars N` | recall、read、context | 输出预算，默认 3000 / 4000 / 6000 |
| `--include-children` | search、context | 将 OpenCode V1 子会话合入父会话 |
| `--phase <name>` | extract | `brainstorm`、`implement` 或 `all`，默认 all |
| `--json` | 除 help 外的全部记忆命令 | 输出机器可读 JSON |

recall 的平台参数只筛选对话来源，项目文档仍参与检索。日期参数用于会话命令，不筛选统一召回结果。read 读取选定项目中的引用。extract 不限制输出大小，也不使用 `--max-chars`。

```bash
mini-trellis mem recall "回调 重试" --limit 5 --max-chars 5000
mini-trellis mem list --platform codex --json --limit 10
mini-trellis mem context <完整会话-id> --platform codex --grep "重试" --turns 3
mini-trellis mem search "回调" --cwd /path/to/project
```

<a id="skills"></a>
## Agent 技能

这些是在编程 Agent 中使用的技能入口。

| 技能 | 用途 |
| --- | --- |
| `mini-trellis-remember` | 更新主题，并记录带链接和验证结果的会话日志 |
| `mini-trellis-update-spec` | 维护长期项目约定 |
| `mini-trellis-session-insight` | 将选定对话或文本导出整理成项目文档 |

| Agent | 记录入口 |
| --- | --- |
| Claude Code / OpenCode | `/mini-trellis:remember` |
| Codex / ZCode | `$mini-trellis-remember` 或同名技能 |
| Pi / OMP / Kiro | `/mini-trellis-remember` |
| Cursor / DeepSeek Harness | `mini-trellis-remember` 技能 |
| CodeBuddy | 同名技能；CLI 也支持 `/mini-trellis:remember` |

其他技能可以在请求中按名称指定。各平台配置见 [Agent 配置](agents_CN.md)。
