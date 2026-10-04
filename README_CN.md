# mini-trellis

**AI 编码助手的记忆层。** [Trellis](https://github.com/mindfold-ai/Trellis) 0.6.17 的精简 fork：留下 spec、research、journal 和跨 session 检索，其余全部拆掉。

[English](./README.md) | 简体中文

<p>
<a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/v/mini-trellis.svg?style=flat-square&color=2563eb" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/mini-trellis"><img src="https://img.shields.io/npm/dm/mini-trellis?style=flat-square&color=cb3837&label=downloads" alt="npm downloads" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/stargazers"><img src="https://img.shields.io/github/stars/Tiger-zzZ/mini-trellis?style=flat-square&color=f59e0b" alt="GitHub stars" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/issues"><img src="https://img.shields.io/github/issues/Tiger-zzZ/mini-trellis?style=flat-square" alt="GitHub issues" /></a>
<a href="https://github.com/Tiger-zzZ/mini-trellis/pulls"><img src="https://img.shields.io/github/issues-pr/Tiger-zzZ/mini-trellis?style=flat-square" alt="GitHub pull requests" /></a>
</p>

## 快速开始

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude   # 还可叠加：--codex --opencode --pi
```

装好之后：在 agent 里 `/mini-trellis:remember` 记一笔 session，`mini-trellis mem search "关键词"` 搜历史对话。

## 为什么有这个项目

Trellis 给了我四样真正离不开的东西：spec 沉淀、research 笔记、session journal、跨 session 的对话检索。但它同时也是一整套四阶段任务流：`task.py`、PRD 门、子代理验收，还有每一轮都在提醒模型「你现在在第几阶段」的面包屑。用了一阵，我发现自己一直在绕开任务流，每天用的只有记忆层。

模型也在变。现在的 agent 自己已经会规划、会验收，不需要一份脚本在旁边提醒它走到哪一步了。它仍然做不到的是记住上周我们定了什么，以及找回那段已经解过这个 bug 的对话。这个 fork 留下的就是这个缺口。

所以 mini-trellis 把任务流拆掉，留下记忆层。取名 mini，少就是目的。

谢谢 Trellis 的作者们。站在巨人的肩膀上，我做的主要是删代码。

## Trellis 与 mini-trellis 的区别

Trellis 是一套工程框架：它规定一个任务如何从 PRD 走到实现再到验收，并用每轮 hook、子代理和任务状态机推着模型走完这条路。mini-trellis 只是这套框架底下的记忆。它不建任务、不告诉模型现在在哪个阶段、不派发子代理。它在 session 开始时注入几行定位信息，让模型按需去读 spec 和 research，然后只给两个动词：`remember` 写 journal，`mem` 搜历史对话。Trellis 围绕记忆做的那些事，都交还给模型和你自己。

| | Trellis 0.6.17 | mini-trellis 0.1.1 |
|---|---|---|
| 定位 | 工程框架：spec + 任务流 + 记忆 | 只做记忆层 |
| 宿主 | 22 个 AI 编码工具 | Claude Code、Codex、OpenCode、Pi |
| Hook | SessionStart + 每轮面包屑 + PreToolUse 子代理注入 | 只有 SessionStart |
| 任务系统 | `task.py`、`tasks/`、PRD / jsonl 门、`workflow.md`、归档 | 无 |
| 子代理 | `trellis-research` / `implement` / `check` | 无 |
| 随 init 安装的 skill 与命令 | 约 10 个 skill、3 个命令、3 个 agent | `remember`、`session-insight`、`update-spec` |
| CLI | init、update、workflow、channel、ablate、restore、mem、upgrade、uninstall、platforms | init、migrate、mem、upgrade、uninstall、platforms |
| Spec | 按层生成 7 段模板 | 一份短种子，之后你写短 markdown |
| Research | 寄生在任务目录里 | 一等公民 `.trellis/research/`，冷数据进 `archive/` |
| Journal 触发 | 归档任务后 `finish-work` | `remember`，compact 后再提醒一次 |
| 代码量 | `packages/` 约 11 万行 | 约 3.1 万行 |
| 许可 | AGPL-3.0 | AGPL-3.0（不变） |

想要一套带护栏的完整工作流，用 Trellis。想让 agent 记得住又不碍事，用这个。

## 留下的四件事

| 路径 | 作用 |
|------|------|
| `.trellis/spec/` | 长期约定，短 markdown，先读 `index.md`；下周仍然成立的才放这里 |
| `.trellis/research/<topic>.md` | 调研 inbox：过程和证据都留下，以后可能复用；过期的手动 `git mv` 进 `research/archive/` |
| `.trellis/workspace/<你>/journal-*.md` | session 笔记：做了什么、决定了什么、下一步是什么；remember 追加，可配置自动 commit |
| `mini-trellis mem search <kw>` | 前三样是写给未来的，这一个是查过去的：检索 Claude / Codex / OpenCode / Pi 的历史对话 |

## 一个 session 是怎么走的

1. **SessionStart** 注入几行：你的 journal 路径、spec index 路径、热的 research 主题。只有路径，不注入正文，也没有任何任务或阶段信息。
2. **session 中**，模型按需读 spec 或 research；碰到「这个是不是之前讨论过」这类问题时，去调 `mini-trellis mem`。
3. **结束时或 compact 之后**，让模型执行 `remember` 往 journal 追加一条，是否自动提交遵循 `session_auto_commit` 配置。可复用的调研写进 `.trellis/research/<topic>.md`，长期边界用 `mini-trellis-update-spec` 沉淀进 spec。Hook 只提供上下文和提醒，关闭会话不会自动保存笔记。

## 什么自动，什么不自动

自动的只有三件：SessionStart 的定位注入、research 主题列表、`mem` 对本地历史对话的检索。

写 journal、沉淀 spec、留 research 笔记都要主动做——有 hook 不代表它会替你记东西，记忆里有什么，取决于你让 agent 记了什么。

## 安装

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
# 还可叠加：--codex --opencode --pi
```

journal 脚本和 SessionStart hook 需要 Python ≥ 3.9。Codex 的 SessionStart 要在 `~/.codex/config.toml` 里开 `[features].hooks = true`，再在 TUI 里 `/hooks` 批准一次。

| 命令 | 作用 |
|---|---|
| `mini-trellis init` | 写入记忆骨架，以及你传入的宿主的指令面 |
| `mini-trellis mem list\|search\|context\|extract\|projects` | 检索四个宿主的本地会话日志，不上传任何内容 |
| `mini-trellis migrate` | 转换一个 Trellis 项目（见下文） |
| `mini-trellis upgrade` | 通过 npm 升级全局 CLI |
| `mini-trellis refresh --dry-run` | 预览已安装脚本和宿主资产的安全刷新 |
| `mini-trellis doctor` | 检查安装、配置和宿主触发入口 |
| `mini-trellis uninstall` | 从项目里移除宿主文件和 `.trellis/` |
| `mini-trellis platforms` | 查看当前项目配置了哪些宿主 |

`refresh` 只处理 mini-trellis 认领且未被本地修改的资产；冲突会保留并报告。`refresh --dry-run` 不写文件。

当前版本 0.2.0。不同宿主版本的 hook 交付能力可能有差异，可用 `mini-trellis doctor` 检查并在真实会话中验证。

### 升级已有 mini-trellis 项目

`mini-trellis upgrade` 只升级全局 CLI。要刷新已有项目已经安装的脚本和宿主模板：

1. 先提交或备份 `.trellis/`、`AGENTS.md` 和已配置的宿主目录，包括被 gitignore 忽略的文件。
2. 先运行 `mini-trellis refresh --dry-run` 查看清单和冲突。
3. 确认后运行 `mini-trellis refresh`；它只更新受管理且未被本地修改的文件，保留自定义 config、workspace、spec、research 和 journal。
4. 运行 `mini-trellis doctor`，再重新开启宿主会话验证上下文交付。

`migrate` 用于 Trellis 项目或残留的 `.trellis/tasks/`，不是通用模板更新命令。

## 已经在用 Trellis？

如果某个项目已经在跑 Trellis，我的建议是别动它。把 mini-trellis 用到新项目上去。两者的数据目录都是 `.trellis/`，指令面也清不干净——Trellis 的 skill、命令、agent 会和 mini-trellis 的一起被发现。

确实想转换某个项目，用 `mini-trellis migrate`：

```bash
mini-trellis migrate --dry-run   # 先看会删什么
mini-trellis migrate             # 会先问，默认 no
```

它会把四个宿主的 hook、settings、skill、命令换成 mini-trellis 的版本，删掉 Trellis 独有的指令面（skill、命令、agent、每轮注入的插件、`workflow.md`、`task.py`），把 `AGENTS.md` 里的 Trellis 块换成 mini-trellis 的，并移除 `.trellis/.version`，让 Trellis CLI 不再提示把项目更新回四阶段流程。

它还会把 `.trellis/tasks/` 收敛进记忆层——`task.py` 没了之后，这棵树已经没人读了：

- 每个任务目录变成一个 research topic：`.trellis/tasks/<name>/` → `.trellis/research/<name>/`，归档任务进 `.trellis/research/archive/YYYY-MM/<name>/`。日期前缀和目录名都保留，保留的任务内容内部相对链接不变。指向退场文件的链接（如 `../prd.md`）不会修复。
- 每个 topic 的 `research/` 子树和 `design.md` 原地不动。任务根上的其余一切——`task.json`、`prd.md`、`implement*`、`check.jsonl`、`drafts/`，以及任何 migrate 不认识的文件——都离开 topic。开始前问你一次：归档到 `.trellis/research/<topic>/legacy/`，还是直接删除。默认归档，`--yes` 也走归档。
- 留在原地的笔记里，repo-relative 的 `.trellis/tasks/…` 提及按完整来源路径改指到新位置；归档前的旧路径只在任务名唯一时修复。有歧义或不支持的引用保持原样并计数告警，其他仓库的引用不改写。
- `.trellis/.runtime/sessions/*.json` 里的 `current_task` 指针置 null；`tasks/` 搬空后才删除。

如果 `.trellis/research/` 下已有目标路径，或任务根已有 `legacy` 条目，migrate 会在动手前停下并列出冲突，先移动或改名后再重试。迁移目录必须是真实目录，不能是符号链接；`tasks/` 中未处理的条目（包括失效符号链接）会保留并告警，不会随目录删除。改写笔记时不会跟随符号链接。

**不做备份。** 删除不可逆，先 commit 或拷走你想留的东西。

### 迁移之后

- `.trellis/spec/`、`research/`、`workspace/` 原样保留。你的 spec 内容还在，包括 Trellis 写下的 `backend/`、`frontend/` 文档——它们仍会出现在 SessionStart 的 spec 列表里。
- `.trellis/config.yaml` 和 `.trellis/scripts/` 会被 mini-trellis 的版本覆盖，本地改过的要重新加回去。
- 迁移后的任务目录是 `.trellis/research/` 下的 topic，热 topic 由 SessionStart 列出；只有没有未处理条目时才删除 `.trellis/tasks/`。
- `.trellis/.version` 被移除，mini-trellis 自己不会再写这个文件，Trellis CLI 在这个项目里不会再有更新提示。

## 记一笔

- Claude / OpenCode：`/mini-trellis:remember`
- Codex：`$mini-trellis-remember`
- Pi：`/mini-trellis-remember`

长期边界用 `mini-trellis-update-spec` 沉淀进 spec。

## 反馈

时间匆忙，仓促成篇。欢迎多试、多提意见，[issues](https://github.com/Tiger-zzZ/mini-trellis/issues) 和 pull request 都来者不拒，本地开发见 [CONTRIBUTING_CN](./CONTRIBUTING_CN.md)。感谢 Trellis 团队，感谢论坛里一起想要一个更小的 Trellis 的各位。

## 许可

AGPL-3.0。原版权 Mindfold LLC，修改声明见 `COPYRIGHT`。

## 社区支持

[Linuxdo](https://linux.do/)
