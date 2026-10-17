# 开发时怎么用

命令在项目根目录执行。Claude Code 和 OpenCode 用 `/mini-trellis:remember`，Codex 用 `$mini-trellis-remember`，Pi 用 `/mini-trellis-remember`。

## 从零安装

```bash
npm install -g mini-trellis
mini-trellis init -u 你的名字 --claude
```

只加上实际使用的宿主：`--claude`、`--codex`、`--opencode`、`--pi`。加上 `-y` 会跳过提问。init 写入 `.trellis/` 和宿主文件，不创建 Git 提交。

## 从 Trellis 迁过来

```bash
mini-trellis migrate --dry-run
mini-trellis migrate
```

`--dry-run` 只列出会改什么。迁移会换掉 Trellis 的说明入口，重写 mini-trellis 的脚本，并把 `.trellis/tasks/` 收进 research。`.trellis/spec/`、`research/`、`workspace/` 保留。`-y` 跳过提问，并把任务文件归档到 `<topic>/legacy/`。

## 改代码之前先查

```bash
mini-trellis mem recall "回调 重试"
```

输出是几条短摘录，每条带路径和 `ref`。摘录够用就按它改。要看完整笔记或当时的对话：

```bash
mini-trellis mem read "<ref>"
```

`mem search` 只搜对话。`mem list` 列出当前项目的会话。文本列表会缩短 id，JSON 里是完整 id。

```bash
mini-trellis mem search "回调 重试"
mini-trellis mem list --platform claude
mini-trellis mem context <session-id> --platform claude
```

`--platform` 可以是 `claude`、`codex`、`opencode`、`pi` 或 `all`。不加 `--global` 时，list 和 context 停在当前项目。另一个项目的完整 id 不会被用上。同一范围内同一个完整 id 命中多场时，命令不会挑一场。

没有命中就直接改。不必为了走流程先建任务。

## 开发过程中记什么

值得留下的只有以后还会用到的结论。

| 发生了什么 | 记在哪里 | 怎么说 |
| --- | --- | --- |
| 定下「回调必须带幂等键」 | `.trellis/spec/` | 对 Agent 说：把这条写成项目约定，并更新已有的 spec。 |
| 查了支付平台文档，重试最多两次 | `.trellis/research/` | 对 Agent 说：按这个主题更新研究笔记，写上结论、条件和文档链接。 |
| 试过先去重再记账，对账对不上，放弃了 | 同一篇研究笔记 | 标明这是 rejected，不要写成当前规则。 |
| 这次改了哪个文件、测试是否通过 | `.trellis/workspace/<你>/` 的 journal | 会话结束前执行对应宿主的 `remember`。 |

journal 只记过程和笔记路径。规则正文写在 spec 或 research 里。已经有同一主题的文件时，改那个文件，不要再新建一篇。

对 Agent 可以直接说：

```text
这次确认：回调必须带幂等键，重复回调直接返回第一次的结果。
先去重再记账已经试过，对账对不上，标成 rejected。
把约定写入现有 spec，研究笔记补上支付平台文档链接，然后执行 remember。
```

`remember` 会先改主题文件，再在 journal 里留下链接。

## 决定变了

只改一个章节时，改那一节。整篇笔记被替换时，留下旧笔记并指向新笔记：

```markdown
---
status: superseded
superseded_by: .trellis/research/new-topic.md
---
```

`superseded_by` 是相对仓库根的路径。召回会沿短链走到最后一篇现行笔记，并可以带上它的一小段摘录。`mem read` 给出同一条路径，不贴后继正文。目标缺失、路径越出项目或文档来源、指向自己、成环，或链太长，都会标明，不会当成现行结论。更新的文件时间、旁边的源码变化、嵌套的元数据，都不会把整篇标成过时。

## compact 之后怎么定位

Claude Code 和 Codex 在 compact 之后的启动提示里，会写上宿主送来的会话 id。在当前项目里执行它打印的命令：

```bash
mini-trellis mem context <session-id> --platform claude
```

Codex 用 `--platform codex`。不加查询时，读的是最近一次压缩边界之前的有限轮次。前面的长回复不会把最后一条短限制挤掉。`mem recall` 仍用来查项目笔记，`mem read` 展开 `session:v1` 引用。

三种失败分开说。没有会话 id 时，提示保持通用，不改绑另一场。历史文件还没落盘时，context 报 `session-history-missing`。文件不可读时，报 `session-history-unreadable`。

OpenCode 和 Pi 还没有这种精确会话恢复。它们的启动文案不会点名当前会话 id。查笔记用 `mem recall` 和 `mem read`。要看本机历史文件时，用 `mem list --platform opencode` 或 `--platform pi`，再用列表里的完整 id 调 `mem context`。

## 排障

```bash
mini-trellis doctor
```

`--json` 打出同样的检查。doctor 只报告它看得到的文件和最近一次 hook 结果，不能说明模型已经遵守规则。

| 检查 | 含义 |
| --- | --- |
| `legacy-trellis` | 还留着 Trellis 工作流。先跑 `mini-trellis migrate --dry-run`。 |
| `memory-layer` | 缺少 `.trellis` 或 `add_session.py`。跑 `mini-trellis init`。 |
| `instructions` | `AGENTS.md` 没有托管块。再跑一次 init。 |
| `platforms` | 没有发现宿主 hook。加上 `--claude`、`--codex`、`--opencode` 或 `--pi`。 |
| `<host>-runtime` 为 unknown | 还没有一次真实 hook 记录。开一轮宿主会话。Codex 要先信任项目 hook。 |
| `<host>-runtime` 为 warn | 最近一次 hook 没有干净结束。明细里有状态和错误类别。 |
