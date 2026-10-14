# 从 Trellis 迁移

[返回 README](../README_CN.md)

Trellis 与 mini-trellis 共用 `.trellis/`。已有 Trellis 的项目应通过迁移命令替换集成，避免两套指令同时生效。操作前先备份项目知识与宿主配置，包括被 Git 忽略的文件。

```bash
mini-trellis migrate --dry-run   # 预览迁移变更
mini-trellis migrate             # 确认迁移，默认 no
```

迁移会将四个宿主的 hook、settings、skill 和命令替换为 mini-trellis 版本，移除 Trellis 专用的流程文件（skill、命令、agent、每轮注入插件、`workflow.md`、`task.py`），替换 `AGENTS.md` 中的 Trellis 管理块，并移除 `.trellis/.version`，停止 Trellis CLI 在该项目中的更新提示。

宿主配置不是整文件覆盖：

- `.claude/settings.json` 和 `.codex/hooks.json` 会先去掉指向 `inject-*.py`、`statusline.py` 和旧 `session-start.py` 的 Trellis hook，再写入 mini-trellis 的 SessionStart。用户自己的 hook、`env` 和其他字段保留。
- `.pi/settings.json` 会去掉 `./extensions/trellis/index.ts` 和 `npm:pi-subagents`，保留其他 extension 与 package。
- `.codex/config.toml` 会去掉 Trellis 写入的说明和 `[agents] max_depth = 1`，再写上 mini-trellis 的项目配置。用户自己的键会附在后面。

如果上一次迁移已经删掉脚本，但配置里还留着 `inject-*.py`，再运行一次 `mini-trellis migrate` 会清理这些条目。

`.trellis/tasks/` 中的任务材料迁入研究目录：

- 每个任务目录转为一个 research topic：`.trellis/tasks/<name>/` → `.trellis/research/<name>/`，归档任务迁入 `.trellis/research/archive/YYYY-MM/<name>/`。日期前缀和目录名保留，保留内容内部的相对链接不变。指向已移入 `legacy/` 或删除文件的链接（如 `../prd.md`）不会修复。
- 每个 topic 保留 `research/` 子树和 `design.md` 的结构。其余任务材料——`task.json`、`prd.md`、`implement*`、`check.jsonl`、`drafts/` 及未识别文件——按迁移开始时的选择归档到 `.trellis/research/<topic>/legacy/` 或删除。默认归档，`--yes` 同样使用归档方式。
- 留在原地的笔记里，repo-relative 的 `.trellis/tasks/…` 提及按完整来源路径改指到新位置；归档前的旧路径只在任务名唯一时修复。有歧义或不支持的引用保持原样并计数告警，其他仓库的引用不改写。
- `.trellis/.runtime/sessions/*.json` 里的 `current_task` 指针置 null；`tasks/` 搬空后才删除。

如果 `.trellis/research/` 下已有目标路径，或任务根已有 `legacy` 条目，migrate 会在修改前停止并列出冲突。请移动或重命名冲突条目后重试。迁移目录必须是真实目录；`tasks/` 中未处理的条目（包括失效符号链接）会保留并告警，不会随目录删除。改写笔记时不会跟随符号链接。

迁移前请备份项目知识和自定义配置，包括被 Git 忽略的文件。迁移命令不会自动创建备份；选择删除的文件将被永久移除。

### 迁移之后

- `.trellis/spec/`、`research/`、`workspace/` 原样保留。已有 spec 内容，包括 Trellis 创建的 `backend/`、`frontend/` 文档，仍可检索；SessionStart 提供短入口，文档按需查找。
- `.trellis/config.yaml` 和 `.trellis/scripts/` 会被 mini-trellis 版本覆盖，自定义配置和脚本修改需在迁移后重新应用。
- 迁移后的任务目录是 `.trellis/research/` 下的 topic，`mem recall` 可查活跃和归档笔记，启动时不枚举全部主题；只有没有未处理条目时才删除 `.trellis/tasks/`。
- `.trellis/.version` 被移除，mini-trellis 自己不会再写这个文件，Trellis CLI 在这个项目里不会再有更新提示。
