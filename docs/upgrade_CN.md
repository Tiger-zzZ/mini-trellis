# 升级、刷新与卸载

在项目根目录更新 CLI 与项目集成。修改受管文件前，先备份自定义配置和项目知识，包括被 Git 忽略的文件。

## 升级 CLI 并刷新项目

```bash
mini-trellis upgrade --dry-run
mini-trellis upgrade
mini-trellis doctor
```

从 0.3.8 开始，`upgrade` 在 npm 更新成功后调用新版 CLI，刷新当前已初始化项目。在未初始化的目录运行时只更新 CLI；其他项目需要分别运行 `mini-trellis refresh`。完成后开启新的 Agent 会话。

默认标签沿用当前版本通道（`latest`、`beta` 或 `rc`）；可用 `--tag 0.3.8` 明确选择版本。`--dry-run` 预览将执行的步骤。

通过 `npm install -g mini-trellis@latest`，或从 0.3.7 及更早版本执行 `upgrade` 时，随后刷新一次项目：

```bash
mini-trellis refresh --dry-run
mini-trellis refresh
mini-trellis doctor
```

已记录的旧模板正常更新时直接完成。本地改动或缺失旧版本记录导致内容冲突时，refresh 列出文件并统一询问 `[y/N]`。输入 `Y` 覆盖列出的文件并完成更新；输入 `N`、直接回车或遇到 EOF，项目保持原样。共享 JSON 配置按结构合并，`AGENTS.md` 保留托管区块之外的说明，项目知识继续保留。清单缺失或损坏时，也可通过同一次确认重新生成。

`refresh --dry-run` 预览更新。需要确认覆盖时，`--json` 或非交互运行会列出相关文件并返回退出码 1；在终端运行 `mini-trellis refresh` 即可确认并完成这些更新。没有内容冲突的更新直接完成。

## 添加 Agent

```bash
mini-trellis init --zcode -y
mini-trellis doctor
```

审查新集成的项目与 Hook 信任提示。仅刷新某个平台时，可使用对应参数，例如 `mini-trellis refresh --codex --dry-run`。

## 切换 OpenCode 协议

普通刷新保留已安装的协议。需要切换时先预览：

```bash
mini-trellis refresh --opencode --opencode-version 2 --dry-run
mini-trellis refresh --opencode --opencode-version 2
```

改为 `1` 可切回 V1。替换的插件资产需要保持未修改且由 manifest 管理，自定义或未托管入口会报告出来供检查。详见 [OpenCode 配置](agents_CN.md#opencode)。

## 从项目卸载

**卸载会删除整个 `.trellis/`，包含规范、调研、日志，以及受管集成文件。** 继续前先保存需要保留的知识和自定义配置。

```bash
mini-trellis uninstall --dry-run
mini-trellis uninstall
```

交互命令会请求确认，`-y` 跳过该提示。单独卸载全局 npm 包不会清理项目文件：

```bash
npm uninstall -g mini-trellis
```

已有 Trellis 的项目，应先按[迁移指南](migration_CN.md)转换，再使用 mini-trellis 的项目维护命令。
