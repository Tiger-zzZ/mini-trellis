# mini-trellis

AI 编码助手的记忆层，从 [Trellis](https://github.com/mindfold-ai/Trellis) 0.6.17 剪出来的。任务状态管理整套拿掉：task.py、PRD 门、四阶段流程、子代理。spec 沉淀、research 调研、session journal、跨 session 对话检索原样保留。

## 为什么有这个项目

Trellis 有很棒的对话沉淀能力，但是任务和状态管理过于冗长。

现在的模型不需要脚本告诉它什么时候该规划、什么时候该验收，这些它自己就会。它做不到的是记住上周定了什么，或者找回那段解过同一个 bug 的对话。所以 mini-trellis 把任务状态管理整个拆掉，记忆这一半原样留下。

再次感谢 Trellis 的作者们。

## 留下的四件事

| 路径 | 作用 |
|------|------|
| `.trellis/spec/` | 长期约定，短 markdown，先读 `index.md` |
| `.trellis/research/<topic>.md` | 调研 inbox；过期的手动 `git mv` 进 `research/archive/` |
| `.trellis/workspace/<你>/journal-*.md` | session 笔记，remember 自动 commit |
| `mini-trellis mem search <kw>` | 检索 Claude / Codex / OpenCode / Pi 的历史对话 |

## 安装

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
# 还可叠加：--codex --opencode --pi
```

journal 脚本和 SessionStart hook 需要 Python ≥ 3.9。Codex 的 SessionStart 要在 `~/.codex/config.toml` 里开 `[features].hooks = true`，再在 TUI 里 `/hooks` 批准一次。

升级 CLI 用 `mini-trellis upgrade`。没有会改写项目文件的 `update`。

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

## 许可

AGPL-3.0。原版权 Mindfold LLC，修改声明见 `COPYRIGHT`。
