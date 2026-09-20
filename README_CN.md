# mini-trellis

给 AI 编码助手用的极简记忆层。从 [Trellis](https://github.com/mindfold-ai/Trellis) 0.6.17 fork。

只保留四件事：**spec**、**research**、**journal**、**跨 session 对话检索**。四阶段任务流已去掉。

许可 AGPL-3.0。原版权 Mindfold LLC；本 fork 的修改声明在 `COPYRIGHT`。

## 安装

```bash
npm install -g mini-trellis
mini-trellis init -u your-name --claude
# 还可：--codex --opencode --pi
```

journal 脚本和 SessionStart hook 需要 Python ≥ 3.9。

## 用法

| 路径 | 作用 |
|------|------|
| `.trellis/spec/` | 长期约定（短 markdown，先读 `index.md`） |
| `.trellis/research/<topic>.md` | 调研 inbox。过期的 `git mv` 到 `research/archive/` |
| `.trellis/workspace/<你>/journal-*.md` | session 笔记 |
| `mini-trellis mem search <kw>` | 检索 Claude / Codex / OpenCode / Pi 的历史对话 |

记下本 session：

- Claude / OpenCode：`/mini-trellis:remember`
- Pi：`/mini-trellis-remember`
- Codex：`$mini-trellis-remember`

长期边界用 `mini-trellis-update-spec` 写进 spec。

## 宿主

Claude Code、Codex、OpenCode、Pi。数据目录都是 `.trellis/`。

Codex 的 SessionStart 需要用户级 `~/.codex/config.toml` 里 `[features].hooks = true`，再在 TUI 里 `/hooks` 批准一次。

## CLI

```
mini-trellis init
mini-trellis mem list|search|context|extract|projects
mini-trellis platforms
mini-trellis upgrade
mini-trellis uninstall
```

没有会改写项目文件的 `update`。升 CLI 用 `mini-trellis upgrade`。
