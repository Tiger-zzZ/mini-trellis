# Agent 配置

以下集成都可以使用项目 Markdown。启动入口、原始对话读取和 compact 恢复因平台而异。本页对应 v0.3.8。

<a id="capabilities"></a>
## 平台能力

| Agent | 初始化参数 | 知识入口 | 本地历史 | compact 交接 |
| --- | --- | --- | --- | --- |
| Claude Code | `--claude` | SessionStart | 支持 | 当前会话与压缩边界 |
| Codex | `--codex` | 信任后的项目 Hook | 支持 | 当前会话与压缩边界 |
| Cursor | `--cursor` | 本地 sessionStart 与技能 | — | 已保存的项目文档 |
| OpenCode V1 | `--opencode --opencode-version 1` | 插件 | 支持 | 手动选择会话 |
| OpenCode V2 | `--opencode` | 每次模型请求 | — | 已保存的项目文档 |
| Pi | `--pi` | 扩展与命令 | 支持 | 手动选择会话 |
| Oh My Pi (OMP) | `--omp` | 原生扩展与命令 | — | 已保存的项目文档 |
| Kiro CLI V3 / IDE 1.x | `--kiro` | SessionStart 与技能 | — | 已保存的项目文档 |
| DeepSeek Harness | `--dsh` | 项目说明与技能 | — | 已保存的项目文档 |
| CodeBuddy CLI / IDE | `--codebuddy` | SessionStart 与技能 | — | 已保存的项目文档 |
| ZCode | `--zcode` | 信任后的 SessionStart | — | 已保存的项目文档 |

“—”表示尚未解析该平台的原始对话。可以提供 Markdown/文本导出供 [session-insight](history_CN.md) 整理。同一仓库可组合多个初始化参数。

<a id="claude"></a>
## Claude Code

```bash
mini-trellis init -u your-name --claude
```

在 Claude Code 中审查项目与 Hook 提示，再开启新会话。记录使用 `/mini-trellis:remember`。历史读取来自 Claude 的本地项目存储；compact 交接提供完整会话 ID 后，可使用 `mem context --platform claude` 查找。

## Codex

```bash
mini-trellis init -u your-name --codex
```

1. 在项目目录启动 Codex，确认项目信任提示。
2. 在 `/hooks` 中审查并批准项目 Hook。
3. 当前 Codex 版本要求显式开启时，在用户配置的 `[features]` 下启用 `hooks = true`。
4. 运行 `mini-trellis doctor`，再开启新会话。

记录使用 `$mini-trellis-remember`。项目信任和 Hook 信任分别检查。读取历史时使用 `--platform codex`，并从 JSON 结果或 compact 提示中取得完整会话 ID。


<a id="cursor"></a>
## 在 Cursor 里

```bash
mini-trellis init -u 你的名字 --cursor -y
```

init 会写入 `AGENTS.md` 里的托管说明、`.cursor/skills/` 下的三个技能，以及只注册 `sessionStart` 的 `.cursor/hooks.json`。记录用技能 `mini-trellis-remember`。找回用 `mini-trellis mem recall`，摘录缺条件时再 `mem read`。

Cursor 本地 `sessionStart` 短入口已在 3.27.22 验证。确认整体使用效果时，新开会话并让 Agent 找回一条已保存的规则。短入口不可用时，也可以使用 `AGENTS.md` 和 `mem recall`。Cursor 托管云端不运行 `sessionStart`，自托管机器仍未验证。不解析 Cursor 对话历史。

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
| hook 成功了，模型却没有 recall 说明 | 根据 `AGENTS.md` 的项目入口，在新会话中明确要求执行 `mini-trellis mem recall`。 |
| `cursor-config` 警告 | 按详情处理：先修正 JSON 或 hook 结构错误；缺少注册时运行 `init --cursor` 补回。用户 hook 会保留。 |
| Cursor 托管云端 Agent | 不跑 `sessionStart`。仓库里的笔记还在，需要时自己 recall。 |

<a id="opencode"></a>
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

改为 `1` 可切回。只移除 manifest 证明未修改的旧托管入口；插件资产有本地修改或未托管时，切换在写入前停止，其他插件保留。项目 package.json 按结构合并，保留宿主固定的 SDK 版本和用户依赖；结构无效或 CommonJS 类型与 V2 不兼容时停止更新。两套入口并存会报告冲突。`doctor` 报告本机版本/插件协议不一致和最近 hook 结果，可在新会话中进一步检查 Agent 是否收到入口。

卸载保留共享的 `.opencode/package.json`，包括宿主或其他插件使用的 SDK 依赖。

协议目标为 V1 1.18.29、V2 2.2.0。V1 SQLite 读取器不解析 V2 的 `session_v2`/`session_message` 历史。`opencode-v2-history-unsupported` 表示这些对话被跳过，该告警只涉及 V2 对话来源。已保存的项目 Markdown 和 V1 历史仍可读取。

<a id="codebuddy"></a>
## CodeBuddy CLI 与 IDE

需要 0.3.5：

```bash
mini-trellis init -u 你的名字 --codebuddy -y
```

两端共用 `.codebuddy/settings.json` 和 `.codebuddy/skills/`，共同的记录入口是 `mini-trellis-remember` 技能。CLI 还会将 `.codebuddy/commands/mini-trellis/remember.md` 加载为 `/mini-trellis:remember`，正文由同一份共享说明生成。只需安装一次，写入规则相同。在 CodeBuddy 中按提示登录并审核项目/hook 信任；mini-trellis 不修改 API、模型或全局信任。修改 hook 配置后新开会话。

