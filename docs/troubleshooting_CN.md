# 故障排查

先确认项目目录和安装版本，再分别检查配置与实际召回结果。

```bash
mini-trellis --version
mini-trellis doctor
mini-trellis platforms --json
```

## 安装与 Hook

| 检查结果 | 下一步 |
| --- | --- |
| `legacy-trellis` | 检查 `mini-trellis migrate --dry-run`，按[迁移指南](migration_CN.md)处理。 |
| `memory-layer` | 检查 `.trellis/` 及其中脚本，在目标项目执行初始化。 |
| `instructions` | 检查 `AGENTS.md` 的受管块，针对使用的 Agent 执行 init。 |
| 未配置平台 | 用实际使用的 Agent 参数运行 init。 |
| `<host>-runtime: unknown` | 完成必要的信任设置后开启新会话。该状态表示尚未观察到运行结果。 |
| `<host>-runtime: warn` | 阅读具体错误，检查提示中的脚本或配置。 |
| `cursor-config` | 修正 JSON/Hook 结构，或通过 init 补回缺失的 sessionStart 注册。 |
| `kiro-config` | 检查 `.kiro/hooks/mini-trellis.json` 与 SessionStart 注册，用 `mini-trellis refresh --kiro --dry-run` 预览更新。 |
| `zcode-config` / `zcode-trust` | 检查项目 Hook 注册，在 ZCode 钩子面板或 CLI 中审查信任。 |

`doctor --json` 提供相同检查的机器可读结果。配置通过后，新开会话让 Agent 找回一条有辨识度的规则，继续核对实际返回的笔记。

## 已保存的笔记没有出现在结果里

1. 确认文件已保存，正文包含预期词项。
2. 在正确仓库执行 recall，或通过 `--cwd` 指定项目。
3. 检查[文档发现范围](recall_CN.md#sources)，以及普通文档是否被 `.gitignore` 排除。
4. 阅读 `incomplete` 告警；结果被截断时调整 `--max-chars`。
5. 尝试使用来源中明确的标识符、路径或短语。

平台参数筛选对话来源，项目文档仍参与搜索。原始历史暂不支持的平台，可以提供文本导出交给 [session-insight](history_CN.md)。

## 无法读取会话

在目标项目使用 `mem list --platform <name> --json`，复制完整 ID，并在 `mem context` 中指定相同平台。会话属于其他项目时，使用 `--cwd` 选择该项目。

`session-history-missing` 可能表示记录尚未落盘；`session-history-unreadable` 表示读取失败；`opencode-v2-history-unsupported` 表示跳过了 V2 来源。先查看具体告警，再决定如何调整查询。

## 刷新或迁移提示冲突

备份自定义内容，检查报告中的具体路径。refresh 列出需要覆盖的文件并统一询问 `[y/N]`；输入 `N`、回车或遇到 EOF 时，项目文件保持原样。`--json` 或非交互运行报告需要确认的覆盖时，在终端运行 refresh 完成确认。详见[升级与刷新](upgrade_CN.md)。迁移遇到目标路径冲突或支持平台的无效配置时会停止；需要移动或改名的主题，先检查正文再处理。完成后重新执行 `--dry-run`，确认变更后应用。

## 提交问题反馈

提供 mini-trellis 版本、Agent 及版本、操作系统、执行命令、预期结果、实际输出和相关 `doctor` 诊断。移除凭据与私有对话内容，优先给出最小来源片段或可复现示例。

[提交 Issue](https://github.com/Tiger-zzZ/mini-trellis/issues)。
