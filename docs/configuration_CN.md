# 配置与团队共享

项目配置位于 `.trellis/config.yaml`。新安装使用默认值即可，需要调整行为时再覆盖对应设置。

## 配置项

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| `session_auto_commit` | `false` | `add_session.py` 完成后提交日志与索引变更 |
| `session_commit_message` | `[mini-trellis] journal` | 自动提交使用的说明 |
| `max_journal_lines` | `2000` | 日志达到行数阈值后轮换文件 |
| `packages` | 未设置 | 包名到路径的映射，用于启动时筛选 spec 索引 |
| `default_package` | 未设置 | 适用时使用的默认包 |

```yaml
session_auto_commit: false
session_commit_message: "[mini-trellis] journal"
max_journal_lines: 2000
```

`session_auto_commit: true` 会暂存并提交记录文件。迁移项目在记录前应检查该设置。历史整理技能即使遇到自动提交配置，也会使用 `--no-commit`。

## Monorepo

```yaml
packages:
  api:
    path: packages/api
  web:
    path: packages/web
default_package: api
```

包配置帮助启动入口选择 spec 索引。统一召回仍在仓库范围发现文档，这些设置不创建独立搜索索引或项目权限。

<a id="sharing"></a>
## 共享项目知识

通过正常的 Git 变更审阅规范与调研。每位贡献者使用独立的开发者名称维护日志目录，按自己使用的 Agent 初始化集成。

生成的 `.trellis/.gitignore` 排除本地身份和运行状态，同时保留已有忽略规则。根据仓库共享约定决定跟踪哪些知识与日志；已经被 Git 跟踪的文件，需要显式调整后才会停止跟踪。

Agent 原始对话保留在产生记录的机器上。通过 Git 共享 Markdown 时，原始聊天记录不会一并共享。需要让队友使用的决定，应整理到合适的项目文档。

## 数据处理

记忆 CLI 读取本地文件，不提供上传服务。编程 Agent 可能把检索到的文本放入请求，发送到其配置的模型服务。按项目的数据约定审阅摘录、导出对话与 Git 变更。

## 集成文件维护

初始化与刷新会按支持的结构合并 Agent 配置，保留无关设置。manifest 记录生成的资产；本地改过的资产在刷新时会显示冲突。解决冲突前，备份自定义内容并检查具体路径。详见[升级与刷新](upgrade_CN.md)。
