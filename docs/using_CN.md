# 开发时怎么用

命令在项目根目录执行。Claude Code 和 OpenCode 用 `/mini-trellis:remember`，Codex 用 `$mini-trellis-remember`，Pi 用 `/mini-trellis-remember`。DeepSeek Harness、Cursor 和 CodeBuddy 用技能 `mini-trellis-remember`；CodeBuddy CLI 也可用 `/mini-trellis:remember`。

## 从零安装

```bash
npm install -g mini-trellis
mini-trellis init -u 你的名字 --claude
```

只加上实际使用的宿主：`--claude`、`--codex`、`--opencode`、`--pi`、`--dsh`、`--cursor`、`--codebuddy`。加上 `-y` 会跳过提问。init 写入 `.trellis/` 和宿主文件，不创建 Git 提交。DeepSeek 没有 SessionStart，需要时自己调用 `mem recall`。Cursor 会装上技能和本地 `sessionStart`；Cursor 托管云端不跑这个 hook，本地 hook 跑过也不等于 Agent 提示里收到了 `additional_context`。两边都不解析本机对话。OpenCode 和 Pi 没有精确 compact。

## OpenCode V1 与 V2

从 0.3.5 起，新项目默认 OpenCode V2，后续功能以 V2 为主。已有项目沿用已安装的协议。新安装不要求本机存在二进制，也不再询问协议：

```bash
mini-trellis init -u 你的名字 --opencode -y
```

若仍使用 V1 宿主，显式加 `--opencode-version 1`，作为旧版兼容选项。V1 使用 `.opencode/plugins/session-start.js`，V2 使用 `.opencode/plugins/mini-trellis/index.js`。短入口和知识写入规则共用。V2 在每个模型请求中提供短入口，不把它保存成用户消息，也不全量加载笔记。

| 机制 | V1 | V2 |
| --- | --- | --- |
| 插件注册 | 工厂函数返回 hooks | `id` / `setup(ctx)` 注册 hooks |
| 短入口注入 | `experimental.chat.messages.transform` 修改消息副本 | `ctx.session.hook("context")` 修改请求中的 system 上下文 |
| 项目定位 | 插件实例的 `directory` | 根据 session ID 取得实际会话目录 |