用 `mini-trellis-remember` 技能记录确认的结论（CLI 也可 `/mini-trellis:remember`），优先更新原主题。`mem recall`/`mem read` 可查已保存的项目知识；不解析 CodeBuddy 转录本。

重复 init/refresh 保留用户 hook、环境和权限。非法 JSON、settings 为数组/null、hook 分组或 matcher 无效时，先停止宿主更新，不覆盖原文件。`doctor` 报告注册缺失和最近运行错误；未观察到运行保持 unknown。



<a id="zcode"></a>
## ZCode（智谱/Z.ai）

安装与 Codex 共用的 `.agents/skills/` 三项项目技能，并在 `.zcode/config.json` 注册 SessionStart hook：

```bash
mini-trellis init -u 你的名字 --zcode -y
```

桌面版启动 ZCode App，在「设置 → 钩子」选择当前项目，审查 `.zcode/hooks/session-start.py` 后点击「信任」，随后开启新会话，载入项目知识入口。

独立 ZCode CLI 使用宿主显示的工作区路径运行：

```bash
zcode skills list --cwd . --json
zcode hooks trust review --workspace . --json
```

审查命令与脚本，再授予返回的 `hookDeclarationDigest` 并检查结果：

```bash
zcode hooks trust grant --workspace . --hook-digest <审查到的-hookDeclarationDigest>
zcode hooks trust status --workspace . --json
mini-trellis doctor
```

使用 `$mini-trellis-remember` 或同名技能记录已确认的决定。已有主题沿用原语言，journal 链接指向更新后的文件。`mini-trellis-session-insight` 通过 `mem recall`/`mem read` 找回项目知识，也可将提供的 Markdown/文本整理为项目文档。

compact 后，`AGENTS.md` 引导 Agent 继续读取同一份已保存知识与技能。ZCode 桌面 3.17.2 / core 0.17.1 在新会话启动时执行入口，compact 后沿用宿主提供的项目指引。

init 和 refresh 保留用户配置、hook 和其他技能。刷新改变 hook 声明后，在 ZCode 中重新审查。若 `.zcode/skills/` 已有同名技能，先移动或改名，再安装共享技能。`doctor` 显示项目注册与最近观察到的执行；信任状态通过 ZCode 钩子面板或 `trust status` 查看。

<a id="pi"></a>
<a id="pi-and-omp"></a>
## Pi / Oh My Pi (OMP)

使用 mini-trellis 0.3.8 或更新版本，按实际宿主选择：

```bash
# Pi
mini-trellis init -u your-name --pi -y
pi

# Oh My Pi（OMP）
mini-trellis init -u your-name --omp -y
omp
```

在项目根目录执行。Pi 使用 `.pi/extensions/`、`.pi/prompts/` 和共享的 `.agents/skills/`；OMP 使用原生 `.omp/extensions/`、`.omp/prompts/`、`.omp/skills/`。两者通过 `before_agent_start` 加载同一份简短记忆入口，OMP 会自动发现安装的资源。同一项目使用两者时，初始化加上 `--pi --omp`。

已有 mini-trellis 项目，使用新版本 CLI 更新宿主资源：

```bash
mini-trellis refresh --pi
# 在同一项目添加或更新 OMP：
mini-trellis refresh --omp
```

Pi 按宿主提示确认项目信任，安装或刷新后新开宿主会话。模型沿用各宿主的常规配置。在对话中可单独运行 `/mini-trellis-remember` 整理本次讨论，也可直接附上确认结论：

```text
/mini-trellis-remember 仅幂等回调自动重试，最多 3 次，首次延迟 427ms；非幂等回调需手动处理。
```

Agent 更新已有主题并回读核对，再写入带主题链接的 journal。下次会话直接询问“项目的回调重试规则是什么”，或在终端运行 `mini-trellis mem recall "回调重试"`。需要整理 Markdown/text 对话导出时，在对话中要求使用 `mini-trellis-session-insight`；维护长期约定时要求使用 `mini-trellis-update-spec`。

Pi 支持检索本地原始会话；OMP 的召回读取已保存的项目 Markdown，整理 OMP 对话时提供 Markdown/text 导出。宿主机制参考官方 [Pi 提示模板](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/prompt-templates.md)与 [OMP 资源发现](https://github.com/can1357/oh-my-pi/blob/v18.18.3/docs/extension-loading.md)。

<a id="kiro"></a>
## Kiro CLI 与 IDE

使用支持独立项目 Hook 的 Kiro CLI V3 或 IDE 1.x：

```bash
mini-trellis init -u 你的名字 --kiro -y
kiro-cli chat --v3
```

打开项目并按 Kiro 提示信任工作区。`.kiro/hooks/mini-trellis.json` 注册 SessionStart，`.kiro/skills/` 提供 remember、session-insight、update-spec 三项技能。新会话载入简短项目入口；用 `/mini-trellis-remember` 保存已确认结论，后续通过 `mini-trellis mem recall <关键词>` 召回。compact 后通过 `AGENTS.md` 和 recall 继续读取已保存的项目知识。

`refresh --kiro` 更新项目资产，`doctor` 检查注册与最近执行。已有 Trellis 项目使用 `mini-trellis migrate`，将 Trellis 技能、Agent 配置和流程 Hook 替换为此项目入口。接入采用 Kiro 当前的[独立 Hook 格式](https://kiro.dev/docs/hooks/)与 [Agent Skills](https://kiro.dev/docs/skills/)。

<a id="dsh"></a>
## DeepSeek Harness

```bash
mini-trellis init -u your-name --dsh
```

安装内容包括 `.dsh/skills/` 和项目说明。通过 `mini-trellis-remember` 技能记录，需要项目知识时调用 `mem recall`。该平台没有项目级 SessionStart 集成，DSH 压缩转录格式暂未解析。
