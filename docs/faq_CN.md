# 常见问题

## 如何与 AGENTS.md 或 CLAUDE.md 配合？

这些文件继续作为项目入口。mini-trellis 增加受管说明块、主题文档、记录技能，以及项目文档和已支持本地对话的检索。保留项目已有的有效指引，将详细知识维护在对应主题文档里。见[工作原理](how-it-works_CN.md)。

## 哪些操作自动发生，哪些需要主动提出？

完成安装及必要的信任设置后，支持启动集成的平台会提供简短知识入口。Agent 可以在开发中使用项目指引和技能。某条决定必须保存，或某项来源必须核对时，直接明确提出请求。[快速开始](install_CN.md)展示了一次完整的记录与召回。

## 每次会话都要记录吗？

记录能帮助后续开发的决定、调研和修复经验。没有新增可复用结论的普通修改，沿用日常开发方式即可。

## 三个技能应该怎么选？

`remember` 用于更新主题并记录本次会话，`update-spec` 用于维护长期项目约定，`session-insight` 用于整理选定历史材料。详见[命令与技能](commands_CN.md#skills)。

## 需要把已有文档搬进 .trellis 吗？

继续在原位置维护即可。根目录 README、`docs/` 与 `doc/` 中的 Markdown/MDX 会和 `.trellis` 知识一起被发现。普通文档遵循 `.gitignore`，`.trellis` 知识有对应的[发现规则](recall_CN.md#sources)。

## 一个项目能使用多个编程 Agent 吗？

可以组合初始化参数，也可以后续添加集成。各 Agent 共享项目 Markdown，原始对话读取和启动机制则因平台而异，见[平台能力表](agents_CN.md#capabilities)。

## 支持某个 Agent，就意味着能读取它的历史聊天吗？

需要分别查看这两项能力。v0.3.8 读取 Claude Code、Codex、OpenCode V1 和 Pi 的原始历史。其他已接入平台可以使用项目知识，也可以通过 [session-insight](history_CN.md) 整理明确提供的文本导出。

## doctor 通过了，为什么 Agent 仍没用到保存的规则？

`doctor` 检查配置、文件和最近观察到的 Hook 结果。接着新开会话，用笔记中有辨识度的词要求执行 `mem recall`，核对返回内容，再让 Agent 据此处理任务。这样可以分别定位安装、检索覆盖和来源使用的问题。详见[故障排查](troubleshooting_CN.md)。

## recall 没有结果时怎么处理？

检查项目路径、查询词、来源范围和告警。来源被跳过或搜索不完整，需要与完整搜索后的零命中分开判断。查原始历史时，用 `mem list --platform <name> --json` 核对会话所属项目和完整 ID。

## 旧规则被替换后怎么处理？

局部变化直接更新当前主题。整篇笔记被替代时，将旧笔记标记为 `superseded`，并通过 `superseded_by` 链接新文档。历史判断依据保留在调研或日志中。见[决定变化后](writing-notes_CN.md#changed-decisions)。

## compact 后可以找回什么？

已保存的 Markdown 仍可通过 recall 查找。Claude Code 和 Codex 在宿主提供会话 ID 时，还支持定位当前会话压缩前的历史。OpenCode V1 和 Pi 支持手动选择会话。详见 [compact 恢复](recall_CN.md#compact)。

## 数据保存在哪里，会发给谁？

CLI 读取本地文件。Markdown 可通过仓库共享，原始对话保留在 Agent 的本地存储中。编程 Agent 读取摘录后，可能将其包含在发送给模型服务的请求中。见[数据处理与共享](configuration_CN.md#sharing)。

## 记录会自动创建 Git 提交吗？

新安装使用 `session_auto_commit: false`。旧项目需要检查该设置。session-insight 整理流程使用 `--no-commit` 写日志。详见[配置说明](configuration_CN.md)。

<a id="mini-trellis-与-trellis-是什么关系"></a>
## 从 Trellis 迁移时，原有项目知识会保留吗？

迁移保留项目规范、调研和开发日志。两套集成共用 `.trellis/`，因此迁移会替换原集成，并默认归档旧任务材料。先备份 `.trellis/` 和自定义配置，再用 `mini-trellis migrate --dry-run` 预览变更。具体文件处理见[迁移指南](migration_CN.md)。

## 怎样理解评测数字？

公开测量对应特定版本、任务夹具和 Agent/模型配置。耗时、处理 Token 和注入字符是不同指标。[评测页面](benchmarks_CN.md)集中说明测试条件与来源记录。

## 卸载会保留笔记吗？

**项目卸载会删除 `.trellis/`，包括笔记和日志。** 先备份需要保留的内容，再检查 `mini-trellis uninstall --dry-run`。详见[卸载步骤](upgrade_CN.md)。
