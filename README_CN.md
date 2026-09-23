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

## 为什么有这个项目

Trellis 给了我四样真正离不开的东西：spec 沉淀、research 笔记、session journal、跨 session 的对话检索。但它同时也是一整套四阶段任务流：`task.py`、PRD 门、子代理验收，还有每一轮都在提醒模型「你现在在第几阶段」的面包屑。用了一阵，我发现自己一直在绕开任务流，每天用的只有记忆层。

模型也在变。GPT 6 / Fable 5 这一代的 agent 不需要一份脚本告诉它什么时候该规划、什么时候该验收。它仍然做不到的是记住上周我们定了什么，以及找回那段已经解过这个 bug 的对话。这个 fork 留下的就是这个缺口。

所以 mini-trellis 把任务流拆掉，留下记忆层。取名 mini，少就是目的。

谢谢 Trellis 的作者们。站在巨人的肩膀上，我做的主要是删代码。

## Trellis 与 mini-trellis 的区别

Trellis 是一套工程框架：它规定一个任务如何从 PRD 走到实现再到验收，并用每轮 hook、子代理和任务状态机推着模型走完这条路。mini-trellis 只是这套框架底下的记忆。它不建任务、不告诉模型现在在哪个阶段、不派发子代理。它在 session 开始时注入几行定位信息，让模型按需去读 spec 和 research，然后只给两个动词：`remember` 写 journal，`mem` 搜历史对话。Trellis 围绕记忆做的那些事，都交还给模型和你自己。

| | Trellis 0.6.17 | mini-trellis 0.1.0 |
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
| `.trellis/spec/` | 长期约定，短 markdown，先读 `index.md` |
| `.trellis/research/<topic>.md` | 调研 inbox；过期的手动 `git mv` 进 `research/archive/` |
| `.trellis/workspace/<你>/journal-*.md` | session 笔记，remember 自动 commit |
| `mini-trellis mem search <kw>` | 检索 Claude / Codex / OpenCode / Pi 的历史对话 |

## 一个 session 是怎么走的

1. **SessionStart** 注入几行：你的 journal 路径、spec index 路径、热的 research 主题。只有路径，不注入正文，也没有任何任务或阶段信息。
2. **session 中**，模型按需读 spec 或 research；碰到「这个是不是之前讨论过」这类问题时，去调 `mini-trellis mem`。
3. **结束时或 compact 之后**，`remember` 往 journal 追加一条并提交。这次 session 产出了可复用的调研，就写进 `.trellis/research/<topic>.md`；下周仍然成立的边界，用 `mini-trellis-update-spec` 沉淀进 spec。

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
| `mini-trellis uninstall` | 从项目里移除宿主文件和 `.trellis/` |
| `mini-trellis platforms` | 查看当前项目配置了哪些宿主 |

没有会改写项目文件的 `update`。

## 已经在用 Trellis？

如果某个项目已经在跑 Trellis，我的建议是别动它。把 mini-trellis 用到新项目上去。两者的数据目录都是 `.trellis/`，指令面也清不干净——Trellis 的 skill、命令、agent 会和 mini-trellis 的一起被发现。

确实想转换某个项目，用 `mini-trellis migrate`：

```bash
mini-trellis migrate --dry-run   # 先看会删什么
mini-trellis migrate             # 会先问，默认 no
```

它会把四个宿主的 hook、settings、skill、命令换成 mini-trellis 的版本，删掉 Trellis 独有的指令面（skill、命令、agent、每轮注入的插件、`workflow.md`、`task.py`），把 `AGENTS.md` 里的 Trellis 块换成 mini-trellis 的，并移除 `.trellis/.version`，让 Trellis CLI 不再提示把项目更新回四阶段流程。

**不做备份。** 删除不可逆，先 commit 或拷走你想留的东西。

### 迁移之后

- `.trellis/spec/`、`research/`、`workspace/`、`tasks/` 原样保留。你的 spec 内容还在，包括 Trellis 写下的 `backend/`、`frontend/` 文档——它们仍会出现在 SessionStart 的 spec 列表里。
- `.trellis/config.yaml` 和 `.trellis/scripts/` 会被 mini-trellis 的版本覆盖，本地改过的要重新加回去。
- 老任务目录留在磁盘上，但 `task.py` 没了之后不再有人读它们。想清就手动清。
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
