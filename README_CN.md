# mini-trellis

AI 编码助手的记忆层。[Trellis](https://github.com/mindfold-ai/Trellis) 0.6.17 的精简 fork。

## 为什么有这个项目

Trellis 给了我四样真正离不开的东西：spec 沉淀、research 笔记、session journal、跨 session 的对话检索。但它同时也是一整套四阶段任务流：task.py、PRD 门、子代理验收。用了一阵，我发现自己一直在绕开任务流，每天用的只有记忆层。

这个 fork 做的事很单纯：把任务流拆掉，留下记忆层。取名 mini，少就是目的。

谢谢 Trellis 的作者们。站在巨人的肩膀上，我做的主要是删代码。

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

## 记一笔

- Claude / OpenCode：`/mini-trellis:remember`
- Codex：`$mini-trellis-remember`
- Pi：`/mini-trellis-remember`

长期边界用 `mini-trellis-update-spec` 沉淀进 spec。

## 许可

AGPL-3.0。原版权 Mindfold LLC，修改声明见 `COPYRIGHT`。