两者复用短入口生成和知识技能，都不把入口写入原始聊天记录。同一项目只启用一种插件协议；V1/V2 用户共用仓库时需要明确选择和切换，不支持两份入口同时活动。协议差异见[官方迁移说明](https://opencode.ai/v2/docs/build/plugins/migrate-v1/)。

普通 `refresh` 保留已安装协议，即使本机二进制已升级也不会静默切换。主动切换先看具体文件变更：

```bash
mini-trellis refresh --opencode --opencode-version 2 --dry-run
mini-trellis refresh --opencode --opencode-version 2
```

改为 `1` 可切回。只移除 manifest 证明未修改的旧托管入口；插件资产有本地修改或未托管时，切换在写入前停止，其他插件保留。项目 package.json 按结构合并，保留宿主固定的 SDK 版本和用户依赖；结构无效或 CommonJS 类型与 V2 不兼容时停止更新。两套入口并存会报告冲突。`doctor` 报告本机版本/插件协议不一致和最近 hook 结果，不证明模型送达。

卸载保留共享的 `.opencode/package.json`，包括宿主或其他插件使用的 SDK 依赖。

协议目标为 V1 1.18.29、V2 2.2.0。V1 SQLite 读取器不解析 V2 的 `session_v2`/`session_message` 历史。`opencode-v2-history-unsupported` 表示这些对话被跳过，零命中时也不能据此判断没有项目记忆。已保存的项目 Markdown 和 V1 历史仍可读取。

## CodeBuddy CLI 与 IDE

需要 0.3.5：

```bash
mini-trellis init -u 你的名字 --codebuddy -y
```

两端共用 `.codebuddy/settings.json` 和 `.codebuddy/skills/`，共同的记录入口是 `mini-trellis-remember` 技能。CLI 还会将 `.codebuddy/commands/mini-trellis/remember.md` 加载为 `/mini-trellis:remember`，正文由同一份共享说明生成。只需安装一次，写入规则相同。在 CodeBuddy 中按提示登录并审核项目/hook 信任；mini-trellis 不修改 API、模型或全局信任。修改 hook 配置后新开会话。

用 `mini-trellis-remember` 技能记录确认的结论（CLI 也可 `/mini-trellis:remember`），优先更新原主题。`mem recall`/`mem read` 可查已保存的项目知识；不解析 CodeBuddy 转录本。

重复 init/refresh 保留用户 hook、环境和权限。非法 JSON、settings 为数组/null、hook 分组或 matcher 无效时，先停止宿主更新，不覆盖原文件。`doctor` 报告注册缺失和最近运行错误；未观察到运行保持 unknown。

## 在 Cursor 里

```bash
mini-trellis init -u 你的名字 --cursor -y
```

init 会写入 `AGENTS.md` 里的托管说明、`.cursor/skills/` 下的三个技能，以及只注册 `sessionStart` 的 `.cursor/hooks.json`。记录用技能 `mini-trellis-remember`。找回用 `mini-trellis mem recall`，摘录缺条件时再 `mem read`。

Cursor 本地 `sessionStart` 短入口已在 3.27.22 验证。hook 日志成功本身不能证明模型收到或使用内容。短入口不可用时，也可以使用 `AGENTS.md` 和 `mem recall`。Cursor 托管云端不运行 `sessionStart`，自托管机器仍未验证。不解析 Cursor 对话历史。

第一次这样走：

1. 在项目根执行上面的 init。
2. 新开一个本地 Agent 对话。`mini-trellis doctor` 里 `cursor` 和 `cursor-trigger` 应为 ok。hook 还没在磁盘留下记录时，`cursor-runtime` 是 unknown。
3. 确认一条规则。让 Agent 更新已有主题；没有合适文件时再写一篇短 spec，然后使用 `mini-trellis-remember`。核对主题正文、journal 链接和 index。
4. 再开一个对话，对这条规则执行 `mem recall`。摘录里要还在条件和来源。

再次 init 或 refresh 会保留 `.cursor/hooks.json` 里不相干的 hook，也会保留用户写的 `version`。文件不是合法 JSON 或 hook 结构无效时，init 打印 `Skipped .cursor/hooks.json` 并留下原文件，refresh 停在 conflict。`doctor` 会对这些错误以及缺失的 mini-trellis `sessionStart` 注册报告 `cursor-config`。

| 看到什么 | 怎么处理 |
| --- | --- |
| Hooks 日志里没有加载项目 `sessionStart` | 打开的是含 `.cursor/hooks.json` 的项目根。 |
| `cursor-runtime` 为 unknown | 还没有成功的 hook 记录。开一轮本地 Agent 对话，再看 `.trellis/.runtime/hooks/cursor.json`。 |
| hook 成功了，模型却没有 recall 说明 | 看 `AGENTS.md`，直接说 `mini-trellis mem recall`。日志里的 merged 不是送达。 |
| `cursor-config` 警告 | 按详情处理：先修正 JSON 或 hook 结构错误；缺少注册时运行 `init --cursor` 补回。用户 hook 会保留。 |
| Cursor 托管云端 Agent | 不跑 `sessionStart`。仓库里的笔记还在，需要时自己 recall。 |

## 从 Trellis 迁过来

迁移前请备份项目知识和自定义配置，包括被 Git 忽略的文件。迁移命令不会自动创建备份。

```bash
mini-trellis migrate --dry-run
mini-trellis migrate
```

`--dry-run` 只列出会改什么。迁移会换掉 Trellis 的说明入口，重写 mini-trellis 的脚本，并把 `.trellis/tasks/` 收进 research。`.trellis/spec/`、`research/`、`workspace/` 保留。缺少 `.trellis/.gitignore` 时会补上，让本地身份与运行状态保持在 Git 之外；已有用户规则会保留。`-y` 跳过提问，并把任务文件归档到 `<topic>/legacy/`。迁完之后，项目现状的维护和新项目一样，见[维护项目现状](#维护项目现状)。

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

## 把选定历史整理成项目知识

此入口位于尚未发布的 0.3.6 源码中。更新 CLI 后，已有项目先运行 `mini-trellis refresh --dry-run`、`mini-trellis refresh` 刷新技能；新装项目自带同一入口。在 Agent 中要求使用 **mini-trellis-session-insight**，无需新增 CLI 命令，也不会后台扫描历史。

如果已有聊天记录、尚未写项目文档，选好材料后发起一次整理请求：

```text
请用 mini-trellis-session-insight 整理 Claude 会话 <完整 id> 中关于回调的完整讨论，
形成下一次开发能用的项目知识。有合适的 README/docs/spec/research 就更新原文件，
保留来源、确认结论、纠正与例外；实质冲突集中向我提问。
```

在项目中用 `mini-trellis mem list --platform claude --json --limit 10` 获取完整 id。原始历史读取支持 Claude Code、Codex、OpenCode V1 和 Pi；其他宿主可明确提供 Markdown/纯文本导出：

```text
请用 mini-trellis-session-insight 整理我提供的 exports/callback-chat.md，
只使用这份导出作为历史材料，更新已有项目文档。
```

Agent 分段读取选定材料，结合当前文档及必要的代码/测试核对，将已实现行为、已确认待实现规则和建议分开。历史中的命令只作证据，不作为当前执行指令。来源缺失、说话人不清、未读部分和冲突会说明；有界摘录不能冒充完整历史。OpenCode V2、CodeBuddy、Cursor、DeepSeek Harness 的原始历史仍不解析。

明确确认且适用的知识可以在此次请求内直接保存，不逐条重复确认。已有文件沿用原语言，新笔记跟随指定或讨论语言；回读实际主题后，再以 `--no-commit` 写简短 journal 链接并核对 journal/index。重复整理没有新知识、或材料没有可复用内容时，不新建笔记或日志。部分写入失败会如实报告，只补未完成部分。除非另行要求，不创建 Git 提交。

在**新会话**中，直接让 Agent 用已保存的知识完成小任务：

```text
请按项目已记录的回调规则补一条重试上限测试。用 mini-trellis mem recall 找到现行规则，
保留例外，不推测材料中没有确认的行为。
```

## 开发过程中记什么

值得留下的只有以后还会用到的结论。

| 发生了什么 | 记在哪里 | 怎么说 |
| --- | --- | --- |
| 定下「回调必须带幂等键」 | `.trellis/spec/` | 对 Agent 说：把这条写成项目约定，并更新已有的 spec。 |
| 查了支付平台文档，重试最多两次 | `.trellis/research/` | 对 Agent 说：按这个主题更新研究笔记，写上结论、条件和文档链接。 |
| 试过先去重再记账，对账对不上，放弃了 | 同一篇研究笔记 | 标明这是 rejected，不要写成当前规则。 |
| 这次改了哪个文件、测试是否通过 | `.trellis/workspace/<你>/` 的 journal | 会话结束前执行对应宿主的 `remember`。 |

journal 只记过程和主题路径。正文保留在已有主题文件里，也可以是原本就在维护的 README 或 docs；没有合适文件时再写入 spec 或 research。

## 维护项目现状

项目今天是什么，只留一份说明。已经写在 README、docs 或 spec 里的，改那一处。没有合适的文件时，再写一篇短 spec。不要把同一段说明复制成第二份。

可以对 Agent 说：

```text
根据当前代码更新项目说明，保留已经确认的能力、架构和约束；不确定的部分标明待核实。
```

说明里写清用途、已实现能力、主要模块和约束。已实现能力要核对当前代码或测试：已确认的决定、常量或配置值本身不能证明行为已经实现。已约定或规划中的行为要与已实现能力分开。只改相关章节。普通改名或排版不重写整篇说明，也不记一条 journal；如果文中引用的符号或路径因此过时，仍要同步修正。

中文讨论去改一篇英文旧说明时，正文保持英文，含义、限额和否定不变。确认之后，现行说明和 journal 里的链接一致。下一轮用 `mem recall` 找回的是更新后的内容，旧 journal 仍可查，但不代替现行说明。

已经装过的项目要先 `mini-trellis refresh`，`--topic` 才接受根目录的 `README*.md`，以及 `docs/`、`doc/` 下的 Markdown。

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

要找更早的条件，可以加 `--grep "<关键词>"` 定位原始轮次；压缩摘要不会作为关键词命中或相邻摘录返回。Codex 的 compact 提示会在下一条用户消息开始时交付。

三种失败分开说。没有会话 id 时，提示保持通用，不改绑另一场。历史文件还没落盘时，命令警告这场会话没有可读历史，然后以 `session not found` 退出。文件不可读时，警告写明读不了这场会话。这两条警告分别是 `session-history-missing` 和 `session-history-unreadable`。

OpenCode 和 Pi 还没有这种精确会话恢复。它们的启动文案不会点名当前会话 id。查笔记用 `mem recall` 和 `mem read`。要看 OpenCode V1 或 Pi 历史，用 `mem list --platform opencode` 或 `--platform pi`，再用列表里的完整 id 调 `mem context`。不解析 OpenCode V2 或 CodeBuddy 对话历史。

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
| `platforms` | 没有发现宿主。加上 `--claude`、`--codex`、`--opencode`、`--pi`、`--dsh` 或 `--cursor`。 |
| `<host>-runtime` 为 unknown | 还没有一次真实 hook 记录。开一轮宿主会话。Codex 要先信任项目 hook。Cursor 还要分开看：hook 记录出现，也不等于短入口进了模型提示。 |
| `cursor-config` | `.cursor/hooks.json` 无效或 mini-trellis 启动 hook 没有注册。按详情处理；无效配置会保留。 |
| `<host>-runtime` 为 warn | 最近一次 hook 没有干净结束。明细里有状态和错误类别。 |
