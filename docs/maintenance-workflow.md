# mini-trellis 维护与发布工作流

适用于功能修复、PR 验收、合并、版本标签和官网同步。以当前需求为范围，沿用短入口、共享技能与按需读取的设计；实现和测试达到使用效果后进入交付。

## 分工与维护位置

- Agent 完成代码修复、相称验收、文档更新，以及已获授权的推送、PR 合并、标签和官网发布。会话中的明确授权持续有效，例行后续步骤直接执行。
- 维护者手动发布 npm。默认流程到代码、标签和官网交付为止；另有明确授权时才代为发布 npm。
- [代码仓库](https://github.com/Tiger-zzZ/mini-trellis)保存实现、README、双语使用指南、版本说明和本工作流；[官网仓库](https://github.com/mini-trellis/mini-trellis.github.io)保存首页、版式和由指南生成的双语页面。官网链接到本工作流。
- 两个包的版本以 `packages/core/package.json`、`packages/cli/package.json` 为准，保持一致。标签使用精确的 `vX.Y.Z`，例如 `v0.3.7`。

## 1. 确认需求与基线

读取适用的 `AGENTS.md`、当前实现、调用链及已有验收记录。记录本次范围、目标版本、PR、主分支与各 PR 的最新 SHA，检查工作区、worktree 和远端状态。

保留用户已有改动，使用独立功能分支；需要隔离时建立 worktree。按会话约定处理工作区，本项目收尾默认使用不带 stash 的检查方式。模型、账号、Hook 信任沿用用户已选配置和授权；真实测试需要新选择时再提问。凭据留在宿主配置中。

## 2. 修复与相称验收

先复现问题，再做最小修复。代码缺陷增加能复现原问题的针对性回归；文案调整以版本、链接和构建检查为主。按“入口 → 核心逻辑 → 边界 → 输出”核验结果。

新增宿主接入时，核心流程覆盖：安装与信任、新会话入口送达、记录一条确认结论、更新同主题、新会话召回。检查实际主题、journal/index 及链接，确认条件、否定和原文语言得到保留。Hook 执行日志与模型实际收到入口分别记录。compact/resume 仅在本次功能涉及或已有疑点时追加验证。

复用同一代码版本已有的有效证据，核心流程通过后停止扩展测试。出现新失败、代码变化或未解决疑点时再补充验证。多个 PR 一起发布时，在合并后的组合树上检查一次。

代码发布的常规检查如下；依赖已满足时复用现有环境，依赖变化才按锁文件安装：

```bash
pnpm typecheck
pnpm --filter mini-trellis lint:py
pnpm lint
pnpm build
pnpm test
node packages/cli/scripts/release-preflight.js check-versions
node packages/cli/scripts/release-preflight.js verify-packed-cli
git diff --check
```

构建在测试前执行，供真实 CLI 集成测试使用。CI 另检查最低 Python 版本的语法兼容。记录实际结果和已有 skip；存在阻断缺陷时完成修复与相关复跑。

## 3. 同步版本与文档

同步两个 package 版本、双语 README、CHANGELOG、`docs/releases/vX.Y.Z.md` 和受影响的使用说明。官网同步中英文首页、版本标识、新版本页、安装/使用/命令/宿主/升级页及导航链接。

公开文案直接说明功能、使用步骤和适用范围。验收环境、过程和详细证据放入 PR 或本地验收记录。官网使用正式版本文案；npm 由维护者手动完成，无需写“待发布”等过程状态。历史版本页保留原版本信息。

## 4. 提交与合并 PR

检查最终 diff 和暂存内容。当前 pre-commit 会调用 lint-staged 和完整测试；使用不带 stash 的检查时，手动运行下面命令及本次所需检查，通过后以 `HUSKY=0 git commit` 提交，并如实记录已执行的检查：

```bash
pnpm exec lint-staged --no-stash --no-hide-partially-staged
```

推送已授权的功能分支，更新 PR 标题与正文，写清最终行为和验证结果。核对最新 head SHA 对应的 CI、审查意见和可合并状态。多个相互依赖的 PR 按依赖顺序合并，每次使用核对过的 head SHA；合并基线改变后检查后续 PR 的状态。

## 5. 标记主分支版本

合并后 fetch 并快进本地主分支，确认它与远端一致、包含已验收提交，且包版本匹配。最终树若因冲突解决而改变，补查受影响部分。

先查询远端是否已有目标标签。远端已存在且指向本次提交时复用；指向其他提交时查明版本归属再决定。若只有本地存在继承自上游的同名旧标签，先把旧对象保存到 `refs/archive/legacy-tags/<tag>`，再创建本次标签。

```bash
git ls-remote origin 'refs/tags/vX.Y.Z*'
GITHUB_REF_NAME=vX.Y.Z node packages/cli/scripts/release-preflight.js check-versions --require-tag
git tag -a vX.Y.Z -m 'mini-trellis vX.Y.Z' <已核对的-main-SHA>
git push origin refs/tags/vX.Y.Z
```

只推本次标签，并核对远端标签解引用后的提交与主分支一致。发布脚本可能同时 bump、提交和推送；已有目标版本和标签时直接执行对应步骤。

## 6. 发布官网

在官网仓库最新主分支上创建文档分支，检查页面链接、双语版本与日期、导航及新页面的语言切换。提交并推送，按官网仓库现有流程更新主分支：使用 PR 时核对 head 后合并；沿用直接 Git 推送时，先确认远端基线，再以快进方式推送。

检查 GitHub Pages 对应最新提交的构建与部署状态，再打开线上英文/中文首页、新版本页和主要使用链接。用桌面与移动视口各做一次显示检查即可。以线上部署结果确认完成；本地预览结果标明采用的构建方式。

## 7. npm 手动发布与交付

维护者从已标记版本发布，先 `mini-trellis-core`，确认该版本可查询后再发 `mini-trellis`。使用 pnpm 打包/发布，使 CLI 的 `workspace:*` 转为 core 的确切版本。可使用现有 preflight 辅助核对：

```bash
node packages/cli/scripts/release-preflight.js publish-plan
pnpm --filter mini-trellis-core publish --access public --tag latest
node packages/cli/scripts/release-preflight.js verify-npm --package core
pnpm --filter mini-trellis publish --access public --tag latest
node packages/cli/scripts/release-preflight.js verify-npm
```

以上命令用于稳定版；预发布版按版本后缀选择 dist-tag。发布前查看当前 CI 配置，判断是否有自动发布；标签推送本身不能作为 npm 已发布的依据。

最终交付列出合并 PR、主分支和 tag 提交、官网部署与链接、关键验证结果及 npm 分工。达到这些条件后结束本次维护。


<a id="documentation-source"></a>
## 文档正文与官网同步

主仓库 `docs/index.md` / `docs/index_CN.md` 是完整指南的入口，`docs/` 下的配对 Markdown 与根目录贡献指南是正文维护位置。官网对应页面由 `scripts/sync-docs-site.py` 生成，front matter 的 `source_path` 指向原文件。官网首页、版式、搜索和历史版本页在官网仓库维护。

在主仓库执行，`--site` 显式指定官网工作副本：

```bash
python3 scripts/sync-docs-site.py --site /path/to/mini-trellis.github.io
python3 scripts/sync-docs-site.py --site /path/to/mini-trellis.github.io --check
```

脚本同步明确列出的指南、导航、CLI 版本元数据和 SVG 资源，并转换正文链接。它不删除文件，不提交、不推送、不构建或发布；`--check` 只报告差异。新的指南需加入脚本中的导航清单，并同时提供中英文文件。正文链接、旧页面地址与语言切换需要保持可用。

官网在其工作目录按 README 的步骤构建。检查生成页的本地链接和锚点、语言切换、搜索、复制命令、移动端菜单，以及桌面和移动端的长表格/代码块。两个仓库分别执行 `git diff --check`。历史评测保留实际测量版本；公开能力以选定的发布基线为准。

本地整理可以只交付 worktree 与预览结果。推送、合并和部署按当前会话的明确授权执行。
