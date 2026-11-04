# 下一版 — Cursor 接入与项目现状维护

状态：未发布。以下内容对应 [PR #9](https://github.com/Tiger-zzZ/mini-trellis/pull/9) 的 0.3.3、0.3.4 计划工作包，已完成阶段验收；当前 npm 版本仍为 0.3.2。

## 0.3.3 工作包：Cursor 接入收口

- 真实本地会话验证生成的 `.cursor/hooks/session-start.py` 短入口送达，走通确认、记录、更新和新会话找回。
- `init` 保留并提示无效 Cursor 配置；`refresh` 遇到配置冲突停止；`doctor` 报告结构错误或缺失的 mini-trellis 启动注册。合法的用户 command/prompt hooks、版本值和其他字段保留。
- 同步安装、日常使用、排障与宿主能力边界说明。

## 0.3.4 工作包：维护一份准确的项目现状

- 已有 README、docs 或 spec 就更新原文件，没有合适文件才新建短 spec；更新时保持原文件语言。
- 已实现能力核对代码或测试。已确认但尚未实现的约定、未使用的常量与愿景单独写明。
- 确认决定后更新同一篇说明，再用 journal 链接实际更新的文件。改名同步修正符号与路径引用；仅改名或排版不新增 journal。
- `add_session.py --topic` 支持根目录 `README*.md`、`docs/` 和 `doc/` 下的 Markdown，继续校验真实文件与项目范围。它只校验路径和写入 journal，不代替模型更新或检查正文含义。

## 验收中补齐的修复

- 迁移或增加宿主时补齐缺失的 `.trellis/.gitignore`，保留已有用户规则。本地身份与运行状态不进入 Git；不会取消对已跟踪文件的跟踪。
- CI 固定到 Ubuntu 24.04，保留 Python 3.9 最低版本验证。

产品提交 `bc02da58` 的[远端 CI](https://github.com/Tiger-zzZ/mini-trellis/actions/runs/41770768212) 全部通过：552 项测试通过，1 项既有跳过；类型检查、lint、构建和产物检查通过。

## 已验证范围

真实宿主为 Cursor 3.27.22、Cursor Grok 4.6 Medium、This Mac。原生短入口送达、空项目与 Trellis 迁移项目自主选择维护文件、原文语言、同篇更新、改名与排版均有实测。迁移项目最后的新会话已找回新约定，但完整差异与来源答复被 Cursor 用量上限中止；该限制已由项目维护者接受，未记作完整答复实测通过。

hook 日志成功本身不证明模型收到或使用内容。Cursor 托管云端不运行 `sessionStart`，自托管机器和其他版本、模型未验证。不解析 Cursor 对话历史，不新增逐轮注入。v0.3.1 的耗时与 token 对比没有在本轮重跑。

## 发布后如何升级

先备份项目知识和自定义配置，包括被 Git 忽略的文件。正式发布后，已有 mini-trellis 项目执行：

```sh
mini-trellis upgrade
mini-trellis refresh --dry-run
mini-trellis refresh
mini-trellis doctor
```

`refresh` 更新未被本地修改的受管文件，保留项目知识；遇到冲突按详情处理。已有安装必须升级 CLI 并刷新项目脚本，才能使用新的主题路径校验和技能说明。完成后新开会话。

从 Trellis 迁入仍先执行 `mini-trellis migrate --dry-run`，确认后执行 `mini-trellis migrate`，再为实际使用的宿主执行 `init`。详见[日常使用](../using_CN.md)和[迁移指南](../migration_CN.md)。
